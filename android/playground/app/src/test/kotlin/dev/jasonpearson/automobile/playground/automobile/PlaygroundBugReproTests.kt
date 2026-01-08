package dev.jasonpearson.automobile.playground.automobile

import dev.jasonpearson.automobile.junit.AutoMobileTest
import org.junit.Test

/**
 * Tests for bug reproduction workflows documented in docs/using/reproducting-bugs.md
 *
 * These tests verify:
 * - Systematic bug reproduction with exact steps
 * - Creating automated regression tests from bug reports
 * - Verifying bug fixes and correct behavior
 */
class PlaygroundBugReproTests {

  @Test
  @AutoMobileTest(
      plan = "test-plans/playground/bug-repro/reproduce-counter-bug.yaml",
      appId = "dev.jasonpearson.automobile.playground",
      cleanupAfter = true,
  )
  fun testReproduceCounterBug() {
    // Reproduces the intentional counter bug in the Bug Repro Demo
    // Verifies that enabling the bug toggle causes the displayed count to stop updating
    // while the expected count continues to increment
  }

  @Test
  @AutoMobileTest(
      plan = "test-plans/playground/bug-repro/verify-fix-with-bug-disabled.yaml",
      appId = "dev.jasonpearson.automobile.playground",
      cleanupAfter = true,
  )
  fun testVerifyCorrectBehaviorWithoutBug() {
    // Regression test verifying correct counter behavior when bug is disabled
    // Both expected and displayed counts should increment in sync
  }
}
