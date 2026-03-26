package dev.jasonpearson.automobile.playground.automobile

import org.junit.Test

/**
 * Tests for performance analysis workflows documented in docs/using/perf-analysis/
 *
 * Requires a connected device and the AutoMobile daemon running.
 */
class PlaygroundPerfTests {

  @Test
  fun testColdBootStartup() {
    // Measures cold start performance to the Startup Demo screen
    // AutoMobilePlan("test-plans/playground/performance/startup-cold-boot.yaml")
    //     .execute(AutoMobilePlanExecutionOptions(timeoutMs = 90000L))
  }

  @Test
  fun testScrollPerformanceList() {
    // Tests scroll framerate on the Performance List screen
    // AutoMobilePlan("test-plans/playground/performance/scroll-performance-list.yaml").execute()
  }

  @Test
  fun testScreenTransitionPerformance() {
    // Measures screen transition performance from list to detail
    // AutoMobilePlan("test-plans/playground/performance/screen-transition.yaml").execute()
  }
}
