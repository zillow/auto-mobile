import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError } from "../models";
import { createJSONToolResponse } from "../utils/toolUtils";
import { buildTestTimingResponse, TEST_TIMING_LIMIT_MAX } from "./testTimingData";
import type { TestTimingQueryArgs } from "./testTimingData";

const testTimingQuerySchema: z.ZodType<TestTimingQueryArgs> = z.object({
  lookbackDays: z.number().int().positive().optional().describe("Number of days of history to include."),
  limit: z.number().int().positive().max(TEST_TIMING_LIMIT_MAX).optional().describe("Maximum number of tests to return."),
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

export function registerTestTimingTools(): void {
  ToolRegistry.register(
    "getTestTimings",
    "Retrieve aggregated historical test execution timing statistics for optimization.",
    testTimingQuerySchema,
    async args => {
      try {
        const response = await buildTestTimingResponse(args);
        return createJSONToolResponse(response);
      } catch (error) {
        throw new ActionableError(`Failed to retrieve test timing data: ${error}`);
      }
    }
  );
}
