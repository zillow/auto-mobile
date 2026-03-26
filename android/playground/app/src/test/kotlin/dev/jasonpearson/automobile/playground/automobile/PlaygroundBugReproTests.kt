package dev.jasonpearson.automobile.playground.automobile

import org.junit.Test

/**
 * Tests for bug reproduction workflows documented in docs/using/reproducing-bugs.md
 *
 * Requires a connected device and the AutoMobile daemon running.
 */
class PlaygroundBugReproTests {

  @Test
  fun testReproduceCounterBug() {
    // Reproduces the intentional counter bug in the Bug Repro Demo
    // AutoMobilePlan("test-plans/playground/bug-repro/reproduce-counter-bug.yaml").execute()
  }

  @Test
  fun testVerifyCorrectBehaviorWithoutBug() {
    // Regression test verifying correct counter behavior when bug is disabled
    // AutoMobilePlan("test-plans/playground/bug-repro/verify-fix-with-bug-disabled.yaml").execute()
  }
}
