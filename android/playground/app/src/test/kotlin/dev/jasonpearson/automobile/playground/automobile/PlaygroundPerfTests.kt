package dev.jasonpearson.automobile.playground.automobile

import dev.jasonpearson.automobile.junit.AutoMobileTest
import org.junit.Test

/**
 * Tests for performance analysis workflows documented in docs/using/perf-analysis/
 *
 * These tests verify:
 * - docs/using/perf-analysis/startup.md (cold boot startup performance)
 * - docs/using/perf-analysis/scroll-framerate.md (scroll performance metrics)
 * - docs/using/perf-analysis/screen-transition.md (navigation transition performance)
 */
class PlaygroundPerfTests {

  @Test
  @AutoMobileTest(
      plan = "test-plans/playground/performance/startup-cold-boot.yaml",
      appId = "dev.jasonpearson.automobile.playground",
      cleanupAfter = true,
      timeoutMs = 90000L, // Allow extra time for cold boot
  )
  fun testColdBootStartup() {
    // Measures cold start performance to the Startup Demo screen
    // Verifies time-to-interactive and UI stability metrics
  }

  @Test
  @AutoMobileTest(
      plan = "test-plans/playground/performance/scroll-performance-list.yaml",
      appId = "dev.jasonpearson.automobile.playground",
      cleanupAfter = true,
  )
  fun testScrollPerformanceList() {
    // Tests scroll framerate on the Performance List screen
    // Captures FPS, frame drops, and jank metrics during scrolling
  }

  @Test
  @AutoMobileTest(
      plan = "test-plans/playground/performance/screen-transition.yaml",
      appId = "dev.jasonpearson.automobile.playground",
      cleanupAfter = true,
  )
  fun testScreenTransitionPerformance() {
    // Measures screen transition performance from list to detail
    // Tracks navigation duration, animation smoothness, and touch responsiveness
  }
}
