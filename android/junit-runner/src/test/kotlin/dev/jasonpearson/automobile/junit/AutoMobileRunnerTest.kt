package dev.jasonpearson.automobile.junit

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.*
import org.junit.Test

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
    val args = runner.invokeBuildDaemonExecutePlanArgs("Zm9v", annotation, "session-123")

    assertEquals("base64:Zm9v", args["planContent"]?.jsonPrimitive?.content)
    assertEquals("android", args["platform"]?.jsonPrimitive?.content)
    assertEquals(0, args["startStep"]?.jsonPrimitive?.content?.toInt())
    assertEquals("session-123", args["sessionUuid"]?.jsonPrimitive?.content)
    assertNull("deviceId should be omitted when device=auto", args["deviceId"])
    assertNull("cleanupAppId should be omitted when appId is blank", args["cleanupAppId"])
  }

  @Test
  fun testBuildDaemonExecutePlanArgsWithDevice() {
    val runner = AutoMobileRunner(TestTargetClass::class.java)
    val method = TestTargetClass::class.java.getMethod("testWithSpecificDevice")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)
    val args = runner.invokeBuildDaemonExecutePlanArgs("Zm9v", annotation, "session-456")

    assertEquals("emulator-5554", args["deviceId"]?.jsonPrimitive?.content)
  }

  @Test
  fun testBuildDaemonExecutePlanArgsWithCleanup() {
    val runner = AutoMobileRunner(TestTargetClass::class.java)
    val method = TestTargetClass::class.java.getMethod("testWithCleanup")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)
    val args = runner.invokeBuildDaemonExecutePlanArgs("Zm9v", annotation, "session-789")

    assertEquals("com.example.app", args["cleanupAppId"]?.jsonPrimitive?.content)
    assertEquals("true", args["cleanupClearAppData"]?.jsonPrimitive?.content)
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
): JsonObject {
  val method =
      this::class
          .java
          .getDeclaredMethod(
              "buildDaemonExecutePlanArgs",
              String::class.java,
              AutoMobileTest::class.java,
              String::class.java,
          )
  method.isAccessible = true
  return method.invoke(this, base64PlanContent, annotation, sessionUuid) as JsonObject
}
