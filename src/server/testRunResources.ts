import { ResourceRegistry, ResourceContent } from "./resourceRegistry";
import { logger } from "../utils/logger";
import { TestExecutionRepository, TestRun, TestRunQueryOptions } from "../db/testExecutionRepository";

const TEST_RUN_RESOURCE_URIS = {
  BASE: "automobile:test-runs",
} as const;

const TEST_RUN_LIMIT_DEFAULT = 100;
const TEST_RUN_LIMIT_MAX = 500;
const TEST_RUN_LOOKBACK_DAYS_DEFAULT = 30;

const TEST_RUN_QUERY_TEMPLATE = `${TEST_RUN_RESOURCE_URIS.BASE}?{params}`;
const TEST_RUN_QUERY_PARAM_KEYS = new Set([
  "lookbackDays",
  "limit",
  "testClass",
  "testMethod",
  "orderDirection",
  "latestOnly",
] as const);

interface TestRunQueryArgs {
  lookbackDays?: number;
  limit?: number;
  testClass?: string;
  testMethod?: string;
  orderDirection?: "asc" | "desc";
  latestOnly?: boolean;
}

interface TestRunResponseStep {
  id: number;
  index: number;
  action: string;
  target: string | null;
  screenshotPath: string | null;
  screenName: string | null;
  durationMs: number;
  status: "completed" | "failed" | "skipped";
  errorMessage: string | null;
}

interface TestRunResponseEntry {
  id: number;
  testClass: string;
  testMethod: string;
  testName: string; // Derived from testClass + testMethod
  status: "passed" | "failed" | "skipped";
  startTime: number;
  durationMs: number;
  deviceId: string | null;
  deviceName: string | null;
  platform: "android" | "ios" | null;
  errorMessage: string | null;
  videoPath: string | null;
  snapshotPath: string | null;
  steps: TestRunResponseStep[];
  screensVisited: string[];
  sampleSize: number; // Total runs for this test (for history bar)
}

interface TestRunResponse {
  testRuns: TestRunResponseEntry[];
  generatedAt: string;
  totalRuns: number;
  query: {
    lookbackDays: number;
    limit: number;
    orderDirection: "asc" | "desc";
  };
  filters: Record<string, unknown>;
}

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

function parseBoolean(value: string | undefined): boolean | undefined {
  const normalized = normalizeParam(value);
  if (normalized === undefined) {
    return undefined;
  }
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  return undefined;
}

function parseTestRunParams(params: Record<string, string>): TestRunQueryArgs {
  const unknownKeys = Object.keys(params).filter(key => !TEST_RUN_QUERY_PARAM_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`Unknown query parameters: ${unknownKeys.join(", ")}`);
  }

  return {
    lookbackDays: parseInteger(params.lookbackDays, "lookbackDays", { min: 1 }),
    limit: parseInteger(params.limit, "limit", { min: 1, max: TEST_RUN_LIMIT_MAX }),
    testClass: parseString(params.testClass),
    testMethod: parseString(params.testMethod),
    orderDirection: parseEnum(params.orderDirection, "orderDirection", ["asc", "desc"]),
    latestOnly: parseBoolean(params.latestOnly),
  };
}

function buildTestRunUri(options: TestRunQueryArgs): string {
  const query = new URLSearchParams();
  if (options.lookbackDays !== undefined) {
    query.set("lookbackDays", options.lookbackDays.toString());
  }
  if (options.limit !== undefined) {
    query.set("limit", options.limit.toString());
  }
  if (options.testClass) {
    query.set("testClass", options.testClass);
  }
  if (options.testMethod) {
    query.set("testMethod", options.testMethod);
  }
  if (options.orderDirection) {
    query.set("orderDirection", options.orderDirection);
  }
  if (options.latestOnly) {
    query.set("latestOnly", "true");
  }
  const queryString = query.toString();
  return queryString ? `${TEST_RUN_RESOURCE_URIS.BASE}?${queryString}` : TEST_RUN_RESOURCE_URIS.BASE;
}

function convertToResponseEntry(run: TestRun, sampleSize: number): TestRunResponseEntry {
  // Derive test name from class + method
  const classSimpleName = run.testClass.split(".").pop() || run.testClass;
  const testName = `${classSimpleName}.${run.testMethod}`;

  return {
    id: run.id,
    testClass: run.testClass,
    testMethod: run.testMethod,
    testName,
    status: run.status,
    startTime: run.startTime,
    durationMs: run.durationMs,
    deviceId: run.deviceId,
    deviceName: run.deviceName,
    platform: run.platform,
    errorMessage: run.errorMessage,
    videoPath: run.videoPath,
    snapshotPath: run.snapshotPath,
    steps: run.steps.map(step => ({
      id: step.id,
      index: step.stepIndex,
      action: step.action,
      target: step.target,
      screenshotPath: step.screenshotPath,
      screenName: step.screenName,
      durationMs: step.durationMs,
      status: step.status,
      errorMessage: step.errorMessage,
    })),
    screensVisited: run.screensVisited,
    sampleSize,
  };
}

async function buildTestRunResponse(args: TestRunQueryArgs): Promise<TestRunResponse> {
  const repository = new TestExecutionRepository();

  const lookbackDays = args.lookbackDays ?? TEST_RUN_LOOKBACK_DAYS_DEFAULT;
  const limit = args.limit ?? TEST_RUN_LIMIT_DEFAULT;
  const orderDirection = args.orderDirection ?? "desc";
  const latestOnly = args.latestOnly ?? true; // Default to true for cleaner UX

  const queryOptions: TestRunQueryOptions = {
    lookbackDays,
    // Fetch more runs than the limit when latestOnly is true, since we'll dedupe
    limit: latestOnly ? limit * 5 : limit,
    testClass: args.testClass,
    testMethod: args.testMethod,
    orderDirection,
  };

  const runs = await repository.getTestRuns(queryOptions);

  // Calculate sample sizes for each test (count of runs for that test class + method)
  const sampleSizesMap = new Map<string, number>();
  for (const run of runs) {
    const key = `${run.testClass}::${run.testMethod}`;
    sampleSizesMap.set(key, (sampleSizesMap.get(key) || 0) + 1);
  }

  // Deduplicate: keep only the latest run for each unique test when latestOnly is true
  let filteredRuns = runs;
  if (latestOnly) {
    const seenTests = new Set<string>();
    filteredRuns = runs.filter(run => {
      const key = `${run.testClass}::${run.testMethod}`;
      if (seenTests.has(key)) {
        return false;
      }
      seenTests.add(key);
      return true;
    });
    // Apply the original limit after deduplication
    filteredRuns = filteredRuns.slice(0, limit);
  }

  const testRuns = filteredRuns.map(run => {
    const key = `${run.testClass}::${run.testMethod}`;
    const sampleSize = sampleSizesMap.get(key) || 1;
    return convertToResponseEntry(run, sampleSize);
  });

  const filters: Record<string, unknown> = {};
  if (args.testClass) {
    filters.testClass = args.testClass;
  }
  if (args.testMethod) {
    filters.testMethod = args.testMethod;
  }

  return {
    testRuns,
    generatedAt: new Date().toISOString(),
    totalRuns: testRuns.length,
    query: {
      lookbackDays,
      limit,
      orderDirection,
    },
    filters,
  };
}

async function getTestRunResource(
  args: TestRunQueryArgs,
  uri: string
): Promise<ResourceContent> {
  try {
    const response = await buildTestRunResponse(args);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(response, null, 2)
    };
  } catch (error) {
    logger.error(`[TestRunResources] Failed to get test run data: ${error}`);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Failed to retrieve test run data: ${error}`
      }, null, 2)
    };
  }
}

export function registerTestRunResources(): void {
  ResourceRegistry.register(
    TEST_RUN_RESOURCE_URIS.BASE,
    "Test Run History",
    "Individual test run history with step-level details and screens visited.",
    "application/json",
    () => getTestRunResource({}, TEST_RUN_RESOURCE_URIS.BASE)
  );

  ResourceRegistry.registerTemplate(
    TEST_RUN_QUERY_TEMPLATE,
    "Test Run History",
    "Individual test run history with step-level details and screens visited.",
    "application/json",
    async params => {
      try {
        const queryParams = parseQueryParams(params.params ?? "");
        const options = parseTestRunParams(queryParams);
        const uri = buildTestRunUri(options);
        return getTestRunResource(options, uri);
      } catch (error) {
        logger.error(`[TestRunResources] Failed to parse query params: ${error}`);
        return {
          uri: TEST_RUN_RESOURCE_URIS.BASE,
          mimeType: "application/json",
          text: JSON.stringify({
            error: `Invalid test run query parameters: ${error}`
          }, null, 2)
        };
      }
    }
  );

  logger.info("[TestRunResources] Registered test run resources");
}
