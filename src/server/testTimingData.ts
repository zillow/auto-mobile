import {
  TestExecutionRepository,
  TestTimingQueryOptions,
  TEST_EXECUTION_RETENTION_MAX_DAYS,
} from "../db/testExecutionRepository";

export const DEFAULT_TEST_TIMING_LOOKBACK_DAYS = TEST_EXECUTION_RETENTION_MAX_DAYS;
export const DEFAULT_TEST_TIMING_LIMIT = 1000;
export const DEFAULT_TEST_TIMING_MIN_SAMPLES = 1;
export const TEST_TIMING_LIMIT_MAX = 5000;

export interface TestTimingQueryArgs {
  lookbackDays?: number;
  limit?: number;
  minSamples?: number;
  orderBy?: "lastRun" | "averageDuration" | "sampleSize";
  orderDirection?: "asc" | "desc";
  testClass?: string;
  testMethod?: string;
  deviceId?: string;
  deviceName?: string;
  devicePlatform?: "android" | "ios";
  deviceType?: "emulator" | "simulator" | "device";
  appVersion?: string;
  gitCommit?: string;
  targetSdk?: number;
  jdkVersion?: string;
  jvmTarget?: string;
  gradleVersion?: string;
  isCi?: boolean;
  sessionUuid?: string;
}

export interface TestTimingResponseEntry {
  testClass: string;
  testMethod: string;
  averageDurationMs: number;
  sampleSize: number;
  lastRunTimestampMs: number | null;
  lastRun: string | null;
  successRate: number;
  failureRate: number;
  stdDevDurationMs: number;
  statusCounts: {
    passed: number;
    failed: number;
    skipped: number;
  };
}

export interface TestTimingResponse {
  testTimings: TestTimingResponseEntry[];
  generatedAt: string;
  totalTests: number;
  totalSamples: number;
  aggregation: {
    strategy: "mean";
    lookbackDays: number;
    minSamples: number;
    limit: number;
    orderBy: "lastRun" | "averageDuration" | "sampleSize";
    orderDirection: "asc" | "desc";
  };
  filters: Record<string, unknown>;
}

const testExecutionRepository = new TestExecutionRepository();

export async function buildTestTimingResponse(args: TestTimingQueryArgs): Promise<TestTimingResponse> {
  const lookbackDays = args.lookbackDays ?? DEFAULT_TEST_TIMING_LOOKBACK_DAYS;
  const limit = args.limit ?? DEFAULT_TEST_TIMING_LIMIT;
  const minSamples = args.minSamples ?? DEFAULT_TEST_TIMING_MIN_SAMPLES;

  const options: TestTimingQueryOptions = {
    lookbackDays,
    limit,
    minSamples,
    orderBy: args.orderBy,
    orderDirection: args.orderDirection,
    testClass: args.testClass,
    testMethod: args.testMethod,
    deviceId: args.deviceId,
    deviceName: args.deviceName,
    devicePlatform: args.devicePlatform,
    deviceType: args.deviceType,
    appVersion: args.appVersion,
    gitCommit: args.gitCommit,
    targetSdk: args.targetSdk,
    jdkVersion: args.jdkVersion,
    jvmTarget: args.jvmTarget,
    gradleVersion: args.gradleVersion,
    isCi: args.isCi,
    sessionUuid: args.sessionUuid,
  };

  const timings = await testExecutionRepository.getTimingStats(options);
  const totalSamples = timings.reduce((total, entry) => total + entry.sampleSize, 0);

  const filters: Record<string, unknown> = {};
  if (args.testClass) {filters.testClass = args.testClass;}
  if (args.testMethod) {filters.testMethod = args.testMethod;}
  if (args.deviceId) {filters.deviceId = args.deviceId;}
  if (args.deviceName) {filters.deviceName = args.deviceName;}
  if (args.devicePlatform) {filters.devicePlatform = args.devicePlatform;}
  if (args.deviceType) {filters.deviceType = args.deviceType;}
  if (args.appVersion) {filters.appVersion = args.appVersion;}
  if (args.gitCommit) {filters.gitCommit = args.gitCommit;}
  if (args.targetSdk !== undefined) {filters.targetSdk = args.targetSdk;}
  if (args.jdkVersion) {filters.jdkVersion = args.jdkVersion;}
  if (args.jvmTarget) {filters.jvmTarget = args.jvmTarget;}
  if (args.gradleVersion) {filters.gradleVersion = args.gradleVersion;}
  if (typeof args.isCi === "boolean") {filters.isCi = args.isCi;}
  if (args.sessionUuid) {filters.sessionUuid = args.sessionUuid;}

  return {
    testTimings: timings.map(entry => ({
      testClass: entry.testClass,
      testMethod: entry.testMethod,
      averageDurationMs: entry.averageDurationMs,
      sampleSize: entry.sampleSize,
      lastRunTimestampMs: entry.lastRunTimestampMs || null,
      lastRun: entry.lastRunTimestampMs
        ? new Date(entry.lastRunTimestampMs).toISOString()
        : null,
      successRate: entry.sampleSize > 0
        ? Number((entry.passedCount / entry.sampleSize).toFixed(4))
        : 0,
      failureRate: entry.sampleSize > 0
        ? Number((entry.failedCount / entry.sampleSize).toFixed(4))
        : 0,
      stdDevDurationMs: entry.stdDevDurationMs,
      statusCounts: {
        passed: entry.passedCount,
        failed: entry.failedCount,
        skipped: entry.skippedCount,
      },
    })),
    generatedAt: new Date().toISOString(),
    totalTests: timings.length,
    totalSamples,
    aggregation: {
      strategy: "mean",
      lookbackDays,
      minSamples,
      limit,
      orderBy: options.orderBy ?? "lastRun",
      orderDirection: options.orderDirection ?? "desc",
    },
    filters,
  };
}
