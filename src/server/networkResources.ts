import { ResourceRegistry, type ResourceContent } from "./resourceRegistry";
import { logger } from "../utils/logger";
import {
  getNetworkEventById,
  getNetworkEvents,
  type NetworkEventWithId,
} from "../db/networkEventRepository";
import { NetworkState } from "./NetworkState";

const BODY_TRUNCATION_LIMIT = 10_240; // 10KB

const NETWORK_RESOURCE_URIS = {
  REQUEST: "automobile:network/request/{requestId}",
  TRAFFIC: "automobile:network/traffic",
  LIVE: "automobile://network/traffic/live",
  ERRORS: "automobile://network/traffic/errors",
  SLOW: "automobile://network/traffic/slow",
  STATS: "automobile://network/stats",
  STATE: "automobile://network/state",
  MOCKS: "automobile://network/mocks",
  CONNECTIVITY: "automobile://network/connectivity",
} as const;

const TRAFFIC_QUERY_KEYS = [
  "host",
  "method",
  "statusCode",
  "since",
  "limit",
  "deviceId",
  "bucketSeconds",
] as const;
type TrafficQueryKey = (typeof TRAFFIC_QUERY_KEYS)[number];

function buildQueryTemplate(keys: readonly TrafficQueryKey[]): string {
  const query = keys.map(key => `${key}={${key}}`).join("&");
  return `${NETWORK_RESOURCE_URIS.TRAFFIC}?${query}`;
}

function eventToSummary(event: NetworkEventWithId) {
  return {
    id: event.id,
    timestamp: event.timestamp,
    method: event.method,
    url: event.url,
    host: event.host,
    path: event.path,
    statusCode: event.statusCode,
    durationMs: event.durationMs,
    contentType: event.contentType,
    error: event.error,
  };
}

function eventToDetail(event: NetworkEventWithId) {
  const requestBodyTruncated =
    event.requestBody !== null &&
    event.requestBodySize > BODY_TRUNCATION_LIMIT;
  const responseBodyTruncated =
    event.responseBody !== null &&
    event.responseBodySize > BODY_TRUNCATION_LIMIT;

  return {
    id: event.id,
    timestamp: event.timestamp,
    method: event.method,
    url: event.url,
    statusCode: event.statusCode,
    durationMs: event.durationMs,
    host: event.host,
    path: event.path,
    protocol: event.protocol,
    contentType: event.contentType,
    requestHeaders: event.requestHeaders,
    responseHeaders: event.responseHeaders,
    requestBody: event.requestBody,
    responseBody: event.responseBody,
    requestBodySize: event.requestBodySize,
    responseBodySize: event.responseBodySize,
    requestBodyTruncated,
    responseBodyTruncated,
    error: event.error,
  };
}

function parseTrafficParams(params: Record<string, string>) {
  const since = params.since
    ? parseInt(decodeURIComponent(params.since), 10)
    : undefined;
  const limitRaw = params.limit
    ? parseInt(decodeURIComponent(params.limit), 10)
    : undefined;
  const limit = limitRaw ? Math.min(Math.max(1, limitRaw), 200) : 50;
  const bucketRaw = params.bucketSeconds
    ? parseInt(decodeURIComponent(params.bucketSeconds), 10)
    : undefined;
  const bucketSeconds = bucketRaw && Number.isFinite(bucketRaw) && bucketRaw > 0 ? bucketRaw : undefined;

  return {
    host: params.host ? decodeURIComponent(params.host) : undefined,
    method: params.method ? decodeURIComponent(params.method) : undefined,
    statusCode: params.statusCode
      ? decodeURIComponent(params.statusCode)
      : undefined,
    sinceTimestamp: since && Number.isFinite(since) ? since : undefined,
    limit,
    deviceId: params.deviceId
      ? decodeURIComponent(params.deviceId)
      : undefined,
    bucketSeconds,
  };
}

export interface TimeSeriesBucket {
  bucketStart: number;
  bucketEnd: number;
  requests: number;
  errors: number;
  avgDurationMs: number;
  p50: number;
  p95: number;
}

function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {return 0;}
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {return sorted[lower];}
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

const MAX_BUCKETS = 1000;

export function bucketEvents(events: NetworkEventWithId[], bucketSeconds: number): TimeSeriesBucket[] {
  if (events.length === 0) {return [];}

  const bucketMs = bucketSeconds * 1000;
  const timestamps = events.map(e => e.timestamp);
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);

  // Cap the number of buckets to avoid unbounded memory allocation
  // when sparse events span a large time range
  let bucketStart = Math.floor(minTs / bucketMs) * bucketMs;
  const bucketEnd = Math.floor(maxTs / bucketMs) * bucketMs + bucketMs;
  const totalBuckets = Math.ceil((bucketEnd - bucketStart) / bucketMs);
  if (totalBuckets > MAX_BUCKETS) {
    bucketStart = bucketEnd - MAX_BUCKETS * bucketMs;
  }

  const buckets: Map<number, NetworkEventWithId[]> = new Map();
  for (let ts = bucketStart; ts < bucketEnd; ts += bucketMs) {
    buckets.set(ts, []);
  }

  for (const event of events) {
    const key = Math.floor(event.timestamp / bucketMs) * bucketMs;
    const bucket = buckets.get(key);
    if (bucket) {bucket.push(event);}
  }

  const result: TimeSeriesBucket[] = [];
  for (const [start, bucketEvents] of buckets) {
    const durations = bucketEvents.map(e => e.durationMs).sort((a, b) => a - b);
    result.push({
      bucketStart: start,
      bucketEnd: start + bucketMs,
      requests: bucketEvents.length,
      errors: bucketEvents.filter(e => e.statusCode >= 400).length,
      avgDurationMs: durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0,
      p50: Math.round(computePercentile(durations, 50)),
      p95: Math.round(computePercentile(durations, 95)),
    });
  }

  return result.sort((a, b) => a.bucketStart - b.bucketStart);
}

async function handleTrafficQuery(
  params: Record<string, string>
): Promise<ResourceContent> {
  try {
    const query = parseTrafficParams(params);
    const events = await getNetworkEvents(query);

    if (query.bucketSeconds) {
      const buckets = bucketEvents(events, query.bucketSeconds);
      return {
        uri: NETWORK_RESOURCE_URIS.TRAFFIC,
        mimeType: "application/json",
        text: JSON.stringify({
          timeSeries: buckets,
          bucketSeconds: query.bucketSeconds,
          totalRequests: events.length,
        }, null, 2),
      };
    }

    const response = {
      events: events.map(eventToSummary),
      count: events.length,
      hasMore: events.length >= query.limit,
    };
    return {
      uri: NETWORK_RESOURCE_URIS.TRAFFIC,
      mimeType: "application/json",
      text: JSON.stringify(response, null, 2),
    };
  } catch (error) {
    logger.error(
      `[NetworkResources] Failed to query traffic: ${error}`
    );
    return {
      uri: NETWORK_RESOURCE_URIS.TRAFFIC,
      mimeType: "application/json",
      text: JSON.stringify({ error: `Failed to query traffic: ${error}` }),
    };
  }
}

function registerTrafficTemplates(): void {
  const keyCount = TRAFFIC_QUERY_KEYS.length;
  for (let mask = 1; mask < 1 << keyCount; mask += 1) {
    const keys = TRAFFIC_QUERY_KEYS.filter(
      (_, index) => (mask & (1 << index)) !== 0
    );
    ResourceRegistry.registerTemplate(
      buildQueryTemplate(keys),
      "Network Traffic",
      "Query captured network traffic with optional filters.",
      "application/json",
      handleTrafficQuery
    );
  }
}

export function registerNetworkResources(): void {
  // Base traffic resource (no filters, returns latest 50)
  ResourceRegistry.register(
    NETWORK_RESOURCE_URIS.TRAFFIC,
    "Network Traffic",
    "Query captured network traffic. Use query parameters to filter by host, method, statusCode, since, limit, deviceId.",
    "application/json",
    () => handleTrafficQuery({})
  );

  // Traffic query templates
  registerTrafficTemplates();

  // Single request detail by ID
  ResourceRegistry.registerTemplate(
    NETWORK_RESOURCE_URIS.REQUEST,
    "Network Request Detail",
    "Full HTTP request and response detail for a single captured network call (bodies truncated to 10KB).",
    "application/json",
    async params => {
      const requestId = parseInt(params.requestId, 10);
      if (!Number.isFinite(requestId) || requestId < 1) {
        return {
          uri: `automobile:network/request/${params.requestId}`,
          mimeType: "application/json",
          text: JSON.stringify({ error: `Invalid requestId: ${params.requestId}` }),
        };
      }

      try {
        const event = await getNetworkEventById(requestId);
        if (!event) {
          return {
            uri: `automobile:network/request/${requestId}`,
            mimeType: "application/json",
            text: JSON.stringify({ error: `Network request ${requestId} not found` }),
          };
        }
        return {
          uri: `automobile:network/request/${requestId}`,
          mimeType: "application/json",
          text: JSON.stringify(eventToDetail(event), null, 2),
        };
      } catch (error) {
        logger.error(`[NetworkResources] Failed to get request ${requestId}: ${error}`);
        return {
          uri: `automobile:network/request/${requestId}`,
          mimeType: "application/json",
          text: JSON.stringify({ error: `Failed to retrieve request: ${error}` }),
        };
      }
    }
  );

  // Subscription resources (readable state when notified)
  ResourceRegistry.register(
    NETWORK_RESOURCE_URIS.LIVE,
    "Live Network Traffic",
    "Real-time captured network traffic. Subscribe to receive notifications on new requests.",
    "application/json",
    async () => {
      const events = await getNetworkEvents({ limit: 20 });
      return {
        uri: NETWORK_RESOURCE_URIS.LIVE,
        mimeType: "application/json",
        text: JSON.stringify({ events: events.map(eventToSummary) }, null, 2),
      };
    }
  );

  ResourceRegistry.register(
    NETWORK_RESOURCE_URIS.ERRORS,
    "Network Errors",
    "Recent network errors (4xx/5xx responses). Subscribe to receive notifications on new errors.",
    "application/json",
    async () => {
      const errors = await getNetworkEvents({ minStatusCode: 400, limit: 20 });
      return {
        uri: NETWORK_RESOURCE_URIS.ERRORS,
        mimeType: "application/json",
        text: JSON.stringify({ errors: errors.map(eventToSummary) }, null, 2),
      };
    }
  );

  ResourceRegistry.register(
    NETWORK_RESOURCE_URIS.STATS,
    "Network Stats",
    "Aggregate network statistics with p50/p95 latency. Subscribe to receive notifications when error rate crosses threshold.",
    "application/json",
    async () => {
      const events = await getNetworkEvents({ limit: 200 });
      const totalRequests = events.length;
      const errorCount = events.filter(e => e.statusCode >= 400).length;
      const errorRate = totalRequests > 0 ? errorCount / totalRequests : 0;
      const durations = events.map(e => e.durationMs).filter(d => d > 0).sort((a, b) => a - b);
      const avgDurationMs =
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0;
      const p50 = Math.round(computePercentile(durations, 50));
      const p95 = Math.round(computePercentile(durations, 95));

      const byHost: Record<string, { requests: number; errors: number; p50: number; p95: number }> = {};
      const durationsByHost: Record<string, number[]> = {};
      for (const event of events) {
        const host = event.host ?? "unknown";
        if (!byHost[host]) {
          byHost[host] = { requests: 0, errors: 0, p50: 0, p95: 0 };
          durationsByHost[host] = [];
        }
        byHost[host].requests++;
        if (event.statusCode >= 400) {
          byHost[host].errors++;
        }
        if (event.durationMs > 0) {
          durationsByHost[host].push(event.durationMs);
        }
      }
      for (const host of Object.keys(byHost)) {
        const sorted = durationsByHost[host].sort((a, b) => a - b);
        byHost[host].p50 = Math.round(computePercentile(sorted, 50));
        byHost[host].p95 = Math.round(computePercentile(sorted, 95));
      }

      return {
        uri: NETWORK_RESOURCE_URIS.STATS,
        mimeType: "application/json",
        text: JSON.stringify(
          { totalRequests, errorCount, errorRate, avgDurationMs, p50, p95, byHost },
          null,
          2
        ),
      };
    }
  );

  // Slow requests resource
  ResourceRegistry.register(
    NETWORK_RESOURCE_URIS.SLOW,
    "Slow Network Requests",
    "Recent slow network requests (exceeding configured threshold). Subscribe to receive notifications on new slow requests.",
    "application/json",
    async () => {
      const state = NetworkState.getInstance();
      const thresholdMs = state.slowThresholdMs;
      const events = await getNetworkEvents({ limit: 200 });
      const slow = events.filter(e => e.durationMs >= thresholdMs);
      return {
        uri: NETWORK_RESOURCE_URIS.SLOW,
        mimeType: "application/json",
        text: JSON.stringify({
          thresholdMs,
          events: slow.slice(0, 50).map(eventToSummary),
          count: slow.length,
        }, null, 2),
      };
    }
  );

  // Network state resource
  ResourceRegistry.register(
    NETWORK_RESOURCE_URIS.STATE,
    "Network State",
    "Current network capture and simulation state (capturing, error simulation, notification config).",
    "application/json",
    async () => {
      const state = NetworkState.getInstance();
      return {
        uri: NETWORK_RESOURCE_URIS.STATE,
        mimeType: "application/json",
        text: JSON.stringify(state.getSnapshot(), null, 2),
      };
    }
  );

  // Active mocks resource
  ResourceRegistry.register(
    NETWORK_RESOURCE_URIS.MOCKS,
    "Network Mocks",
    "Currently active mock network response rules.",
    "application/json",
    async () => {
      const state = NetworkState.getInstance();
      const mocks = Array.from(state.getMocks().values());
      return {
        uri: NETWORK_RESOURCE_URIS.MOCKS,
        mimeType: "application/json",
        text: JSON.stringify({
          count: mocks.length,
          mocks,
        }, null, 2),
      };
    }
  );

  ResourceRegistry.register(
    NETWORK_RESOURCE_URIS.CONNECTIVITY,
    "Network Connectivity",
    "Current device network connectivity state. Subscribe to receive notifications on connectivity changes.",
    "application/json",
    async () => {
      return {
        uri: NETWORK_RESOURCE_URIS.CONNECTIVITY,
        mimeType: "application/json",
        text: JSON.stringify({ type: "unknown", details: "Connectivity status requires active device connection" }),
      };
    }
  );

  logger.info("[NetworkResources] Registered network resources");
}
