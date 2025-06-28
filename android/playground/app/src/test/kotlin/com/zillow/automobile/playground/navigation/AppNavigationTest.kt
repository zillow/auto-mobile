package com.zillow.automobile.playground.navigation

import org.junit.Assert.assertEquals
import org.junit.Test

class AppNavigationTest {

  @Test
  fun `determineStartDestination returns onboarding when user has not completed onboarding`() {
    val result = determineStartDestination(hasCompletedOnboarding = false, isAuthenticated = false)

    assertEquals(OnboardingDestination, result)
  }

  @Test
  fun `determineStartDestination returns onboarding when user is authenticated but has not completed onboarding`() {
    val result = determineStartDestination(hasCompletedOnboarding = false, isAuthenticated = true)

    assertEquals(OnboardingDestination, result)
  }

  @Test
  fun `determineStartDestination returns login when user has completed onboarding but is not authenticated`() {
    val result = determineStartDestination(hasCompletedOnboarding = true, isAuthenticated = false)

    assertEquals(LoginDestination, result)
  }

  @Test
  fun `determineStartDestination returns home when user has completed onboarding and is authenticated`() {
    val result = determineStartDestination(hasCompletedOnboarding = true, isAuthenticated = true)

    assertEquals(HomeDestination, result)
  }
}
