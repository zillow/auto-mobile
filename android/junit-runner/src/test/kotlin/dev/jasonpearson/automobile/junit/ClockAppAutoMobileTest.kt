package dev.jasonpearson.automobile.junit

import org.junit.Test
import org.junit.runner.RunWith

/**
 * Example test class showing usage of AutoMobile JUnitRunner with the AutoMobilePlan DSL to test
 * device availability skipping.
 */
@RunWith(AutoMobileRunner::class)
class ClockAppAutoMobileTest {

  @Test
  fun `launch clock app using DSL`() {
    // Uses AutoMobilePlan DSL — will be skipped if no devices are available
    // AutoMobilePlan("test-plans/launch-clock-app.yaml").execute(
    //     AutoMobilePlanExecutionOptions(aiAssistance = false, maxRetries = 2, timeoutMs = 180000L)
    // )
  }

  @Test
  fun `set alarm in clock app using DSL`() {
    // AutoMobilePlan("test-plans/set-alarm-in-clock-app.yaml").execute(
    //     AutoMobilePlanExecutionOptions(aiAssistance = false, maxRetries = 2, timeoutMs = 180000L)
    // )
  }
}
