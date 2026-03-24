import os from "node:os";
import path from "node:path";
import type { Socket } from "node:net";
import { logger } from "../utils/logger";
import { Timer, defaultTimer } from "../utils/SystemTimer";
import { PushSubscriptionSocketServer, getSocketPath, SocketServerConfig } from "./socketServer/index";
import type { TelemetryEvent } from "../features/telemetry/TelemetryRecorder";
import { getNetworkEvents } from "../db/networkEventRepository";
import { getLogEvents } from "../db/logEventRepository";
import { getCustomEvents } from "../db/customEventRepository";
import { getOsEvents } from "../db/osEventRepository";
import { getNavigationEvents } from "../db/navigationEventRepository";
import { getStorageEvents } from "../db/storageEventRepository";
import { getLayoutEvents } from "../db/layoutEventRepository";
import { getDatabase } from "../db/database";
import type { Database } from "../db/types";
import type { Kysely } from "kysely";

const SOCKET_CONFIG: SocketServerConfig = {
  defaultPath: path.join(os.homedir(), ".auto-mobile", "telemetry-push.sock"),
  externalPath: "/tmp/auto-mobile-telemetry-push.sock",
};

interface TelemetryFilter {
  category: string | null; // "network", "log", "custom", "os", "navigation", "crash", "anr", "nonfatal", "storage", "layout", or null for all
  deviceId: string | null;
}

interface TelemetryPushMessage {
  type: "telemetry_push";
  timestamp: number;
  data: TelemetryEvent;
}

export class TelemetryPushSocketServer extends PushSubscriptionSocketServer<
  TelemetryFilter,
  TelemetryEvent
> {
  constructor(socketPath: string = getSocketPath(SOCKET_CONFIG), timer: Timer = defaultTimer) {
    super(socketPath, timer, "TelemetryPush");
  }

  pushTelemetryEvent(event: TelemetryEvent): void {
    const sentCount = this.pushToSubscribers(event);
    if (sentCount > 0) {
      logger.info(`[TelemetryPush] Pushed ${event.category} event to ${sentCount} subscribers`);
    } else if (event.category === "navigation") {
      logger.warn(`[TelemetryPush] No subscribers matched navigation event (${this.getSubscriberCount()} total subs, event deviceId: ${event.deviceId})`);
    }
  }

  protected parseSubscriptionFilter(request: Record<string, unknown>): TelemetryFilter {
    return {
      category: (request.category as string) ?? null,
      deviceId: (request.deviceId as string) ?? null,
    };
  }

  protected matchesFilter(filter: TelemetryFilter, data: TelemetryEvent): boolean {
    if (filter.category !== null && filter.category !== data.category) {
      return false;
    }
    if (filter.deviceId !== null && filter.deviceId !== data.deviceId) {
      return false;
    }
    return true;
  }

  protected override onSubscribed(_subscriptionId: string, filter: TelemetryFilter, socket: Socket): void {
    this.backfillRecentEvents(filter, socket).catch(err =>
      logger.warn(`[TelemetryPush] Backfill failed: ${err}`)
    );
  }

  private async backfillRecentEvents(filter: TelemetryFilter, socket: Socket): Promise<void> {
    const limit = 100;
    const deviceId = filter.deviceId ?? undefined;
    const events: TelemetryEvent[] = [];

    const shouldInclude = (category: string) =>
      filter.category === null || filter.category === category;

    // Run independent backfill queries in parallel
    const [networkRows, logRows, customRows, osRows] = await Promise.all([
      shouldInclude("network") ? getNetworkEvents({ deviceId, limit }) : [],
      shouldInclude("log") ? getLogEvents({ deviceId, limit }) : [],
      shouldInclude("custom") ? getCustomEvents({ deviceId, limit }) : [],
      shouldInclude("os") ? getOsEvents({ deviceId, limit }) : [],
    ]);
    for (const r of networkRows) {
      events.push({ category: "network", timestamp: r.timestamp, deviceId: r.deviceId, data: r });
    }
    for (const r of logRows) {
      events.push({ category: "log", timestamp: r.timestamp, deviceId: r.deviceId, data: r });
    }
    for (const r of customRows) {
      events.push({ category: "custom", timestamp: r.timestamp, deviceId: r.deviceId, data: r });
    }
    for (const r of osRows) {
      events.push({ category: "os", timestamp: r.timestamp, deviceId: r.deviceId, data: r });
    }

    if (shouldInclude("navigation")) {
      const rows = await getNavigationEvents({ deviceId, limit });
      // Look up screenshot node IDs for navigation events
      const screenshotUris: Map<string, string> = new Map();
      if (rows.length > 0) {
        try {
          const db = getDatabase() as unknown as Kysely<Database>;
          const destinations = [...new Set(rows.map(r => r.destination))];
          const nodes = await db
            .selectFrom("navigation_nodes")
            .select(["id", "screen_name", "app_id"])
            .where("screen_name", "in", destinations)
            .execute();
          for (const node of nodes) {
            const key = `${node.app_id}:${node.screen_name}`;
            screenshotUris.set(key, `automobile:navigation/nodes/${node.id}/screenshot`);
          }
        } catch { /* best-effort screenshot URI lookup */ }
      }
      for (const r of rows) {
        const screenshotUri = screenshotUris.get(`${r.applicationId}:${r.destination}`) ?? null;
        events.push({
          category: "navigation",
          timestamp: r.timestamp,
          deviceId: r.deviceId,
          data: { ...r, screenshotUri },
        });
      }
    }

    // Backfill failures (crash/anr/nonfatal) in parallel
    const failureTypes = ["crash", "anr", "nonfatal"] as const;
    const failureBackfillFn = async (failureType: typeof failureTypes[number]) => {
      if (!shouldInclude(failureType)) {return;}
      try {
        const db = getDatabase() as unknown as Kysely<Database>;
        let q = db
          .selectFrom("failure_occurrences")
          .innerJoin("failure_groups", "failure_groups.id", "failure_occurrences.group_id")
          .select([
            "failure_occurrences.id as occurrenceId",
            "failure_occurrences.group_id as groupId",
            "failure_occurrences.timestamp",
            "failure_occurrences.device_id as deviceId",
            "failure_occurrences.screen_at_failure as screen",
            "failure_groups.type",
            "failure_groups.severity",
            "failure_groups.title",
            "failure_groups.stack_trace_json",
          ])
          .where("failure_groups.type", "=", failureType);

        if (deviceId) {
          q = q.where("failure_occurrences.device_id", "=", deviceId);
        }

        const rows = await q.orderBy("failure_occurrences.timestamp", "desc").limit(limit).execute();

        for (const r of rows) {
          let exceptionType: string | undefined;
          let stackTrace: unknown[] | null = null;
          if (r.stack_trace_json) {
            try {
              const frames = JSON.parse(r.stack_trace_json);
              if (Array.isArray(frames)) {
                stackTrace = frames;
                if (frames.length > 0) {
                  exceptionType = frames[0].className ?? frames[0].declaringClass;
                }
              }
            } catch { /* ignore parse errors */ }
          }

          events.push({
            category: failureType,
            timestamp: r.timestamp,
            deviceId: r.deviceId,
            data: {
              type: r.type, occurrenceId: r.occurrenceId, groupId: r.groupId,
              severity: r.severity, title: r.title, exceptionType,
              screen: r.screen, timestamp: r.timestamp, stackTrace,
            },
          });
        }
      } catch (e) {
        logger.warn(`[TelemetryPush] Failed to backfill ${failureType} events: ${e}`);
      }
    };
    await Promise.all(failureTypes.map(failureBackfillFn));

    const [storageRows, layoutRows] = await Promise.all([
      shouldInclude("storage") ? getStorageEvents({ deviceId, limit }) : [],
      shouldInclude("layout") ? getLayoutEvents({ deviceId, limit }) : [],
    ]);
    for (const r of storageRows) {
      events.push({ category: "storage", timestamp: r.timestamp, deviceId: r.deviceId, data: r });
    }
    for (const r of layoutRows) {
      events.push({ category: "layout", timestamp: r.timestamp, deviceId: r.deviceId, data: r });
    }

    // Sort oldest-first so dashboard shows them in correct order
    events.sort((a, b) => a.timestamp - b.timestamp);

    for (const event of events) {
      const msg = this.createPushMessage(event);
      this.sendJson(socket, msg);
    }

    logger.info(`[TelemetryPush] Backfilled ${events.length} events to new subscriber`);
  }

  protected createPushMessage(data: TelemetryEvent): TelemetryPushMessage {
    return {
      type: "telemetry_push",
      timestamp: this.timer.now(),
      data,
    };
  }
}

// Singleton instance
let socketServer: TelemetryPushSocketServer | null = null;

export function getTelemetryPushServer(): TelemetryPushSocketServer | null {
  return socketServer;
}

export async function startTelemetryPushSocketServer(): Promise<TelemetryPushSocketServer> {
  if (!socketServer) {
    socketServer = new TelemetryPushSocketServer();
  }
  if (!socketServer.isListening()) {
    await socketServer.start();
  }
  return socketServer;
}

export async function stopTelemetryPushSocketServer(): Promise<void> {
  if (!socketServer) {
    return;
  }
  await socketServer.close();
  socketServer = null;
}
