package com.zillow.automobile.junit

import org.junit.Assert.*
import org.junit.Test

/** Simple integration test to verify the AutoMobile JUnitRunner classes work correctly. */
class SimpleIntegrationTest {

  @Test
  fun testAutoMobileRunnerCanBeInstantiated() {
    val runner = AutoMobileRunner(SimpleTestTargetClass::class.java)
    assertNotNull(runner)
  }

  @Test
  fun testAutoMobileTestAnnotationHasCorrectDefaultValues() {
    val method = SimpleTestTargetClass::class.java.getMethod("testWithAutoMobileAnnotation")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)

    assertNotNull(annotation)
    assertEquals("test-plans/launch-clock.yaml", annotation.plan)
    assertEquals("", annotation.prompt)
    assertEquals(0, annotation.maxRetries)
    assertTrue(annotation.aiAssistance)
    assertEquals(300000L, annotation.timeoutMs)
    assertEquals("auto", annotation.device)
  }

  @Test
  fun testPlanParameterTakesPrecedenceOverValue() {
    val method = SimpleTestTargetClass::class.java.getMethod("testWithPlanParameter")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)

    assertNotNull(annotation)
    assertEquals("test-plans/launch-clock.yaml", annotation.plan)
    assertFalse(annotation.aiAssistance)
  }

  @Test
  fun testAnnotationConfigurationOptions() {
    val method = SimpleTestTargetClass::class.java.getMethod("testWithSpecificDevice")
    val annotation = method.getAnnotation(AutoMobileTest::class.java)

    assertNotNull(annotation)
    assertEquals("test-plans/launch-clock.yaml", annotation.plan)
    assertEquals("emulator-5554", annotation.device)
  }

  @Test
  fun testSystemPropertyDefaults() {
    // Test that system properties have sensible defaults
    val useNpx = System.getProperty("automobile.use.npx", "true").toBoolean()
    val debugMode = System.getProperty("automobile.debug", "false").toBoolean()
    val ciMode = System.getProperty("automobile.ci.mode", "false").toBoolean()

    assertTrue("Default should be true for npx usage", useNpx)
    assertFalse("Default should be false for debug", debugMode)
    assertFalse("Default should be false for CI mode", ciMode)
  }
}

/** Test target class for SimpleIntegrationTest */
class SimpleTestTargetClass {

  @Test @AutoMobileTest(plan = "test-plans/launch-clock.yaml") fun testWithAutoMobileAnnotation() {}

  @Test
  @AutoMobileTest(plan = "test-plans/launch-clock.yaml", aiAssistance = false)
  fun testWithPlanParameter() {}

  @Test
  @AutoMobileTest(plan = "test-plans/launch-clock.yaml", device = "emulator-5554")
  fun testWithSpecificDevice() {}
}
