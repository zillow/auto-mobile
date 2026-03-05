import { ResourceRegistry, ResourceContent } from "./resourceRegistry";
import { logger } from "../utils/logger";
import {
  buildPerformanceAuditResponse,
  PERFORMANCE_RESULTS_LIMIT_MAX,
  type PerformanceAuditQueryArgs,
} from "./performanceData";

const PERFORMANCE_RESOURCE_URIS = {
  BASE: "automobile:performance-results",
} as const;

const PERFORMANCE_QUERY_KEYS = ["startTime", "endTime", "limit", "offset", "deviceId"] as const;
type PerformanceQueryKey = typeof PERFORMANCE_QUERY_KEYS[number];

function buildQueryTemplate(keys: readonly PerformanceQueryKey[]): string {
  const query = keys.map(key => `${key}={${key}}`).join("&");
  return `${PERFORMANCE_RESOURCE_URIS.BASE}?${query}`;
}

function parseInteger(
  value: string | undefined,
  label: string,
  options: { min?: number; max?: number } = {}
): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  const min = options.min ?? 0;
  if (parsed < min) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  if (options.max !== undefined && parsed > options.max) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return parsed;
}

function parseTimestampParam(value: string | undefined, label: string): string | number | undefined {
  if (!value) {
    return undefined;
  }

  const decoded = decodeURIComponent(value).trim();
  if (!decoded) {
    return undefined;
  }

  if (/^-?\d+$/.test(decoded)) {
    const parsed = Number(decoded);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid ${label}: ${value}`);
    }
    return parsed;
  }

  return decoded;
}

function parsePerformanceParams(
  params: Record<string, string>
): Pick<PerformanceAuditQueryArgs, "startTime" | "endTime" | "limit" | "offset" | "deviceId"> {
  const startTime = parseTimestampParam(params.startTime, "startTime");
  const endTime = parseTimestampParam(params.endTime, "endTime");
  const limitRaw = params.limit ? decodeURIComponent(params.limit).trim() : undefined;
  const offsetRaw = params.offset ? decodeURIComponent(params.offset).trim() : undefined;
  const deviceIdRaw = params.deviceId ? decodeURIComponent(params.deviceId).trim() : undefined;

  return {
    startTime,
    endTime,
    limit: parseInteger(limitRaw, "limit", { min: 1, max: PERFORMANCE_RESULTS_LIMIT_MAX }),
    offset: parseInteger(offsetRaw, "offset", { min: 0 }),
    deviceId: deviceIdRaw || undefined,
  };
}

function buildPerformanceUri(options: PerformanceAuditQueryArgs): string {
  const query = new URLSearchParams();
  if (options.startTime !== undefined) {
    query.set("startTime", String(options.startTime));
  }
  if (options.endTime !== undefined) {
    query.set("endTime", String(options.endTime));
  }
  if (options.limit !== undefined) {
    query.set("limit", options.limit.toString());
  }
  if (options.offset !== undefined) {
    query.set("offset", options.offset.toString());
  }
  if (options.deviceId !== undefined) {
    query.set("deviceId", options.deviceId);
  }

  const queryString = query.toString();
  return queryString ? `${PERFORMANCE_RESOURCE_URIS.BASE}?${queryString}` : PERFORMANCE_RESOURCE_URIS.BASE;
}

async function getPerformanceResource(
  args: PerformanceAuditQueryArgs,
  uri: string
): Promise<ResourceContent> {
  try {
    const response = await buildPerformanceAuditResponse(args);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(response, null, 2)
    };
  } catch (error) {
    logger.error(`[PerformanceResources] Failed to get performance audit results: ${error}`);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Failed to retrieve performance audit results: ${error}`
      }, null, 2)
    };
  }
}

function registerPerformanceTemplates(
  handler: (params: Record<string, string>) => Promise<ResourceContent>
): void {
  const keyCount = PERFORMANCE_QUERY_KEYS.length;
  for (let mask = 1; mask < (1 << keyCount); mask += 1) {
    const keys = PERFORMANCE_QUERY_KEYS.filter((_, index) => (mask & (1 << index)) !== 0);
    ResourceRegistry.registerTemplate(
      buildQueryTemplate(keys),
      "Performance Results",
      "List UI performance audit results from the local database.",
      "application/json",
      handler
    );
  }
}

export function registerPerformanceResources(): void {
  ResourceRegistry.register(
    PERFORMANCE_RESOURCE_URIS.BASE,
    "Performance Results",
    "List UI performance audit results from the local database.",
    "application/json",
    () => getPerformanceResource({}, PERFORMANCE_RESOURCE_URIS.BASE)
  );

  registerPerformanceTemplates(async params => {
    try {
      const options = parsePerformanceParams(params);
      const uri = buildPerformanceUri(options);
      return getPerformanceResource(options, uri);
    } catch (error) {
      logger.error(`[PerformanceResources] Failed to parse query params: ${error}`);
      return {
        uri: PERFORMANCE_RESOURCE_URIS.BASE,
        mimeType: "application/json",
        text: JSON.stringify({
          error: `Invalid performance query parameters: ${error}`
        }, null, 2)
      };
    }
  });

  logger.info("[PerformanceResources] Registered performance resources");
}
