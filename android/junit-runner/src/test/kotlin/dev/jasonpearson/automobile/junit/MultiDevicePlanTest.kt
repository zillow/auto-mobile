package dev.jasonpearson.automobile.junit

import java.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.Description
import org.junit.runner.notification.Failure
import org.junit.runner.notification.RunNotifier
import org.junit.runners.model.FrameworkMethod

/**
 * Tests for plain two-device plans where steps run on device A and device B independently,
 * without any inter-device coordination.
 *
 * Demonstrates stepping through test steps on a per-device basis: launch on A, launch on B,
 * observe A, observe B, terminate A, terminate B.
 */
class TwoDevicePlainPlanTest {
  private val json = Json { ignoreUnknownKeys = true }
  private lateinit var capturingClient: MultiDeviceCapturingFakeDaemonToolClient
  private lateinit var runner: AutoMobileRunner
  private lateinit var notifier: MultiDeviceRecordingRunNotifier

  @Before
  fun setup() {
    capturingClient = MultiDeviceCapturingFakeDaemonToolClient()
    DaemonSocketClientManager.testClient = capturingClient
    AutoMobileSharedUtils.testDeviceChecker = TwoDeviceFakeChecker()
    DaemonHeartbeat.testController = MultiDeviceFakeDaemonHeartbeat()
    runner = AutoMobileRunner(TwoDevicePlainTestTarget::class.java)
    notifier = MultiDeviceRecordingRunNotifier()
  }

  @After
  fun tearDown() {
    DaemonSocketClientManager.testClient = null
    AutoMobileSharedUtils.testDeviceChecker = null
    DaemonHeartbeat.testController = null
    SystemPropertyCache.clear()
    PlanCache.clear()
    RegexCache.clear()
    TestTimingCache.clear()
  }

  @Test
  fun `two device fake checker reports two available devices`() {
    val checker = TwoDeviceFakeChecker()
    assertEquals(2, checker.getDeviceCount())
    assertTrue(checker.areDevicesAvailable())
  }

  @Test
  fun `plan content sent to daemon declares both device labels`() {
    capturingClient.setResponse("executePlan", successResponse(executedSteps = 6, totalSteps = 6))

    AutoMobilePlanExecutor.execute(
        "test-plans/dual-device-plain.yaml",
        emptyMap(),
        AutoMobilePlanExecutionOptions(aiAssistance = false),
    )

    val planContent =
      capturingClient.capturedArguments?.get("planContent")?.jsonPrimitive?.content
    assertNotNull("Plan content should be sent to daemon", planContent)
    val decoded = decodePlanContent(planContent!!)
    assertTrue("Plan should declare device A", decoded.contains("- A"))
    assertTrue("Plan should declare device B", decoded.contains("- B"))
  }

  @Test
  fun `plan steps are distributed across device A and device B`() {
    capturingClient.setResponse("executePlan", successResponse(executedSteps = 6, totalSteps = 6))

    AutoMobilePlanExecutor.execute(
        "test-plans/dual-device-plain.yaml",
        emptyMap(),
        AutoMobilePlanExecutionOptions(aiAssistance = false),
    )

    val decoded =
      decodePlanContent(
        capturingClient.capturedArguments!!["planContent"]!!.jsonPrimitive.content
      )
    assertTrue("Steps should reference device A", decoded.contains("device: A"))
    assertTrue("Steps should reference device B", decoded.contains("device: B"))
  }

  @Test
  fun `runner succeeds when daemon reports all steps complete across both devices`() {
    // Per-device tool results: launchApp A, launchApp B, observe A, observe B, terminate A, terminate B
    capturingClient.setResponse(
      "executePlan",
      buildDaemonResponse(
        JsonObject(
          mapOf(
            "success" to JsonPrimitive(true),
            "executedSteps" to JsonPrimitive(6),
            "totalSteps" to JsonPrimitive(6),
            "toolResults" to
              JsonArray(
                listOf(
                  perDeviceStepResult("launchApp", "A"),
                  perDeviceStepResult("launchApp", "B"),
                  perDeviceStepResult("observe", "A"),
                  perDeviceStepResult("observe", "B"),
                  perDeviceStepResult("terminateApp", "A"),
                  perDeviceStepResult("terminateApp", "B"),
                )
              ),
          )
        )
      ),
    )

    val result = AutoMobilePlanExecutor.execute(
        "test-plans/dual-device-plain.yaml",
        emptyMap(),
        AutoMobilePlanExecutionOptions(aiAssistance = false),
    )

    assertTrue("Execution should succeed for two-device run", result.success)
  }

  @Test
  fun `runner reports failure with device label when step on device B fails`() {
    capturingClient.setResponse(
      "executePlan",
      buildDaemonResponse(
        JsonObject(
          mapOf(
            "success" to JsonPrimitive(false),
            "executedSteps" to JsonPrimitive(3),
            "totalSteps" to JsonPrimitive(6),
            "failedStep" to
              JsonObject(
                mapOf(
                  "stepIndex" to JsonPrimitive(3),
                  "tool" to JsonPrimitive("observe"),
                  "error" to JsonPrimitive("Assertion failed: expected content not visible"),
                  "device" to JsonPrimitive("B"),
                )
              ),
          )
        )
      ),
    )

    val result = AutoMobilePlanExecutor.execute(
        "test-plans/dual-device-plain.yaml",
        emptyMap(),
        AutoMobilePlanExecutionOptions(aiAssistance = false),
    )

    assertFalse("Execution should fail", result.success)
    val errorMessage = result.errorMessage
    assertTrue(
      "Error should include the error text",
      errorMessage.contains("Assertion failed: expected content not visible"),
    )
  }

  private fun successResponse(executedSteps: Int, totalSteps: Int): DaemonResponse =
    buildDaemonResponse(
      JsonObject(
        mapOf(
          "success" to JsonPrimitive(true),
          "executedSteps" to JsonPrimitive(executedSteps),
          "totalSteps" to JsonPrimitive(totalSteps),
        )
      )
    )

  private fun perDeviceStepResult(toolName: String, device: String): JsonObject =
    JsonObject(
      mapOf(
        "toolName" to JsonPrimitive(toolName),
        "success" to JsonPrimitive(true),
        "device" to JsonPrimitive(device),
      )
    )

  private fun buildDaemonResponse(payload: JsonObject): DaemonResponse {
    val textPayload = json.encodeToString(JsonElement.serializer(), payload)
    return DaemonResponse(
      id = "test",
      type = "mcp_response",
      success = true,
      result =
        JsonObject(
          mapOf(
            "content" to
              JsonArray(
                listOf(
                  JsonObject(
                    mapOf(
                      "type" to JsonPrimitive("text"),
                      "text" to JsonPrimitive(textPayload),
                    )
                  )
                )
              )
          )
        ),
      error = null,
    )
  }
}

/**
 * Tests for two-device plans using criticalSection for inter-device coordination.
 *
 * The criticalSection barrier ensures all devices arrive before any proceeds, then executes
 * device-specific sub-steps serially. This demonstrates stepping through coordinated test steps on
 * a per-device basis within the critical section.
 */
class TwoDeviceCriticalSectionPlanTest {
  private val json = Json { ignoreUnknownKeys = true }
  private lateinit var capturingClient: MultiDeviceCapturingFakeDaemonToolClient
  private lateinit var runner: AutoMobileRunner
  private lateinit var notifier: MultiDeviceRecordingRunNotifier

  @Before
  fun setup() {
    capturingClient = MultiDeviceCapturingFakeDaemonToolClient()
    DaemonSocketClientManager.testClient = capturingClient
    AutoMobileSharedUtils.testDeviceChecker = TwoDeviceFakeChecker()
    DaemonHeartbeat.testController = MultiDeviceFakeDaemonHeartbeat()
    runner = AutoMobileRunner(TwoDeviceCriticalSectionTestTarget::class.java)
    notifier = MultiDeviceRecordingRunNotifier()
  }

  @After
  fun tearDown() {
    DaemonSocketClientManager.testClient = null
    AutoMobileSharedUtils.testDeviceChecker = null
    DaemonHeartbeat.testController = null
    SystemPropertyCache.clear()
    PlanCache.clear()
    RegexCache.clear()
    TestTimingCache.clear()
  }

  @Test
  fun `plan content includes critical section step with lock name and device count`() {
    capturingClient.setResponse("executePlan", successResponse(executedSteps = 5, totalSteps = 5))

    AutoMobilePlanExecutor.execute(
        "test-plans/dual-device-critical-section.yaml",
        emptyMap(),
        AutoMobilePlanExecutionOptions(aiAssistance = false),
    )

    val planContent =
      capturingClient.capturedArguments?.get("planContent")?.jsonPrimitive?.content
    assertNotNull("Plan content should be sent to daemon", planContent)
    val decoded = decodePlanContent(planContent!!)
    assertTrue("Plan should include criticalSection tool", decoded.contains("criticalSection"))
    assertTrue("Plan should specify a lock name", decoded.contains("lock:"))
    assertTrue("Plan should require both devices at barrier", decoded.contains("deviceCount: 2"))
  }

  @Test
  fun `critical section contains device-specific sub-steps for device A and device B`() {
    capturingClient.setResponse("executePlan", successResponse(executedSteps = 5, totalSteps = 5))

    AutoMobilePlanExecutor.execute(
        "test-plans/dual-device-critical-section.yaml",
        emptyMap(),
        AutoMobilePlanExecutionOptions(aiAssistance = false),
    )

    val decoded =
      decodePlanContent(
        capturingClient.capturedArguments!!["planContent"]!!.jsonPrimitive.content
      )
    // Scope device assertions strictly to the criticalSection step's own params block.
    // Search for "tool: criticalSection" (not just "criticalSection") to skip any occurrence
    // in the plan name or description. Then trim at "\n\n  - tool:" which is the blank-line
    // separator before the next top-level step, ensuring trailing terminateApp "device:" labels
    // cannot satisfy the assertion if criticalSection sub-steps lose their device assignments.
    val afterCriticalSection =
      decoded.substringAfter("tool: criticalSection", missingDelimiterValue = "")
    assertTrue("criticalSection tool step should be present", afterCriticalSection.isNotEmpty())
    val criticalSectionBlock = afterCriticalSection.substringBefore("\n\n  - tool:")
    assertTrue(
      "CriticalSection sub-steps should target device A",
      criticalSectionBlock.contains("device: A"),
    )
    assertTrue(
      "CriticalSection sub-steps should target device B",
      criticalSectionBlock.contains("device: B"),
    )
  }

  @Test
  fun `runner succeeds when daemon completes all steps including critical section`() {
    // Five steps: launchApp A, launchApp B, criticalSection (coord), terminateApp A, terminateApp B
    capturingClient.setResponse(
      "executePlan",
      buildDaemonResponse(
        JsonObject(
          mapOf(
            "success" to JsonPrimitive(true),
            "executedSteps" to JsonPrimitive(5),
            "totalSteps" to JsonPrimitive(5),
            "toolResults" to
              JsonArray(
                listOf(
                  perDeviceStepResult("launchApp", "A"),
                  perDeviceStepResult("launchApp", "B"),
                  coordinationStepResult("criticalSection"),
                  perDeviceStepResult("terminateApp", "A"),
                  perDeviceStepResult("terminateApp", "B"),
                )
              ),
          )
        )
      ),
    )

    val result = AutoMobilePlanExecutor.execute(
        "test-plans/dual-device-critical-section.yaml",
        emptyMap(),
        AutoMobilePlanExecutionOptions(aiAssistance = false),
    )

    assertTrue("Execution should succeed for criticalSection plan", result.success)
  }

  @Test
  fun `runner reports failure with device context when step inside critical section fails`() {
    capturingClient.setResponse(
      "executePlan",
      buildDaemonResponse(
        JsonObject(
          mapOf(
            "success" to JsonPrimitive(false),
            "executedSteps" to JsonPrimitive(2),
            "totalSteps" to JsonPrimitive(5),
            "failedStep" to
              JsonObject(
                mapOf(
                  "stepIndex" to JsonPrimitive(2),
                  "tool" to JsonPrimitive("inputText"),
                  "error" to JsonPrimitive("Timeout waiting for input element"),
                  "device" to JsonPrimitive("A"),
                )
              ),
          )
        )
      ),
    )

    val result = AutoMobilePlanExecutor.execute(
        "test-plans/dual-device-critical-section.yaml",
        emptyMap(),
        AutoMobilePlanExecutionOptions(aiAssistance = false),
    )

    assertFalse("Execution should fail", result.success)
    assertTrue(
      "Error should include the error text",
      result.errorMessage.contains("Timeout waiting for input element"),
    )
  }

  private fun successResponse(executedSteps: Int, totalSteps: Int): DaemonResponse =
    buildDaemonResponse(
      JsonObject(
        mapOf(
          "success" to JsonPrimitive(true),
          "executedSteps" to JsonPrimitive(executedSteps),
          "totalSteps" to JsonPrimitive(totalSteps),
        )
      )
    )

  private fun perDeviceStepResult(toolName: String, device: String): JsonObject =
    JsonObject(
      mapOf(
        "toolName" to JsonPrimitive(toolName),
        "success" to JsonPrimitive(true),
        "device" to JsonPrimitive(device),
      )
    )

  private fun coordinationStepResult(toolName: String): JsonObject =
    JsonObject(
      mapOf(
        "toolName" to JsonPrimitive(toolName),
        "success" to JsonPrimitive(true),
      )
    )

  private fun buildDaemonResponse(payload: JsonObject): DaemonResponse {
    val textPayload = json.encodeToString(JsonElement.serializer(), payload)
    return DaemonResponse(
      id = "test",
      type = "mcp_response",
      success = true,
      result =
        JsonObject(
          mapOf(
            "content" to
              JsonArray(
                listOf(
                  JsonObject(
                    mapOf(
                      "type" to JsonPrimitive("text"),
                      "text" to JsonPrimitive(textPayload),
                    )
                  )
                )
              )
          )
        ),
      error = null,
    )
  }
}

/** Target class for plain two-device plan tests. */
class TwoDevicePlainTestTarget {
  @Test
  fun testParallelDeviceOps() {}
}

/** Target class for criticalSection two-device plan tests. */
class TwoDeviceCriticalSectionTestTarget {
  @Test
  fun testCriticalSectionCoordination() {}
}

// Shared test infrastructure

private class MultiDeviceCapturingFakeDaemonToolClient : DaemonToolClient {
  override val sessionUuid: String = "test-session-multidevice"
  var capturedToolName: String? = null
  var capturedArguments: JsonObject? = null
  private val responses = mutableMapOf<String, DaemonResponse>()

  fun setResponse(toolName: String, response: DaemonResponse) {
    responses[toolName] = response
  }

  override fun callTool(
    toolName: String,
    arguments: JsonObject,
    timeoutMs: Long,
  ): DaemonResponse {
    capturedToolName = toolName
    capturedArguments = arguments
    return responses[toolName]
      ?: throw IllegalStateException("No response configured for tool: $toolName")
  }

  override fun readResource(uri: String, timeoutMs: Long): DaemonResponse {
    throw IllegalStateException("readResource not configured for $uri")
  }
}

private class TwoDeviceFakeChecker : DeviceChecker {
  override fun checkDeviceAvailability() = Unit

  override fun areDevicesAvailable(): Boolean = true

  override fun getDeviceCount(): Int = 2
}

private class MultiDeviceFakeDaemonHeartbeat : DaemonHeartbeatController {
  override fun startBackground(intervalMs: Long) = java.io.Closeable {}

  override fun registerSession(sessionId: String) = Unit

  override fun unregisterSession(sessionId: String) = Unit
}

private class MultiDeviceFakeConnectivityChecker : DaemonConnectivityChecker {
  override fun isDaemonAlive(): Boolean = true

  override fun waitForDaemon(timeoutMs: Long): Boolean = true
}

private class MultiDeviceRecordingRunNotifier : RunNotifier() {
  val startedDescriptions = mutableListOf<Description>()
  val finishedDescriptions = mutableListOf<Description>()
  val failures = mutableListOf<Failure>()

  override fun fireTestStarted(description: Description) {
    startedDescriptions.add(description)
  }

  override fun fireTestFinished(description: Description) {
    finishedDescriptions.add(description)
  }

  override fun fireTestFailure(failure: Failure) {
    failures.add(failure)
  }
}

private fun invokeRunChild(
  runner: AutoMobileRunner,
  method: FrameworkMethod,
  notifier: RunNotifier,
) {
  val runChildMethod =
    AutoMobileRunner::class
      .java
      .getDeclaredMethod("runChild", FrameworkMethod::class.java, RunNotifier::class.java)
  runChildMethod.isAccessible = true
  runChildMethod.invoke(runner, method, notifier)
}

private fun decodePlanContent(planContent: String): String {
  val base64 = planContent.removePrefix("base64:")
  return String(Base64.getDecoder().decode(base64))
}
