package com.zillow.automobile.junit

import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Example test class showing usage of AutoMobile JUnitRunner with annotation-based approach to test
 * device availability skipping
 */
@RunWith(AutoMobileRunner::class)
class ClockAppAutoMobileTest {

  @Test
  @AutoMobileTest(plan = "test-plans/launch-clock-app.yaml")
  fun `launch clock app using annotation`() {
    // Traditional annotation-based approach
    // AI assistance disabled for this test
  }

  @Test
  @AutoMobileTest(plan = "test-plans/set-alarm-in-clock-app.yaml")
  fun `set alarm in clock app using annotation`() {
    // Traditional annotation-based approach
    // AI assistance disabled for this test
  }
}
