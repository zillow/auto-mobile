package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.McpConnectionException
import dev.jasonpearson.automobile.ide.daemon.TestRunQuery
import dev.jasonpearson.automobile.ide.test.TestPlatform
import dev.jasonpearson.automobile.ide.test.TestRun
import dev.jasonpearson.automobile.ide.test.TestStatus
import dev.jasonpearson.automobile.ide.test.TestStep

/**
 * Real test data source that fetches from MCP resources.
 * Uses the test-runs resource to get actual test data with steps and screens.
 */
class RealTestDataSource(
    private val clientProvider: (() -> AutoMobileClient)? = null,
) : TestDataSource {
    override suspend fun getTestRuns(): Result<List<TestRun>> {
        val provider = clientProvider ?: return Result.Success(emptyList())

        return try {
            val client = provider()
            val summary = client.getTestRuns(TestRunQuery(limit = 100))

            // Map TestRunEntry to TestRun
            val testRuns = summary.testRuns.map { entry ->
                val status = when (entry.status) {
                    "passed" -> TestStatus.Passed
                    "failed" -> TestStatus.Failed
                    "skipped" -> TestStatus.Skipped
                    else -> TestStatus.Skipped
                }

                val steps = entry.steps.map { step ->
                    val stepStatus = when (step.status) {
                        "completed" -> TestStatus.Passed
                        "failed" -> TestStatus.Failed
                        "skipped" -> TestStatus.Skipped
                        else -> TestStatus.Skipped
                    }
                    TestStep(
                        id = "step-${step.id}",
                        index = step.index,
                        action = step.action,
                        target = step.target ?: "",
                        screenshotPath = step.screenshotPath,
                        screenName = step.screenName,
                        durationMs = step.durationMs,
                        status = stepStatus,
                        errorMessage = step.errorMessage,
                    )
                }

                val platform = when (entry.platform?.lowercase()) {
                    "ios" -> TestPlatform.iOS
                    else -> TestPlatform.Android
                }

                TestRun(
                    id = "run-${entry.id}",
                    testId = "${entry.testClass}.${entry.testMethod}",
                    testName = entry.testName,
                    status = status,
                    startTime = entry.startTime,
                    durationMs = entry.durationMs,
                    steps = steps,
                    screensVisited = entry.screensVisited,
                    errorMessage = entry.errorMessage,
                    deviceId = entry.deviceId ?: "unknown",
                    deviceName = entry.deviceName ?: "Unknown device",
                    platform = platform,
                    videoPath = entry.videoPath,
                    snapshotPath = entry.snapshotPath,
                    sampleSize = entry.sampleSize,
                )
            }

            Result.Success(testRuns)
        } catch (e: McpConnectionException) {
            Result.Error("MCP server not available: ${e.message}")
        } catch (e: Exception) {
            Result.Error("Failed to load test data: ${e.message}")
        }
    }
}
