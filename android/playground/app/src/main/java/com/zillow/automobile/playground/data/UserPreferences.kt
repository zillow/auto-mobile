package com.zillow.automobile.playground.data

import android.content.Context
import com.zillow.automobile.storage.AuthRepository
import com.zillow.automobile.storage.OnboardingRepository

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
