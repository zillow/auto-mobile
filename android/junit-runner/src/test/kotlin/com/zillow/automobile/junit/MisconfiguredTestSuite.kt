package com.zillow.automobile.junit

import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AutoMobileRunner::class)
class MisconfiguredTestSuite {

  @Test(expected = AssertionError::class)
  fun `test error handling for missing plan`() {
    AutoMobilePlan("test-plans/nonexistent-plan.yaml") { "test" to "value" }.execute()
  }
}
