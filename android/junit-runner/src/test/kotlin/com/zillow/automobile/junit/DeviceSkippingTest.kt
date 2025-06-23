package com.zillow.automobile.junit

import org.junit.Test
import org.junit.runner.RunWith

/**
 * Simple test class to validate that tests are properly skipped when no devices are available.
 *
 * With the fix in AutoMobileRunner, these tests should be marked as IGNORED/SKIPPED instead of
 * FAILED when no Android devices are connected via adb.
 */
@RunWith(AutoMobileRunner::class)
class DeviceSkippingTest {

  @Test
  @AutoMobileTest(plan = "test-plans/simple-test.yaml")
  fun `test should be skipped when no devices available`() {
    // This test should be SKIPPED (not FAILED) when no Android devices are connected
    // The fix in AutoMobileRunner catches AssumptionViolatedException
    // and calls notifier.fireTestIgnored() instead of fireTestFailure()
  }

  @Test
  @AutoMobileTest(plan = "test-plans/another-test.yaml")
  fun `another test should also be skipped`() {
    // Another test that should be skipped when no devices are available
  }
}
