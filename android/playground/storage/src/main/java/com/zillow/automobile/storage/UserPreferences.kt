package com.zillow.automobile.storage

import android.content.Context

class UserPreferences(context: Context) {
  private val authRepository = AuthRepository(context)
  private val onboardingRepository = OnboardingRepository(context)

  var hasCompletedOnboarding: Boolean
    get() = onboardingRepository.hasCompletedOnboarding
    set(value) {
      if (value) {
        onboardingRepository.completeOnboarding()
      } else {
        onboardingRepository.resetOnboarding()
      }
    }

  var isAuthenticated: Boolean
    get() = authRepository.isAuthenticated || authRepository.isGuestMode
    set(value) {
      authRepository.isAuthenticated = value
    }

  var isGuestMode: Boolean
    get() = authRepository.isGuestMode
    set(value) {
      authRepository.isGuestMode = value
    }

  fun reset() {
    authRepository.clearAuthData()
    onboardingRepository.clearOnboardingData()
  }
}
