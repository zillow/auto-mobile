import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError } from "../models";
import { createJSONToolResponse } from "../utils/toolUtils";
import {
  TestExecutionRepository,
  TestTimingQueryOptions,
  TEST_EXECUTION_RETENTION_MAX_DAYS,
} from "../db/testExecutionRepository";

const DEFAULT_LOOKBACK_DAYS = TEST_EXECUTION_RETENTION_MAX_DAYS;
const DEFAULT_LIMIT = 1000;
const DEFAULT_MIN_SAMPLES = 1;

const testTimingQuerySchema = z.object({
  lookbackDays: z.number().int().positive().optional().describe("Number of days of history to include."),
  limit: z.number().int().positive().max(5000).optional().describe("Maximum number of tests to return."),
  minSamples: z.number().int().nonnegative().optional().describe("Minimum sample size to include a test."),
  orderBy: z.enum(["lastRun", "averageDuration", "sampleSize"]).optional().describe("Sort key for results."),
  orderDirection: z.enum(["asc", "desc"]).optional().describe("Sort direction for results."),
  testClass: z.string().optional().describe("Filter by test class name."),
  testMethod: z.string().optional().describe("Filter by test method name."),
  deviceId: z.string().optional().describe("Filter by device ID."),
  deviceName: z.string().optional().describe("Filter by device name."),
  devicePlatform: z.enum(["android", "ios"]).optional().describe("Filter by device platform."),
  deviceType: z.enum(["emulator", "simulator", "device"]).optional().describe("Filter by device type."),
  appVersion: z.string().optional().describe("Filter by app version."),
  gitCommit: z.string().optional().describe("Filter by git commit SHA."),
  targetSdk: z.number().int().positive().optional().describe("Filter by target SDK."),
  jdkVersion: z.string().optional().describe("Filter by JDK version."),
  jvmTarget: z.string().optional().describe("Filter by JVM target."),
  gradleVersion: z.string().optional().describe("Filter by Gradle version."),
  isCi: z.boolean().optional().describe("Filter by CI mode."),
  sessionUuid: z.string().optional().describe("Filter by session UUID."),
}).strict();

const testExecutionRepository = new TestExecutionRepository();

export function registerTestTimingTools(): void {
  ToolRegistry.register(
    "getTestTimings",
    "Retrieve aggregated historical test execution timing statistics for optimization.",
    testTimingQuerySchema,
    async args => {
      try {
        const lookbackDays = args.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
        const limit = args.limit ?? DEFAULT_LIMIT;
        const minSamples = args.minSamples ?? DEFAULT_MIN_SAMPLES;

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

        const response = {
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

        return createJSONToolResponse(response);
      } catch (error) {
        throw new ActionableError(`Failed to retrieve test timing data: ${error}`);
      }
    }
  );
}
