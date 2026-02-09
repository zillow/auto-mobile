package dev.jasonpearson.automobile.junit

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.Description
import org.junit.runner.notification.Failure
import org.junit.runner.notification.RunNotifier
import org.junit.runners.model.FrameworkMethod

/**
 * Unit tests for the AutoMobileRunner.
 *
 * These tests verify the core functionality of the custom JUnit runner including annotation
 * detection, plan resolution, and execution flow.
 */
class AutoMobileRunnerTest {

  @After
  fun cleanUp() {
    // Reset system properties after each test to avoid interference
    System.clearProperty("automobile.debug")
    // Clear cached properties and plans to ensure fresh reads
    SystemPropertyCache.clear()
    PlanCache.clear()
    RegexCache.clear() // Phase 6: Clear regex cache for test isolation
    TestTimingCache.clear()
  }

  @Test
  fun testRunnerCreation() {
    val runner = AutoMobileRunner(TestTargetClass::class.java)
    assertNotNull(runner)
  }

  @Test
  fun testGetPlanPathWithValue() {
    val runner = AutoMobileRunner(TestTargetClass::class.java)
    val method = TestTargetClass::class.java.getMethod("testWithAutoMobileAnnotation")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)

    val planPath = runner.invokeGetPlanPath(annotation)
    assertEquals("test-plans/launch-clock.yaml", planPath)
  }

  @Test
  fun testGetPlanPathWithPlanParameter() {
    val runner = AutoMobileRunner(TestTargetClass::class.java)
    val method = TestTargetClass::class.java.getMethod("testWithPlanParameter")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)

    val planPath = runner.invokeGetPlanPath(annotation)
    assertEquals("test-plans/launch-clock.yaml", planPath)
  }

  @Test
  fun testBuildDaemonExecutePlanArgsIncludesDefaults() {
    val runner = AutoMobileRunner(TestTargetClass::class.java)
    val method = TestTargetClass::class.java.getMethod("testWithAutoMobileAnnotation")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)
    val args =
        runner.invokeBuildDaemonExecutePlanArgs(
            "Zm9v",
            annotation,
            "session-123",
            method.name,
            TestTargetClass::class.java.simpleName,
        )

    assertEquals("base64:Zm9v", args["planContent"]?.jsonPrimitive?.content)
    assertEquals("android", args["platform"]?.jsonPrimitive?.content)
    assertEquals(0, args["startStep"]?.jsonPrimitive?.content?.toInt())
    assertEquals("session-123", args["sessionUuid"]?.jsonPrimitive?.content)
    assertNull("deviceId should be omitted when device=auto", args["deviceId"])
    assertNull("cleanupAppId should be omitted when appId is blank", args["cleanupAppId"])

    val metadata = args["testMetadata"]?.jsonObject
    assertNotNull("testMetadata should be included by default", metadata)
    assertEquals("TestTargetClass", metadata?.get("testClass")?.jsonPrimitive?.content)
    assertEquals(
        "testWithAutoMobileAnnotation",
        metadata?.get("testMethod")?.jsonPrimitive?.content,
    )
  }

  @Test
  fun testBuildDaemonExecutePlanArgsWithDevice() {
    val runner = AutoMobileRunner(TestTargetClass::class.java)
    val method = TestTargetClass::class.java.getMethod("testWithSpecificDevice")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)
    val args =
        runner.invokeBuildDaemonExecutePlanArgs(
            "Zm9v",
            annotation,
            "session-456",
            method.name,
            TestTargetClass::class.java.simpleName,
        )

    assertEquals("emulator-5554", args["deviceId"]?.jsonPrimitive?.content)
  }

  @Test
  fun testBuildDaemonExecutePlanArgsWithCleanup() {
    val runner = AutoMobileRunner(TestTargetClass::class.java)
    val method = TestTargetClass::class.java.getMethod("testWithCleanup")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)
    val args =
        runner.invokeBuildDaemonExecutePlanArgs(
            "Zm9v",
            annotation,
            "session-789",
            method.name,
            TestTargetClass::class.java.simpleName,
        )

    assertEquals("com.example.app", args["cleanupAppId"]?.jsonPrimitive?.content)
    assertEquals("true", args["cleanupClearAppData"]?.jsonPrimitive?.content)
  }

  @Test
  fun testParseDaemonToolResultIncludesFailedStepInfoInErrorMessage() {
    val runner = AutoMobileRunner(TestTargetClass::class.java)

    // Build a daemon response with failedStep info
    val failedStepJson =
        JsonObject(
            mapOf(
                "stepIndex" to JsonPrimitive(3),
                "tool" to JsonPrimitive("tapOn"),
                "error" to JsonPrimitive("Element \"Submit Button\" not found on screen"),
                "device" to JsonPrimitive("emulator-5554"),
            )
        )
    val resultPayload =
        JsonObject(
            mapOf(
                "success" to JsonPrimitive(false),
                "executedSteps" to JsonPrimitive(3),
                "totalSteps" to JsonPrimitive(10),
                "failedStep" to failedStepJson,
                "error" to JsonPrimitive("Plan execution failed"),
            )
        )
    val contentItem =
        JsonObject(
            mapOf(
                "type" to JsonPrimitive("text"),
                "text" to JsonPrimitive(Json.encodeToString(JsonObject.serializer(), resultPayload)),
            )
        )
    val daemonResult =
        JsonObject(
            mapOf(
                "content" to JsonArray(listOf(contentItem)),
            )
        )

    val parseResult =
        runner.invokeParseDaemonToolResult(
            id = "test-1",
            type = "response",
            success = true,
            result = daemonResult,
            error = null,
            json = Json { ignoreUnknownKeys = true },
        )

    assertFalse("Parse result should indicate failure", parseResult.first)
    val errorMessage = parseResult.second
    assertTrue("Error should contain step index (1-based)", errorMessage.contains("step 4"))
    assertTrue("Error should contain tool name", errorMessage.contains("tapOn"))
    assertTrue(
        "Error should contain error text",
        errorMessage.contains("Element \"Submit Button\" not found on screen"),
    )
    assertTrue("Error should contain device", errorMessage.contains("emulator-5554"))
    assertTrue("Error should contain step counts", errorMessage.contains("3/10"))
  }

  @Test
  fun testParseDaemonToolResultFallsBackToErrorWhenNoFailedStep() {
    val runner = AutoMobileRunner(TestTargetClass::class.java)

    // Build a daemon response without failedStep info
    val resultPayload =
        JsonObject(
            mapOf(
                "success" to JsonPrimitive(false),
                "executedSteps" to JsonPrimitive(5),
                "totalSteps" to JsonPrimitive(10),
                "error" to JsonPrimitive("Connection timeout"),
            )
        )
    val contentItem =
        JsonObject(
            mapOf(
                "type" to JsonPrimitive("text"),
                "text" to JsonPrimitive(Json.encodeToString(JsonObject.serializer(), resultPayload)),
            )
        )
    val daemonResult =
        JsonObject(
            mapOf(
                "content" to JsonArray(listOf(contentItem)),
            )
        )

    val parseResult =
        runner.invokeParseDaemonToolResult(
            id = "test-2",
            type = "response",
            success = true,
            result = daemonResult,
            error = null,
            json = Json { ignoreUnknownKeys = true },
        )

    assertFalse("Parse result should indicate failure", parseResult.first)
    val errorMessage = parseResult.second
    assertTrue("Error should contain fallback message", errorMessage.contains("Connection timeout"))
  }
}

/** Test target class with various AutoMobile test annotations. */
class TestTargetClass {

  @AutoMobileTest(plan = "test-plans/launch-clock.yaml") fun testWithAutoMobileAnnotation() {}

  @Test fun testWithoutAutoMobileAnnotation() {}

  @AutoMobileTest(plan = "test-plans/launch-clock.yaml", aiAssistance = false)
  fun testWithPlanParameter() {}

  @AutoMobileTest(plan = "test-plans/launch-clock.yaml", device = "emulator-5554")
  fun testWithSpecificDevice() {}

  @AutoMobileTest(
      plan = "test-plans/launch-clock.yaml",
      appId = "com.example.app",
      clearAppData = true,
  )
  fun testWithCleanup() {}

  fun testMethodWithoutAnnotation() {}
}

/**
 * Extension functions to access private methods for testing. In a real implementation, these would
 * be internal or package-private.
 */
fun AutoMobileRunner.invokeGetPlanPath(annotation: AutoMobileTest): String {
  val method = this::class.java.getDeclaredMethod("getPlanPath", AutoMobileTest::class.java)
  method.isAccessible = true
  return method.invoke(this, annotation) as String
}

fun AutoMobileRunner.invokeBuildDaemonExecutePlanArgs(
    base64PlanContent: String,
    annotation: AutoMobileTest,
    sessionUuid: String,
    testName: String,
    className: String,
): JsonObject {
  val method =
      this::class
          .java
          .getDeclaredMethod(
              "buildDaemonExecutePlanArgs",
              String::class.java,
              AutoMobileTest::class.java,
              String::class.java,
              String::class.java,
              String::class.java,
          )
  method.isAccessible = true
  return method.invoke(this, base64PlanContent, annotation, sessionUuid, testName, className)
      as JsonObject
}

fun AutoMobileRunner.invokeParseDaemonToolResult(
    id: String,
    type: String,
    success: Boolean,
    result: JsonElement?,
    error: String?,
    json: Json,
): Pair<Boolean, String> {
  // Find the DaemonResponse class and construct it via reflection (it's internal)
  val daemonResponseClass =
      Class.forName("dev.jasonpearson.automobile.junit.DaemonResponse")
  val daemonResponseConstructor =
      daemonResponseClass.getDeclaredConstructor(
          String::class.java,
          String::class.java,
          Boolean::class.java,
          JsonElement::class.java,
          String::class.java,
      )
  daemonResponseConstructor.isAccessible = true
  val response = daemonResponseConstructor.newInstance(id, type, success, result, error)

  val method =
      this::class
          .java
          .getDeclaredMethod(
              "parseDaemonToolResult",
              daemonResponseClass,
              Json::class.java,
          )
  method.isAccessible = true
  val parseResult = method.invoke(this, response, json)
  // ParsedToolResult is a private data class, so use reflection to extract values
  val successField = parseResult::class.java.getDeclaredField("success")
  successField.isAccessible = true
  val parseSuccess = successField.get(parseResult) as Boolean
  val errorMessageField = parseResult::class.java.getDeclaredField("errorMessage")
  errorMessageField.isAccessible = true
  val errorMessage = errorMessageField.get(parseResult) as String
  return Pair(parseSuccess, errorMessage)
}

/**
 * Full-flow tests that exercise runChild → runAutoMobileTest → notifier to verify that daemon
 * responses correctly produce JUnit pass/fail events.
 */
class AutoMobileRunnerFailureReportingTest {
  private val json = Json { ignoreUnknownKeys = true }
  private lateinit var fakeDaemonClient: RunnerFakeDaemonToolClient
  private lateinit var fakeDeviceChecker: RunnerFakeDeviceChecker
  private lateinit var runner: AutoMobileRunner
  private lateinit var notifier: RecordingRunNotifier

  @Before
  fun setup() {
    fakeDaemonClient = RunnerFakeDaemonToolClient()
    fakeDeviceChecker = RunnerFakeDeviceChecker(devicesAvailable = true)
    DaemonSocketClientManager.testClient = fakeDaemonClient
    AutoMobileSharedUtils.testDeviceChecker = fakeDeviceChecker
    DaemonHeartbeat.testController = RunnerFakeDaemonHeartbeat()
    AutoMobileRunner.testConnectivityChecker = FakeDaemonConnectivityChecker()
    runner = AutoMobileRunner(RunnerTestTarget::class.java)
    notifier = RecordingRunNotifier()
  }

  @After
  fun tearDown() {
    DaemonSocketClientManager.testClient = null
    AutoMobileSharedUtils.testDeviceChecker = null
    DaemonHeartbeat.testController = null
    AutoMobileRunner.testConnectivityChecker = null
    SystemPropertyCache.clear()
    PlanCache.clear()
    RegexCache.clear()
    TestTimingCache.clear()
  }

  @Test
  fun testRunChildFiresTestFailureWhenDaemonReturnsFailure() {
    val failedStepJson =
        JsonObject(
            mapOf(
                "stepIndex" to JsonPrimitive(2),
                "tool" to JsonPrimitive("tapOn"),
                "error" to JsonPrimitive("Element not found"),
                "device" to JsonPrimitive("emulator-5554"),
            )
        )
    fakeDaemonClient.setResponse(
        "executePlan",
        buildDaemonResponse(
            JsonObject(
                mapOf(
                    "success" to JsonPrimitive(false),
                    "executedSteps" to JsonPrimitive(2),
                    "totalSteps" to JsonPrimitive(5),
                    "failedStep" to failedStepJson,
                )
            )
        ),
    )

    val method = RunnerTestTarget::class.java.getMethod("testLaunchClockApp")
    val frameworkMethod =
        runner.testClass.annotatedMethods.first { it.name == method.name }
    invokeRunChild(runner, frameworkMethod, notifier)

    assertEquals("fireTestStarted should be called once", 1, notifier.startedDescriptions.size)
    assertEquals("fireTestFinished should be called once", 1, notifier.finishedDescriptions.size)
    assertEquals("fireTestFailure should be called once", 1, notifier.failures.size)
    val failureMessage = notifier.failures[0].message
    assertTrue(
        "Failure message should mention the failed step",
        failureMessage.contains("Element not found"),
    )
  }

  @Test
  fun testRunChildFiresTestFailureWhenDaemonSuccessFieldMissing() {
    fakeDaemonClient.setResponse(
        "executePlan",
        buildDaemonResponse(
            JsonObject(
                mapOf(
                    "executedSteps" to JsonPrimitive(3),
                    "totalSteps" to JsonPrimitive(5),
                )
            )
        ),
    )

    val method = RunnerTestTarget::class.java.getMethod("testLaunchClockApp")
    val frameworkMethod =
        runner.testClass.annotatedMethods.first { it.name == method.name }
    invokeRunChild(runner, frameworkMethod, notifier)

    assertEquals("fireTestStarted should be called once", 1, notifier.startedDescriptions.size)
    assertEquals("fireTestFinished should be called once", 1, notifier.finishedDescriptions.size)
    assertEquals(
        "fireTestFailure should be called when success field is missing",
        1,
        notifier.failures.size,
    )
  }

  @Test
  fun testRunChildDoesNotFireTestFailureOnSuccess() {
    fakeDaemonClient.setResponse(
        "executePlan",
        buildDaemonResponse(
            JsonObject(
                mapOf(
                    "success" to JsonPrimitive(true),
                    "executedSteps" to JsonPrimitive(5),
                    "totalSteps" to JsonPrimitive(5),
                )
            )
        ),
    )

    val method = RunnerTestTarget::class.java.getMethod("testLaunchClockApp")
    val frameworkMethod =
        runner.testClass.annotatedMethods.first { it.name == method.name }
    invokeRunChild(runner, frameworkMethod, notifier)

    assertEquals("fireTestStarted should be called once", 1, notifier.startedDescriptions.size)
    assertEquals("fireTestFinished should be called once", 1, notifier.finishedDescriptions.size)
    assertTrue("fireTestFailure should NOT be called on success", notifier.failures.isEmpty())
  }

  private fun invokeRunChild(
      runner: AutoMobileRunner,
      method: FrameworkMethod,
      notifier: RunNotifier,
  ) {
    val runChildMethod =
        AutoMobileRunner::class
            .java
            .getDeclaredMethod(
                "runChild",
                FrameworkMethod::class.java,
                RunNotifier::class.java,
            )
    runChildMethod.isAccessible = true
    runChildMethod.invoke(runner, method, notifier)
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

/** Test target class for failure reporting tests. Uses an existing test resource plan. */
class RunnerTestTarget {
  @Test
  @AutoMobileTest(plan = "test-plans/launch-clock-app.yaml", aiAssistance = false)
  fun testLaunchClockApp() {}
}

/** RunNotifier that records events for assertion in tests. */
private class RecordingRunNotifier : RunNotifier() {
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

private class FakeDaemonConnectivityChecker : DaemonConnectivityChecker {
  override fun isDaemonAlive(): Boolean = true

  override fun waitForDaemon(timeoutMs: Long): Boolean = true
}

private class RunnerFakeDaemonToolClient : DaemonToolClient {
  private val responses = mutableMapOf<String, DaemonResponse>()
  override val sessionUuid: String = "test-session"

  fun setResponse(toolName: String, response: DaemonResponse) {
    responses[toolName] = response
  }

  override fun callTool(
      toolName: String,
      arguments: JsonObject,
      timeoutMs: Long,
  ): DaemonResponse {
    return responses[toolName]
        ?: throw IllegalStateException("No response configured for tool: $toolName")
  }

  override fun readResource(uri: String, timeoutMs: Long): DaemonResponse {
    throw IllegalStateException("readResource not configured for $uri")
  }
}

private class RunnerFakeDeviceChecker(private val devicesAvailable: Boolean) : DeviceChecker {
  override fun checkDeviceAvailability() = Unit

  override fun areDevicesAvailable(): Boolean = devicesAvailable

  override fun getDeviceCount(): Int = if (devicesAvailable) 1 else 0
}

private class RunnerFakeDaemonHeartbeat : DaemonHeartbeatController {
  override fun startBackground(intervalMs: Long) = java.io.Closeable {}

  override fun registerSession(sessionId: String) = Unit

  override fun unregisterSession(sessionId: String) = Unit
}
