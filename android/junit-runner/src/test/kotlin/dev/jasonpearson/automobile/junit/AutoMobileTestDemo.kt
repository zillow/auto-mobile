package dev.jasonpearson.automobile.junit

import org.junit.Assert.*
import org.junit.Test

/**
 * Demo tests showcasing the AutoMobilePlan DSL for executing YAML test plans.
 *
 * These tests demonstrate how to use the programmatic API with parameter substitution.
 */
class AutoMobileTestDemo {

  @Test
  fun testAutoMobilePlanDSLConstruction() {
    val plan =
        AutoMobilePlan("test-plans/launch-clock.yaml") {
          "experiment" to "GROUP_A"
          "environment" to "QA"
        }
    assertNotNull(plan)
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
  fun testAutoMobilePlanExecutionOptionsCustom() {
    val options =
        AutoMobilePlanExecutionOptions(
            timeoutMs = 60000L,
            device = "emulator-5554",
            aiAssistance = false,
            maxRetries = 2,
        )
    assertEquals(60000L, options.timeoutMs)
    assertEquals("emulator-5554", options.device)
    assertFalse(options.aiAssistance)
    assertEquals(2, options.maxRetries)
  }
}
