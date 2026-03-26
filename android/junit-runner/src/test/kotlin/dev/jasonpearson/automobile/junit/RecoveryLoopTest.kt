package dev.jasonpearson.automobile.junit

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Tests for the Koog recovery loop in [AutoMobilePlanExecutor].
 *
 * Verifies: once-per-test guard, resume-from-step, structured context, config provider usage, and
 * that recovery is skipped when aiAssistance=false or CI mode is on.
 */
class RecoveryLoopTest {
  private val json = Json { ignoreUnknownKeys = true }
  private lateinit var fakeDaemonClient: RecoveryFakeDaemonToolClient
  private lateinit var fakeAgent: RecoveryFakeAutoMobileAgent

  @Before
  fun setup() {
    fakeDaemonClient = RecoveryFakeDaemonToolClient()
    fakeAgent = RecoveryFakeAutoMobileAgent()
    DaemonSocketClientManager.testClient = fakeDaemonClient
    AutoMobileSharedUtils.testDeviceChecker = RecoveryFakeDeviceChecker()
    DaemonHeartbeat.testController = RecoveryFakeHeartbeat()
    AutoMobilePlanExecutor.testAgent = fakeAgent
    // Force CI mode off so recovery tests can exercise the recovery path
    // even when running in CI (where CI env var is set)
    System.setProperty("automobile.ci.mode", "false")
  }

  @After
  fun tearDown() {
    DaemonSocketClientManager.testClient = null
    AutoMobileSharedUtils.testDeviceChecker = null
    DaemonHeartbeat.testController = null
    AutoMobilePlanExecutor.testAgent = null
    System.clearProperty("automobile.ci.mode")
  }

  @Test
  fun `recovery fires on failure when aiAssistance is true`() {
    // First call fails at step 2, second call (resume) succeeds
    fakeDaemonClient.responses.add(buildFailureResponse(failedStepIndex = 2, failedTool = "tapOn"))
    fakeDaemonClient.responses.add(buildSuccessResponse())
    fakeAgent.recoveryOutcome = RecoveryOutcome(success = true, recoveryTimeMs = 100, observeResultAfterRecovery = "{}")

    val result = executePlan(aiAssistance = true)

    assertTrue("Test should pass after recovery + resume", result.success)
    assertTrue("Recovery should have been attempted", result.aiRecoveryAttempted)
    assertTrue("Recovery should be marked successful", result.aiRecoverySuccessful)
    assertEquals(1, fakeAgent.recoveryCalls.size)
  }

  @Test
  fun `recovery does NOT fire when aiAssistance is false`() {
    fakeDaemonClient.responses.add(buildFailureResponse(failedStepIndex = 1, failedTool = "tapOn"))

    val result = executePlan(aiAssistance = false)

    assertFalse("Test should fail", result.success)
    assertFalse("Recovery should not have been attempted", result.aiRecoveryAttempted)
    assertEquals(0, fakeAgent.recoveryCalls.size)
  }

  @Test
  fun `recovery does NOT fire when ai-recovery feature flag is disabled`() {
    // Replace the agent with one whose recoveryConfigProvider returns enabled=false
    fakeAgent = RecoveryFakeAutoMobileAgent(recoveryEnabled = false)
    AutoMobilePlanExecutor.testAgent = fakeAgent
    fakeDaemonClient.responses.add(buildFailureResponse(failedStepIndex = 1, failedTool = "tapOn"))

    val result = executePlan(aiAssistance = true)

    assertFalse("Test should fail when feature flag is disabled", result.success)
    assertEquals(0, fakeAgent.recoveryCalls.size)
  }

  @Test
  fun `recovery does NOT fire in CI mode`() {
    System.setProperty("automobile.ci.mode", "true")
    fakeDaemonClient.responses.add(buildFailureResponse(failedStepIndex = 1, failedTool = "tapOn"))

    val result = executePlan(aiAssistance = true)

    assertFalse("Test should fail in CI mode", result.success)
    assertEquals(0, fakeAgent.recoveryCalls.size)
  }

  @Test
  fun `once-per-test guard prevents second recovery attempt`() {
    // First call fails at step 2 → recovery → resume from step 3 → fails at step 4
    fakeDaemonClient.responses.add(buildFailureResponse(failedStepIndex = 2, failedTool = "tapOn"))
    fakeDaemonClient.responses.add(buildFailureResponse(failedStepIndex = 4, failedTool = "swipe"))
    fakeAgent.recoveryOutcome = RecoveryOutcome(success = true, recoveryTimeMs = 100, observeResultAfterRecovery = "{}")

    val result = executePlan(aiAssistance = true)

    assertFalse("Test should fail after second step failure (no retry)", result.success)
    assertTrue("Recovery should have been attempted", result.aiRecoveryAttempted)
    assertEquals("Recovery should only be called once", 1, fakeAgent.recoveryCalls.size)
  }

  @Test
  fun `resume-from-step passes correct startStep to daemon`() {
    // First call fails at step 2
    fakeDaemonClient.responses.add(buildFailureResponse(failedStepIndex = 2, failedTool = "tapOn"))
    fakeDaemonClient.responses.add(buildSuccessResponse())
    fakeAgent.recoveryOutcome = RecoveryOutcome(success = true, recoveryTimeMs = 100, observeResultAfterRecovery = "{}")

    executePlan(aiAssistance = true)

    // The second daemon call should have startStep = 3 (failedStepIndex + 1)
    assertEquals("Should have made 2 daemon calls", 2, fakeDaemonClient.callArgs.size)
    val resumeArgs = fakeDaemonClient.callArgs[1]
    assertEquals(3, resumeArgs["startStep"]?.let { (it as JsonPrimitive).content.toInt() })
  }

  @Test
  fun `resume pins to the same device that was recovered`() {
    // Failure response includes device "emulator-5554"
    fakeDaemonClient.responses.add(
        buildFailureResponse(failedStepIndex = 1, failedTool = "tapOn", device = "emulator-5554")
    )
    fakeDaemonClient.responses.add(buildSuccessResponse())
    fakeAgent.recoveryOutcome = RecoveryOutcome(success = true, recoveryTimeMs = 50, observeResultAfterRecovery = "{}")

    // Execute with device="auto" (default)
    executePlan(aiAssistance = true)

    assertEquals("Should have made 2 daemon calls", 2, fakeDaemonClient.callArgs.size)
    // First call should NOT have deviceId (auto mode)
    assertNull(
        "First call should not pin a device",
        fakeDaemonClient.callArgs[0]["deviceId"],
    )
    // Resume call should pin to the recovered device
    assertEquals(
        "Resume should pin to recovered device",
        "emulator-5554",
        fakeDaemonClient.callArgs[1]["deviceId"]?.let { (it as JsonPrimitive).content },
    )
  }

  @Test
  fun `FailedStepContext is populated correctly`() {
    val toolResults = JsonArray(
        listOf(
            JsonObject(mapOf("toolName" to JsonPrimitive("observe"))),
            JsonObject(mapOf("toolName" to JsonPrimitive("tapOn"))),
        )
    )
    fakeDaemonClient.responses.add(
        buildFailureResponse(
            failedStepIndex = 2,
            failedTool = "swipe",
            error = "No scrollable container",
            toolResults = toolResults,
        )
    )
    fakeDaemonClient.responses.add(buildSuccessResponse())
    fakeAgent.recoveryOutcome = RecoveryOutcome(success = true, recoveryTimeMs = 50, observeResultAfterRecovery = "{}")

    executePlan(aiAssistance = true)

    assertEquals(1, fakeAgent.recoveryCalls.size)
    val context = fakeAgent.recoveryCalls[0]
    assertEquals(2, context.failedStepIndex)
    assertEquals("swipe", context.failedTool)
    assertEquals("No scrollable container", context.error)
    assertEquals(2, context.succeededSteps.size)
    assertEquals("observe", context.succeededSteps[0].tool)
    assertEquals("tapOn", context.succeededSteps[1].tool)
  }

  @Test
  fun `recovery failure results in test failure`() {
    fakeDaemonClient.responses.add(buildFailureResponse(failedStepIndex = 1, failedTool = "tapOn"))
    fakeAgent.recoveryOutcome = RecoveryOutcome(success = false, recoveryTimeMs = 200)

    val result = executePlan(aiAssistance = true)

    assertFalse("Test should fail when recovery fails", result.success)
    assertTrue("Recovery should have been attempted", result.aiRecoveryAttempted)
    assertFalse("Recovery should be marked unsuccessful", result.aiRecoverySuccessful)
    assertEquals(1, fakeAgent.recoveryCalls.size)
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private fun executePlan(aiAssistance: Boolean): AutoMobilePlanExecutionResult {
    return AutoMobilePlanExecutor.execute(
        "test-plans/launch-clock-app.yaml",
        emptyMap(),
        AutoMobilePlanExecutionOptions(aiAssistance = aiAssistance),
    )
  }

  private fun buildSuccessResponse(): DaemonResponse {
    return buildDaemonResponse(
        JsonObject(
            mapOf(
                "success" to JsonPrimitive(true),
                "executedSteps" to JsonPrimitive(5),
                "totalSteps" to JsonPrimitive(5),
            )
        )
    )
  }

  private fun buildFailureResponse(
      failedStepIndex: Int,
      failedTool: String,
      error: String = "Element not found",
      toolResults: JsonArray? = null,
      device: String? = null,
  ): DaemonResponse {
    val failedStepFields = mutableMapOf<String, JsonElement>(
        "stepIndex" to JsonPrimitive(failedStepIndex),
        "tool" to JsonPrimitive(failedTool),
        "error" to JsonPrimitive(error),
    )
    if (device != null) {
      failedStepFields["device"] = JsonPrimitive(device)
    }
    val payload = mutableMapOf<String, JsonElement>(
        "success" to JsonPrimitive(false),
        "executedSteps" to JsonPrimitive(failedStepIndex),
        "totalSteps" to JsonPrimitive(5),
        "failedStep" to JsonObject(failedStepFields),
    )
    if (toolResults != null) {
      payload["toolResults"] = toolResults
    }
    return buildDaemonResponse(JsonObject(payload))
  }

  private fun buildDaemonResponse(payload: JsonObject): DaemonResponse {
    val textPayload = json.encodeToString(JsonElement.serializer(), payload)
    val result =
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
        )
    return DaemonResponse(
        id = "test",
        type = "mcp_response",
        success = true,
        result = result,
        error = null,
    )
  }
}

// ── Fakes ───────────────────────────────────────────────────────────────────

/** Fake daemon client that returns responses in order and records call arguments. */
private class RecoveryFakeDaemonToolClient : DaemonToolClient {
  val responses = mutableListOf<DaemonResponse>()
  val callArgs = mutableListOf<JsonObject>()
  private var callIndex = 0
  override val sessionUuid: String = "recovery-test-session"

  override fun callTool(
      toolName: String,
      arguments: JsonObject,
      timeoutMs: Long,
  ): DaemonResponse {
    callArgs.add(arguments)
    return if (callIndex < responses.size) {
      responses[callIndex++]
    } else {
      throw IllegalStateException("No more responses configured (call $callIndex)")
    }
  }

  override fun readResource(uri: String, timeoutMs: Long): DaemonResponse {
    throw IllegalStateException("readResource not configured for $uri")
  }
}

/** Fake agent that records recovery calls and returns a configured outcome. */
private class RecoveryFakeAutoMobileAgent(
    recoveryEnabled: Boolean = true,
) : AutoMobileAgent(
    configProvider = FakeConfigProvider(),
    fileSystemOperations = FakeFileSystemOps(),
    aiAgentFactory = FakeAIAgentFactory(),
    timeProvider = FakeTimeProvider(),
    mcpClient = FakeMCPClient(),
    recoveryConfigProvider = StaticRecoveryConfigProvider(enabled = recoveryEnabled, maxToolCalls = 5),
) {
  var recoveryOutcome: RecoveryOutcome = RecoveryOutcome(success = false, recoveryTimeMs = 0)
  val recoveryCalls = mutableListOf<FailedStepContext>()

  override fun attemptAiRecovery(context: FailedStepContext): RecoveryOutcome {
    recoveryCalls.add(context)
    return recoveryOutcome
  }
}

private class FakeConfigProvider : AutoMobileAgent.ConfigProvider {
  override fun getModelConfig() = AutoMobileAgent.ModelConfig(AutoMobileAgent.ModelProvider.OPENAI, "fake")
  override fun getPlanMaxAgeMs() = 3600000L
  override fun isDebugMode() = false
  override fun getMcpServerUrl() = "http://localhost:0"
}

private class FakeFileSystemOps : AutoMobileAgent.FileSystemOperations {
  override fun createDirectories(dir: java.io.File) {}
  override fun fileExists(file: java.io.File) = false
  override fun writeTextToFile(file: java.io.File, content: String) {}
  override fun getLastModified(file: java.io.File) = 0L
}

private class FakeAIAgentFactory : AutoMobileAgent.AIAgentFactory {
  override fun createAIAgent(config: AutoMobileAgent.ModelConfig): ai.koog.agents.core.agent.AIAgent<String, String> {
    throw UnsupportedOperationException("Not used in recovery tests")
  }
  override fun createAIAgentWithMCPTools(
      config: AutoMobileAgent.ModelConfig,
      mcpClient: AutoMobileAgent.MCPClient,
      maxToolCalls: Int,
  ): ai.koog.agents.core.agent.AIAgent<String, String> {
    throw UnsupportedOperationException("Not used in recovery tests")
  }
}

private class FakeTimeProvider : AutoMobileAgent.TimeProvider {
  override fun currentTimeMillis() = System.currentTimeMillis()
}

private class FakeMCPClient : AutoMobileAgent.MCPClient {
  override fun isConnected() = false
  override fun connect(serverUrl: String) {}
  override fun disconnect() {}
  override fun callTool(toolName: String, parameters: Map<String, Any>) = ""
  override fun listAvailableTools() = emptyList<AutoMobileAgent.MCPToolDefinition>()
}

private class RecoveryFakeDeviceChecker : DeviceChecker {
  override fun checkDeviceAvailability() = Unit
  override fun areDevicesAvailable() = true
  override fun getDeviceCount() = 1
}

private class RecoveryFakeHeartbeat : DaemonHeartbeatController {
  override fun startBackground(intervalMs: Long) = java.io.Closeable {}
  override fun registerSession(sessionId: String) = Unit
  override fun unregisterSession(sessionId: String) = Unit
}
