package com.zillow.automobile.junit

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
    System.clearProperty("automobile.use.npx")
    System.clearProperty("automobile.debug")
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
  fun testBuildAutoMobileCommandWithNpx() {
    System.setProperty("automobile.use.npx", "true")

    val runner = AutoMobileRunner(TestTargetClass::class.java)
    val method = TestTargetClass::class.java.getMethod("testWithAutoMobileAnnotation")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)

    val command = runner.invokeBuildAutoMobileCommand("/path/to/plan.yaml", annotation)

    assertTrue(command.contains("npx"))
    assertTrue(command.contains("auto-mobile@latest"))
    assertTrue(command.contains("--cli"))
    assertTrue(command.contains("test"))
    assertTrue(command.contains("run"))
    assertTrue(command.contains("/path/to/plan.yaml"))
  }

  @Test
  fun testBuildAutoMobileCommandWithoutNpx() {
    System.setProperty("automobile.use.npx", "false")

    val runner = AutoMobileRunner(TestTargetClass::class.java)
    val method = TestTargetClass::class.java.getMethod("testWithAutoMobileAnnotation")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)

    val command = runner.invokeBuildAutoMobileCommand("/path/to/plan.yaml", annotation)
    val commandStr = command.joinToString(" ")

    assertTrue(
        "Command $commandStr should contain 'auto-mobile'", commandStr.contains("auto-mobile"))
    assertTrue("Command $commandStr should contain 'test'", commandStr.contains("test"))
    assertTrue("Command $commandStr should contain 'run'", commandStr.contains("run"))
    assertTrue(
        "Command $commandStr should contain plan path", commandStr.contains("/path/to/plan.yaml"))
    assertFalse(
        "Command $commandStr should NOT contain 'npx' when disabled", commandStr.contains("npx"))
  }

  @Test
  fun testBuildAutoMobileCommandWithSpecificDevice() {
    val runner = AutoMobileRunner(TestTargetClass::class.java)
    val method = TestTargetClass::class.java.getMethod("testWithSpecificDevice")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)

    val command = runner.invokeBuildAutoMobileCommand("/path/to/plan.yaml", annotation)

    assertTrue(command.contains("--device"))
    assertTrue(command.contains("emulator-5554"))
  }

  @Test
  fun testBuildAutoMobileCommandWithDebugMode() {
    System.setProperty("automobile.debug", "true")

    val runner = AutoMobileRunner(TestTargetClass::class.java)
    val method = TestTargetClass::class.java.getMethod("testWithAutoMobileAnnotation")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)

    val command = runner.invokeBuildAutoMobileCommand("/path/to/plan.yaml", annotation)

    assertTrue(command.contains("--debug"))
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

fun AutoMobileRunner.invokeBuildAutoMobileCommand(
    planPath: String,
    annotation: AutoMobileTest
): List<String> {
  val method =
      this::class
          .java
          .getDeclaredMethod(
              "buildAutoMobileCommand", String::class.java, AutoMobileTest::class.java)
  method.isAccessible = true
  @Suppress("UNCHECKED_CAST")
  return method.invoke(this, planPath, annotation) as List<String>
}
