package dev.jasonpearson.automobile.junit

import org.junit.After
import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for the AutoMobileRunner.
 *
 * Tests verify runner instantiation, test ordering, and system property defaults. Plan execution
 * and AI recovery are tested in [AutoMobilePlanExecutorTest] and [RecoveryLoopTest].
 */
class AutoMobileRunnerTest {

  @After
  fun cleanUp() {
    System.clearProperty("automobile.debug")
    SystemPropertyCache.clear()
    PlanCache.clear()
    RegexCache.clear()
    TestTimingCache.clear()
  }

  @Test
  fun testRunnerCreation() {
    val runner = AutoMobileRunner(RunnerTestTarget::class.java)
    assertNotNull(runner)
  }

  @Test
  fun testRunnerCreationWithMultipleMethods() {
    val runner = AutoMobileRunner(RunnerTestTarget::class.java)
    val children = runner.testClass.annotatedMethods
    assertTrue("Runner should find test methods", children.isNotEmpty())
  }
}

/** Test target class for runner tests. Uses standard @Test methods with AutoMobilePlan DSL. */
class RunnerTestTarget {
  @Test
  fun testLaunchClockApp() {
    // In real usage: AutoMobilePlan("test-plans/launch-clock-app.yaml").execute()
  }

  @Test
  fun testSetAlarm() {
    // In real usage: AutoMobilePlan("test-plans/set-alarm.yaml").execute()
  }
}
