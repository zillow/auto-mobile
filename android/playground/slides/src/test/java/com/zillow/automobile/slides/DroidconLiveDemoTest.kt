package com.zillow.automobile.slides

import com.zillow.automobile.junit.AutoMobileRunner
import com.zillow.automobile.junit.AutoMobileTest
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AutoMobileRunner::class)
class DroidconLiveDemoTest {

  @Test
  @AutoMobileTest(plan = "test-plans/clock-set-alarm.yaml")
  fun `set alarm in clock app using annotation`() {
    // Traditional annotation-based approach
    // AI assistance disabled for this test
  }

  @Test
  @AutoMobileTest(plan = "test-plans/zillow-testing.yaml")
  fun `Zillow testing`() {
    // Traditional annotation-based approach
    // AI assistance disabled for this test
  }

  @Test
  @AutoMobileTest(plan = "test-plans/zillow-buyability.yaml")
  fun `Zillow buyability form`() {
    // Traditional annotation-based approach
    // AI assistance disabled for this test
  }

  @Test
  @AutoMobileTest(plan = "test-plans/zillow-3d-home-exploration.yaml")
  fun `Zillow tour 3d home`() {
    // Traditional annotation-based approach
    // AI assistance disabled for this test
  }
}
