package com.zillow.automobile.junit

import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Example test suite demonstrating programmatic AutoMobile plan execution with parameters,
 * experiments, and environment-specific values.
 */
@RunWith(AutoMobileRunner::class)
class OnboardingTestSuite {

  object Experiments {
    enum class OnboardingTest {
      CONTROL,
      GROUP_A,
      GROUP_B
    }

    enum class Environment {
      DEV,
      QA,
      STAGING,
      PROD
    }
  }

  @Test
  fun `given group a experiment, complete onboarding successfully`() {

    val result =
        AutoMobilePlan("test-plans/complete-onboarding.yaml") {
              "experiment" to Experiments.OnboardingTest.GROUP_A
              "environment" to Experiments.Environment.QA
              "user_email" to "test+groupa@example.com"
              "skip_intro" to false
            }
            .execute()

    assertTrue("Onboarding should complete successfully for Group A", result.success)
  }

  @Test
  fun `given control experiment, complete onboarding successfully`() {
    val result =
        AutoMobilePlan("test-plans/complete-onboarding.yaml") {
              "experiment" to Experiments.OnboardingTest.CONTROL
              "environment" to Experiments.Environment.QA
              "user_email" to "test+control@example.com"
              "skip_intro" to true
            }
            .execute()

    assertTrue("Onboarding should complete successfully for Control", result.success)
  }

  @Test
  fun `execute onboarding with custom timeout and device settings`() {
    val options =
        AutoMobilePlanExecutionOptions(
            timeoutMs = 120000L, // 2 minutes
            device = "emulator-5554",
            aiAssistance = false,
            debugMode = true)

    val result =
        AutoMobilePlan("test-plans/complete-onboarding.yaml") {
              "experiment" to Experiments.OnboardingTest.GROUP_B
              "environment" to Experiments.Environment.DEV
              "debug_mode" to true
            }
            .execute(options)

    assertTrue("Should execute with custom options", result.success)
  }

  @Test
  fun `test onboarding with data store values`() {
    // Simulate getting values from a data store or configuration
    val testData = getTestDataForEnvironment(Experiments.Environment.QA)

    val result =
        AutoMobilePlan("test-plans/complete-onboarding.yaml") {
              "experiment" to testData.experiment
              "environment" to testData.environment
              "api_endpoint" to testData.apiEndpoint
              "feature_flags" to testData.featureFlags.joinToString(",")
            }
            .execute()

    assertTrue("Should execute with data store values", result.success)
    assertTrue(
        "Should include QA-specific configuration",
        result.parametersUsed["api_endpoint"].toString().contains("qa"))
  }

  @Test(expected = AssertionError::class)
  fun `test error handling for missing plan`() {
    try {
      AutoMobilePlan("test-plans/nonexistent-plan.yaml") { "test" to "value" }.execute()

      fail("Should throw exception for missing plan")
    } catch (e: Exception) {
      assertTrue("Should contain helpful error message", e.message?.contains("not found") == true)
    }
  }

  @Test
  fun `test parameter substitution with complex values`() {
    val complexData =
        mapOf(
            "user_preferences" to listOf("notifications", "dark_mode"),
            "test_config" to mapOf("retries" to 3, "timeout" to 30))

    val result =
        AutoMobilePlan("test-plans/complete-onboarding.yaml") {
              "experiment" to Experiments.OnboardingTest.GROUP_A
              "preferences_json" to complexData.toString()
              "max_retries" to 3
            }
            .execute()

    assertTrue("Should handle complex parameter values", result.success)
  }

  // Helper method to simulate data store integration
  private fun getTestDataForEnvironment(env: Experiments.Environment): TestData {
    return when (env) {
      Experiments.Environment.DEV ->
          TestData(
              experiment = Experiments.OnboardingTest.CONTROL,
              environment = env,
              apiEndpoint = "https://api-dev.example.com",
              featureFlags = listOf("dev_features", "debug_mode"))

      Experiments.Environment.QA ->
          TestData(
              experiment = Experiments.OnboardingTest.GROUP_A,
              environment = env,
              apiEndpoint = "https://api-qa.example.com",
              featureFlags = listOf("qa_features", "test_mode"))

      Experiments.Environment.STAGING ->
          TestData(
              experiment = Experiments.OnboardingTest.GROUP_B,
              environment = env,
              apiEndpoint = "https://api-staging.example.com",
              featureFlags = listOf("staging_features"))

      Experiments.Environment.PROD ->
          TestData(
              experiment = Experiments.OnboardingTest.CONTROL,
              environment = env,
              apiEndpoint = "https://api.example.com",
              featureFlags = emptyList())
    }
  }

  private data class TestData(
      val experiment: Experiments.OnboardingTest,
      val environment: Experiments.Environment,
      val apiEndpoint: String,
      val featureFlags: List<String>
  )
}
