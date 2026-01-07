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

const TEST_TIMING_QUERY_KEYS = ["lookbackDays", "limit"] as const;
type TestTimingQueryKey = typeof TEST_TIMING_QUERY_KEYS[number];

function buildQueryTemplate(keys: readonly TestTimingQueryKey[]): string {
  const query = keys.map(key => `${key}={${key}}`).join("&");
  return `${TEST_TIMING_RESOURCE_URIS.BASE}?${query}`;
}

function parsePositiveInt(
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

  const min = options.min ?? 1;
  if (parsed < min) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  if (options.max !== undefined && parsed > options.max) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return parsed;
}

function parseTestTimingParams(params: Record<string, string>): Pick<TestTimingQueryArgs, "lookbackDays" | "limit"> {
  const lookbackRaw = params.lookbackDays ? decodeURIComponent(params.lookbackDays).trim() : undefined;
  const limitRaw = params.limit ? decodeURIComponent(params.limit).trim() : undefined;

  return {
    lookbackDays: parsePositiveInt(lookbackRaw, "lookbackDays"),
    limit: parsePositiveInt(limitRaw, "limit", { max: TEST_TIMING_LIMIT_MAX }),
  };
}

function buildTestTimingUri(options: Pick<TestTimingQueryArgs, "lookbackDays" | "limit">): string {
  const query = new URLSearchParams();
  if (options.lookbackDays !== undefined) {
    query.set("lookbackDays", options.lookbackDays.toString());
  }
  if (options.limit !== undefined) {
    query.set("limit", options.limit.toString());
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

function registerTestTimingTemplates(
  handler: (params: Record<string, string>) => Promise<ResourceContent>
): void {
  const keyCount = TEST_TIMING_QUERY_KEYS.length;
  for (let mask = 1; mask < (1 << keyCount); mask += 1) {
    const keys = TEST_TIMING_QUERY_KEYS.filter((_, index) => (mask & (1 << index)) !== 0);
    ResourceRegistry.registerTemplate(
      buildQueryTemplate(keys),
      "Test Timing History",
      "Historical aggregated test execution timing statistics.",
      "application/json",
      handler
    );
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

  registerTestTimingTemplates(async params => {
    try {
      const options = parseTestTimingParams(params);
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
  });

  logger.info("[TestTimingResources] Registered test timing resources");
}
