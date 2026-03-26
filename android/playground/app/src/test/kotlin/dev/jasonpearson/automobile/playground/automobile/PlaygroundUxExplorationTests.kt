package dev.jasonpearson.automobile.playground.automobile

import org.junit.Test

/**
 * Tests for UX exploration workflows documented in docs/using/ux-exploration.md
 *
 * Requires a connected device and the AutoMobile daemon running.
 */
class PlaygroundUxExplorationTests {

  @Test
  fun testNavigateToDemoIndex() {
    // Verifies navigation from home screen to Demo Index
    // AutoMobilePlan("test-plans/playground/ux-exploration/navigate-demo-index.yaml").execute()
  }

  @Test
  fun testCompleteUxFlow() {
    // Tests the full UX exploration flow: Start -> Details -> Summary
    // AutoMobilePlan("test-plans/playground/ux-exploration/complete-ux-flow.yaml").execute()
  }

  @Test
  fun testNavigateBackThroughFlow() {
    // Tests reverse navigation through the UX flow
    // AutoMobilePlan("test-plans/playground/ux-exploration/navigate-back-through-flow.yaml").execute()
  }
}
