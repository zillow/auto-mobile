import { getDatabase } from "../../db/database";
import type { NewRecompositionMetrics } from "../../db/types";
import {
  BootedDevice,
  ObserveResult,
  RecompositionCause,
  RecompositionMetrics,
  RecompositionNodeInfo,
  RecompositionSummary,
  TopRecompositionEntry,
  ViewHierarchyResult
} from "../../models";
import { logger } from "../../utils/logger";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { DefaultElementParser } from "../utility/ElementParser";
import { TelemetryRecorder } from "../telemetry/TelemetryRecorder";

const MAX_RECOMPOSITION_RECORDS = 10000;

interface RecompositionEntryInput {
  id: string;
  composableName?: string;
  resourceId?: string | null;
  testTag?: string | null;
  total: number;
  skipCount: number;
  rolling1sAverage: number;
  durationMs?: number;
  likelyCause: RecompositionCause;
  parentChain?: string[];
  stableAnnotated?: boolean;
  rememberedCount?: number;
  nodeRef: any;
}

interface RecompositionEntryMetrics extends RecompositionEntryInput {
  sinceLastObservation: number;
  sinceLastInteraction: number;
  recompositionsPerSecond: number;
}

export class RecompositionTracker {
  private static instance: RecompositionTracker;
  private lastObservationTotals = new Map<string, number>();
  private lastInteractionTotals = new Map<string, number>();
  private latestTotals = new Map<string, number>();
  private lastObservationAt: number | null = null;
  private lastInteractionAt: number | null = null;
  private latestSummaryByDevice = new Map<string, RecompositionSummary>();
  private readonly parser = new DefaultElementParser();
  private timer: Timer;

  constructor(timer: Timer = defaultTimer) {
    this.timer = timer;
  }

  static getInstance(): RecompositionTracker {
    if (!RecompositionTracker.instance) {
      RecompositionTracker.instance = new RecompositionTracker();
    }
    return RecompositionTracker.instance;
  }

  getLatestSummary(deviceId: string, packageName: string): RecompositionSummary | undefined {
    return this.latestSummaryByDevice.get(`${deviceId}:${packageName}`);
  }

  recordInteraction(): void {
    this.lastInteractionTotals = new Map(this.latestTotals);
    this.lastInteractionAt = this.timer.now();
  }

  async processObservation(result: ObserveResult, device: BootedDevice): Promise<void> {
    if (!result.viewHierarchy?.hierarchy) {
      return;
    }

    const observationTimestamp = this.getObservationTimestamp(result);
    const entries = this.collectEntries(result.viewHierarchy);

    if (entries.length === 0) {
      return;
    }

    const metrics = this.computeMetrics(entries, observationTimestamp);
    this.attachMetricsToNodes(metrics);

    const summary = this.buildSummary(metrics, observationTimestamp);
    result.recompositionSummary = summary;

    const packageName = result.activeWindow?.appId ?? result.viewHierarchy?.packageName;
    if (packageName) {
      this.latestSummaryByDevice.set(`${device.deviceId}:${packageName}`, summary);
    }

    this.latestTotals = new Map(metrics.map(entry => [entry.id, entry.total]));
    this.lastObservationTotals = new Map(this.latestTotals);
    this.lastObservationAt = observationTimestamp;

    await this.storeEntries(metrics, result, device, observationTimestamp);
  }

  private getObservationTimestamp(result: ObserveResult): number {
    if (typeof result.updatedAt === "number") {
      return result.updatedAt;
    }
    if (typeof result.updatedAt === "string") {
      const parsed = Date.parse(result.updatedAt);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return this.timer.now();
  }

  private collectEntries(viewHierarchy: ViewHierarchyResult): RecompositionEntryInput[] {
    const entries: RecompositionEntryInput[] = [];
    const rootNodes = this.parser.extractRootNodes(viewHierarchy);
    const nodesToTraverse = rootNodes.length > 0 && viewHierarchy.hierarchy
      ? rootNodes
      : viewHierarchy.hierarchy
        ? [viewHierarchy.hierarchy]
        : [];

    for (const root of nodesToTraverse) {
      this.parser.traverseNode(root, (node: any) => {
        const props = this.parser.extractNodeProperties(node);
        const recomposition = (props?.recomposition ?? node?.recomposition) as RecompositionNodeInfo | undefined;
        if (!recomposition || !recomposition.id) {
          return;
        }

        const total = this.coerceNumber(recomposition.total);
        if (total === null) {
          return;
        }

        const skipCount = this.coerceNumber(recomposition.skipCount) ?? 0;
        const rolling1sAverage = this.coerceNumber(recomposition.rolling1sAverage) ?? 0;
        const durationMs = this.coerceNumber(recomposition.durationMs) ?? undefined;
        const likelyCause = recomposition.likelyCause ?? "unknown";
        const resourceId = recomposition.resourceId ?? props?.["resource-id"] ?? null;
        const testTag = recomposition.testTag ?? props?.["test-tag"] ?? null;

        entries.push({
          id: recomposition.id,
          composableName: recomposition.composableName,
          resourceId,
          testTag,
          total,
          skipCount,
          rolling1sAverage,
          durationMs,
          likelyCause,
          parentChain: recomposition.parentChain,
          stableAnnotated: recomposition.stableAnnotated,
          rememberedCount: recomposition.rememberedCount,
          nodeRef: node
        });
      });
    }

    return entries;
  }

  private computeMetrics(entries: RecompositionEntryInput[], observationTimestamp: number): RecompositionEntryMetrics[] {
    const deltaSeconds = this.lastObservationAt
      ? Math.max(0, (observationTimestamp - this.lastObservationAt) / 1000)
      : 0;

    return entries.map(entry => {
      const lastTotal = this.lastObservationTotals.get(entry.id) ?? 0;
      const lastInteractionTotal = this.lastInteractionTotals.get(entry.id) ?? lastTotal;
      const sinceLastObservation = Math.max(0, entry.total - lastTotal);
      const sinceLastInteraction = Math.max(0, entry.total - lastInteractionTotal);
      const recompositionsPerSecond = entry.rolling1sAverage > 0
        ? entry.rolling1sAverage
        : deltaSeconds > 0
          ? sinceLastObservation / deltaSeconds
          : 0;

      return {
        ...entry,
        sinceLastObservation,
        sinceLastInteraction,
        recompositionsPerSecond
      };
    });
  }

  private attachMetricsToNodes(entries: RecompositionEntryMetrics[]): void {
    for (const entry of entries) {
      const metrics: RecompositionMetrics = {
        sinceLastObservation: entry.sinceLastObservation,
        sinceLastInteraction: entry.sinceLastInteraction,
        rolling1sAverage: entry.rolling1sAverage,
        total: entry.total,
        skipCount: entry.skipCount,
        durationMs: entry.durationMs
      };

      entry.nodeRef.recompositionMetrics = metrics;
    }
  }

  private buildSummary(entries: RecompositionEntryMetrics[], observationTimestamp: number): RecompositionSummary {
    const totalRecompositions = entries.reduce((sum, entry) => sum + entry.sinceLastObservation, 0);
    const durationValues = entries.map(entry => entry.durationMs).filter((value): value is number => typeof value === "number");
    const averageRecompositionDurationMs = durationValues.length > 0
      ? durationValues.reduce((sum, value) => sum + value, 0) / durationValues.length
      : undefined;
    const deltaSeconds = this.lastObservationAt
      ? Math.max(0, (observationTimestamp - this.lastObservationAt) / 1000)
      : 0;
    const averagePerSecond = deltaSeconds > 0 ? totalRecompositions / deltaSeconds : 0;

    const topRecompositions = entries
      .slice()
      .sort((a, b) => {
        if (b.sinceLastObservation !== a.sinceLastObservation) {
          return b.sinceLastObservation - a.sinceLastObservation;
        }
        return b.recompositionsPerSecond - a.recompositionsPerSecond;
      })
      .slice(0, 10)
      .map((entry, index): TopRecompositionEntry => ({
        rank: index + 1,
        composableName: entry.composableName,
        resourceId: entry.resourceId ?? null,
        recompositionId: entry.id,
        recompCount: entry.sinceLastObservation,
        recompPerSecond: entry.recompositionsPerSecond,
        recompDurationMs: entry.durationMs,
        likelyCause: entry.likelyCause ?? "unknown",
        parentChain: entry.parentChain
      }));

    return {
      totalRecompositions,
      averagePerSecond,
      averageRecompositionDurationMs,
      topRecompositions
    };
  }

  private async storeEntries(
    entries: RecompositionEntryMetrics[],
    result: ObserveResult,
    device: BootedDevice,
    observationTimestamp: number
  ): Promise<void> {
    const packageName = result.activeWindow?.appId ?? result.viewHierarchy?.packageName;
    if (!packageName) {
      return;
    }

    const db = getDatabase();
    const sessionId = new Date(this.timer.now()).toISOString().split("T")[0];
    const timestamp = new Date(observationTimestamp).toISOString();

    try {
      const rows: NewRecompositionMetrics[] = entries.map(entry => ({
        device_id: device.deviceId,
        session_id: sessionId,
        package_name: packageName,
        composable_id: entry.id,
        composable_name: entry.composableName ?? null,
        resource_id: entry.resourceId ?? null,
        test_tag: entry.testTag ?? null,
        total_count: entry.total,
        skip_count: entry.skipCount,
        rolling_1s_avg: entry.rolling1sAverage,
        duration_ms: entry.durationMs ?? null,
        likely_cause: entry.likelyCause ?? null,
        parent_chain_json: entry.parentChain ? JSON.stringify(entry.parentChain) : null,
        stable_annotated:
          entry.stableAnnotated === null || entry.stableAnnotated === undefined
            ? null
            : entry.stableAnnotated
              ? 1
              : 0,
        remembered_count: entry.rememberedCount ?? null,
        timestamp
      }));

      if (rows.length > 0) {
        await db.insertInto("recomposition_metrics").values(rows).execute();
      }

      // Emit layout telemetry for recompositions
      const recorder = TelemetryRecorder.getInstance();
      recorder.setContext(device.deviceId, null);

      // Emit all composables with any recomposition activity, sorted by count desc, top 10
      const active = entries
        .filter(e => e.total > 0)
        .sort((a, b) => b.rolling1sAverage - a.rolling1sAverage)
        .slice(0, 10);
      for (const entry of active) {
        const isExcessive = entry.rolling1sAverage > 2;
        recorder.recordLayoutEvent({
          timestamp: this.timer.now(),
          applicationId: packageName,
          subType: isExcessive ? "excessive_recomposition" : "recomposition",
          composableName: entry.composableName ?? null,
          composableId: entry.id,
          recompositionCount: Math.round(entry.rolling1sAverage),
          durationMs: entry.durationMs ?? null,
          likelyCause: entry.likelyCause ?? null,
          detailsJson: null,
        });
      }

      await this.pruneOldRecords(db);
    } catch (error) {
      logger.error(`[RecompositionTracker] Failed to store recomposition metrics: ${error}`);
    }
  }

  private async pruneOldRecords(db: ReturnType<typeof getDatabase>): Promise<void> {
    try {
      const result = await db
        .selectFrom("recomposition_metrics")
        .select(({ fn }) => fn.count<number>("id").as("count"))
        .executeTakeFirst();

      const count = Number(result?.count ?? 0);
      if (count <= MAX_RECOMPOSITION_RECORDS) {
        return;
      }

      const deleteCount = count - MAX_RECOMPOSITION_RECORDS;
      await db
        .deleteFrom("recomposition_metrics")
        .where("id", "in", db
          .selectFrom("recomposition_metrics")
          .select("id")
          .orderBy("timestamp")
          .limit(deleteCount)
        )
        .execute();
    } catch (error) {
      logger.warn(`[RecompositionTracker] Failed to prune recomposition metrics: ${error}`);
    }
  }

  private coerceNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return null;
  }
}
