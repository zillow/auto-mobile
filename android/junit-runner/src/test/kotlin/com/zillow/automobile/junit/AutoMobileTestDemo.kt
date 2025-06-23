package com.zillow.automobile.junit

import org.junit.Assert.*
import org.junit.Test

/**
 * Demo tests showcasing the AutoMobile JUnitRunner functionality.
 *
 * These tests demonstrate how to use the @AutoMobileTest annotation and verify the runner setup
 * works correctly.
 */
class AutoMobileTestDemo {

  /** Test that demonstrates basic AutoMobile test setup. */
  @Test
  fun testBasicAutoMobileTestSetup() {
    val runner = AutoMobileRunner(AutoMobileExampleClass::class.java)
    assertNotNull(runner)

    val method = AutoMobileExampleClass::class.java.getMethod("testLaunchClock")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)

    assertNotNull(annotation)
    assertEquals("test-plans/launch-clock.yaml", annotation.plan)
    assertTrue(annotation.aiAssistance)
    assertEquals(300000L, annotation.timeoutMs)
  }

  /** Test that demonstrates advanced configuration setup. */
  @Test
  fun testAdvancedAutoMobileConfigurationSetup() {
    val runner = AutoMobileRunner(AutoMobileExampleClass::class.java)

    val method = AutoMobileExampleClass::class.java.getMethod("testLaunchClockWithAdvancedConfig")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)

    assertNotNull(annotation)
    assertEquals("test-plans/launch-clock.yaml", annotation.plan)
    assertEquals(2, annotation.maxRetries)
    assertTrue(annotation.aiAssistance)
    assertEquals(60000L, annotation.timeoutMs)
    assertEquals("auto", annotation.device)
  }

  /** Test that demonstrates AI assistance disabled configuration. */
  @Test
  fun testAIAssistanceDisabledConfiguration() {
    val runner = AutoMobileRunner(AutoMobileExampleClass::class.java)

    val method = AutoMobileExampleClass::class.java.getMethod("testLaunchClockNoAI")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)

    assertNotNull(annotation)
    assertEquals("test-plans/launch-clock.yaml", annotation.plan)
    assertFalse(annotation.aiAssistance)
    assertEquals(30000L, annotation.timeoutMs)
  }

  /** Test that demonstrates specific device configuration. */
  @Test
  fun testSpecificDeviceConfiguration() {
    val runner = AutoMobileRunner(AutoMobileExampleClass::class.java)

    val method = AutoMobileExampleClass::class.java.getMethod("testLaunchClockSpecificDevice")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)

    assertNotNull(annotation)
    assertEquals("test-plans/launch-clock.yaml", annotation.plan)
    assertEquals("emulator-5554", annotation.device)
    assertEquals(45000L, annotation.timeoutMs)
  }

  /** Test basic runner functionality and annotation parsing. */
  @Test
  fun testRunnerInstantiationAndBasicProperties() {
    val runner = AutoMobileRunner(AutoMobileExampleClass::class.java)

    // Just verify we can create the runner successfully
    assertNotNull(runner)

    // Test that we can access annotation properties
    val method = AutoMobileExampleClass::class.java.getMethod("testLaunchClock")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)

    assertNotNull(annotation)
    assertEquals("test-plans/launch-clock.yaml", annotation.plan)
    assertEquals("", annotation.prompt)
    assertEquals(0, annotation.maxRetries)
    assertTrue(annotation.aiAssistance)
    assertEquals(300000L, annotation.timeoutMs)
    assertEquals("auto", annotation.device)
  }
}

/**
 * Example class showing how AutoMobile tests would be structured. This demonstrates the intended
 * usage patterns.
 */
class AutoMobileExampleClass {

  @AutoMobileTest(plan = "test-plans/launch-clock.yaml")
  fun testLaunchClock() {
    // Test method body can be empty - the runner handles execution
  }

  @AutoMobileTest(
      plan = "test-plans/launch-clock.yaml",
      maxRetries = 2,
      aiAssistance = true,
      timeoutMs = 60000L,
      device = "auto")
  fun testLaunchClockWithAdvancedConfig() {
    // Advanced configuration example
  }

  @AutoMobileTest(plan = "test-plans/launch-clock.yaml", aiAssistance = false, timeoutMs = 30000L)
  fun testLaunchClockNoAI() {
    // AI assistance disabled example
  }

  @org.junit.Test
  fun testRegularJUnit() {
    assertTrue("Regular JUnit test", true)
  }

  @AutoMobileTest(
      plan = "test-plans/launch-clock.yaml", device = "emulator-5554", timeoutMs = 45000L)
  fun testLaunchClockSpecificDevice() {}
}
