package dev.jasonpearson.automobile.playground.automobile

import dev.jasonpearson.automobile.junit.AutoMobileTest
import org.junit.Test

/**
 * Tests for UX exploration workflows documented in docs/using/ux-exploration.md
 *
 * These tests verify the navigation graph exploration capabilities and multi-screen
 * user flows in the Playground demo app.
 */
class PlaygroundUxExplorationTests {

  @Test
  @AutoMobileTest(
      plan = "test-plans/playground/ux-exploration/navigate-demo-index.yaml",
      appId = "dev.jasonpearson.automobile.playground",
      cleanupAfter = true,
  )
  fun testNavigateToDemoIndex() {
    // Verifies navigation from home screen to Demo Index
    // This is the entry point for all docs/using workflow demos
  }

  @Test
  @AutoMobileTest(
      plan = "test-plans/playground/ux-exploration/complete-ux-flow.yaml",
      appId = "dev.jasonpearson.automobile.playground",
      cleanupAfter = true,
  )
  fun testCompleteUxFlow() {
    // Tests the full UX exploration flow: Start -> Details -> Summary
    // Demonstrates multi-screen navigation graph discovery
  }

  @Test
  @AutoMobileTest(
      plan = "test-plans/playground/ux-exploration/navigate-back-through-flow.yaml",
      appId = "dev.jasonpearson.automobile.playground",
      cleanupAfter = true,
  )
  fun testNavigateBackThroughFlow() {
    // Tests reverse navigation through the UX flow
    // Verifies bidirectional navigation graph traversal
  }
}
