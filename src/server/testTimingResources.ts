import { ResourceRegistry, ResourceContent } from "./resourceRegistry";
import { logger } from "../utils/logger";
import {
  buildTestTimingResponse,
  TEST_TIMING_LIMIT_MAX,
  type TestTimingQueryArgs,
} from "./testTimingData";

export const TEST_TIMING_RESOURCE_URIS = {
  BASE: "automobile:test-timings",
} as const;

const TEST_TIMING_QUERY_TEMPLATE = `${TEST_TIMING_RESOURCE_URIS.BASE}?{params}`;
const TEST_TIMING_QUERY_PARAM_KEYS = new Set([
  "lookbackDays",
  "limit",
  "minSamples",
  "orderBy",
  "orderDirection",
  "testClass",
  "testMethod",
  "deviceId",
  "deviceName",
  "devicePlatform",
  "deviceType",
  "appVersion",
  "gitCommit",
  "targetSdk",
  "jdkVersion",
  "jvmTarget",
  "gradleVersion",
  "isCi",
  "sessionUuid",
] as const);

function normalizeParam(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseInteger(
  value: string | undefined,
  label: string,
  options: { min?: number; max?: number } = {}
): number | undefined {
  const normalized = normalizeParam(value);
  if (normalized === undefined) {
    return undefined;
  }

  const parsed = Number(normalized);
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

function parseBoolean(value: string | undefined, label: string): boolean | undefined {
  const normalized = normalizeParam(value);
  if (normalized === undefined) {
    return undefined;
  }
  const lowered = normalized.toLowerCase();
  if (lowered === "true" || lowered === "1") {
    return true;
  }
  if (lowered === "false" || lowered === "0") {
    return false;
  }
  throw new Error(`Invalid ${label}: ${value}`);
}

function parseEnum<T extends string>(
  value: string | undefined,
  label: string,
  allowed: readonly T[]
): T | undefined {
  const normalized = normalizeParam(value);
  if (normalized === undefined) {
    return undefined;
  }
  if (allowed.includes(normalized as T)) {
    return normalized as T;
  }
  throw new Error(`Invalid ${label}: ${value}`);
}

function parseString(value: string | undefined): string | undefined {
  return normalizeParam(value);
}

function parseQueryParams(query: string): Record<string, string> {
  const params = new URLSearchParams(query);
  const entries: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    entries[key] = value;
  }
  return entries;
}

function parseTestTimingParams(params: Record<string, string>): TestTimingQueryArgs {
  const unknownKeys = Object.keys(params).filter(key => !TEST_TIMING_QUERY_PARAM_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`Unknown query parameters: ${unknownKeys.join(", ")}`);
  }

  return {
    lookbackDays: parseInteger(params.lookbackDays, "lookbackDays", { min: 1 }),
    limit: parseInteger(params.limit, "limit", { min: 1, max: TEST_TIMING_LIMIT_MAX }),
    minSamples: parseInteger(params.minSamples, "minSamples", { min: 0 }),
    orderBy: parseEnum(params.orderBy, "orderBy", ["lastRun", "averageDuration", "sampleSize"]),
    orderDirection: parseEnum(params.orderDirection, "orderDirection", ["asc", "desc"]),
    testClass: parseString(params.testClass),
    testMethod: parseString(params.testMethod),
    deviceId: parseString(params.deviceId),
    deviceName: parseString(params.deviceName),
    devicePlatform: parseEnum(params.devicePlatform, "devicePlatform", ["android", "ios"]),
    deviceType: parseEnum(params.deviceType, "deviceType", ["emulator", "simulator", "device"]),
    appVersion: parseString(params.appVersion),
    gitCommit: parseString(params.gitCommit),
    targetSdk: parseInteger(params.targetSdk, "targetSdk", { min: 1 }),
    jdkVersion: parseString(params.jdkVersion),
    jvmTarget: parseString(params.jvmTarget),
    gradleVersion: parseString(params.gradleVersion),
    isCi: parseBoolean(params.isCi, "isCi"),
    sessionUuid: parseString(params.sessionUuid),
  };
}

function buildTestTimingUri(options: TestTimingQueryArgs): string {
  const query = new URLSearchParams();
  if (options.lookbackDays !== undefined) {
    query.set("lookbackDays", options.lookbackDays.toString());
  }
  if (options.limit !== undefined) {
    query.set("limit", options.limit.toString());
  }
  if (options.minSamples !== undefined) {
    query.set("minSamples", options.minSamples.toString());
  }
  if (options.orderBy !== undefined) {
    query.set("orderBy", options.orderBy);
  }
  if (options.orderDirection !== undefined) {
    query.set("orderDirection", options.orderDirection);
  }
  if (options.testClass) {
    query.set("testClass", options.testClass);
  }
  if (options.testMethod) {
    query.set("testMethod", options.testMethod);
  }
  if (options.deviceId) {
    query.set("deviceId", options.deviceId);
  }
  if (options.deviceName) {
    query.set("deviceName", options.deviceName);
  }
  if (options.devicePlatform) {
    query.set("devicePlatform", options.devicePlatform);
  }
  if (options.deviceType) {
    query.set("deviceType", options.deviceType);
  }
  if (options.appVersion) {
    query.set("appVersion", options.appVersion);
  }
  if (options.gitCommit) {
    query.set("gitCommit", options.gitCommit);
  }
  if (options.targetSdk !== undefined) {
    query.set("targetSdk", options.targetSdk.toString());
  }
  if (options.jdkVersion) {
    query.set("jdkVersion", options.jdkVersion);
  }
  if (options.jvmTarget) {
    query.set("jvmTarget", options.jvmTarget);
  }
  if (options.gradleVersion) {
    query.set("gradleVersion", options.gradleVersion);
  }
  if (typeof options.isCi === "boolean") {
    query.set("isCi", options.isCi.toString());
  }
  if (options.sessionUuid) {
    query.set("sessionUuid", options.sessionUuid);
  }
  const queryString = query.toString();
  return queryString ? `${TEST_TIMING_RESOURCE_URIS.BASE}?${queryString}` : TEST_TIMING_RESOURCE_URIS.BASE;
}

async function getTestTimingResource(
  args: TestTimingQueryArgs,
  uri: string
): Promise<ResourceContent> {
  try {
    const response = await buildTestTimingResponse(args);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(response, null, 2)
    };
  } catch (error) {
    logger.error(`[TestTimingResources] Failed to get test timing data: ${error}`);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Failed to retrieve test timing data: ${error}`
      }, null, 2)
    };
  }
}

export function registerTestTimingResources(): void {
  ResourceRegistry.register(
    TEST_TIMING_RESOURCE_URIS.BASE,
    "Test Timing History",
    "Historical aggregated test execution timing statistics.",
    "application/json",
    () => getTestTimingResource({}, TEST_TIMING_RESOURCE_URIS.BASE)
  );

  ResourceRegistry.registerTemplate(
    TEST_TIMING_QUERY_TEMPLATE,
    "Test Timing History",
    "Historical aggregated test execution timing statistics.",
    "application/json",
    async params => {
      try {
        const queryParams = parseQueryParams(params.params ?? "");
        const options = parseTestTimingParams(queryParams);
        const uri = buildTestTimingUri(options);
        return getTestTimingResource(options, uri);
      } catch (error) {
        logger.error(`[TestTimingResources] Failed to parse query params: ${error}`);
        return {
          uri: TEST_TIMING_RESOURCE_URIS.BASE,
          mimeType: "application/json",
          text: JSON.stringify({
            error: `Invalid test timing query parameters: ${error}`
          }, null, 2)
        };
      }
    }
  );

  logger.info("[TestTimingResources] Registered test timing resources");
}
