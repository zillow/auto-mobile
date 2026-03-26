package dev.jasonpearson.automobile.junit

import org.junit.Assert.*
import org.junit.Test

/** Simple integration test to verify the AutoMobile JUnitRunner classes work correctly. */
class SimpleIntegrationTest {

  @Test
  fun testAutoMobileRunnerCanBeInstantiated() {
    val runner = AutoMobileRunner(SimpleTestTargetClass::class.java)
    assertNotNull(runner)
  }

  @Test
  fun testAutoMobilePlanExecutionOptionsDefaults() {
    val options = AutoMobilePlanExecutionOptions()
    assertEquals(30000L, options.timeoutMs)
    assertEquals("auto", options.device)
    assertTrue(options.aiAssistance)
    assertEquals(0, options.maxRetries)
  }

  @Test
  fun testSystemPropertyDefaults() {
    val debugMode = System.getProperty("automobile.debug", "false").toBoolean()
    val ciMode = System.getProperty("automobile.ci.mode", "false").toBoolean()

    assertFalse("Default should be false for debug", debugMode)
    assertFalse("Default should be false for CI mode", ciMode)
  }
}

/** Test target class for SimpleIntegrationTest */
class SimpleTestTargetClass {

  @Test
  fun testWithPlan() {
    // In real usage: AutoMobilePlan("test-plans/launch-clock-app.yaml").execute()
  }

  @Test
  fun testWithOptions() {
    // In real usage: AutoMobilePlan("test-plans/launch-clock-app.yaml").execute(
    //     AutoMobilePlanExecutionOptions(device = "emulator-5554")
    // )
  }
}
