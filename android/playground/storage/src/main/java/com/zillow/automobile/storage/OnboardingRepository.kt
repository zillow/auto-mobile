package com.zillow.automobile.storage

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit

data class OnboardingRecord(
    val hasCompletedOnboarding: Boolean,
    val completedSteps: List<String>,
    val lastStepCompleted: String?
)

class OnboardingRepository(context: Context) {
  private val sharedPreferences: SharedPreferences =
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  var hasCompletedOnboarding: Boolean
    get() = sharedPreferences.getBoolean(KEY_ONBOARDING_COMPLETED, false)
    set(value) = sharedPreferences.edit { putBoolean(KEY_ONBOARDING_COMPLETED, value) }

  fun getOnboardingRecord(): OnboardingRecord {
    val completedSteps =
        sharedPreferences.getStringSet(KEY_COMPLETED_STEPS, emptySet())?.toList() ?: emptyList()
    val lastStep = sharedPreferences.getString(KEY_LAST_STEP, null)

    return OnboardingRecord(
        hasCompletedOnboarding = hasCompletedOnboarding,
        completedSteps = completedSteps,
        lastStepCompleted = lastStep)
  }

  fun markStepCompleted(stepName: String) {
    val completedSteps =
        sharedPreferences.getStringSet(KEY_COMPLETED_STEPS, emptySet())?.toMutableSet()
            ?: mutableSetOf()
    completedSteps.add(stepName)

    sharedPreferences.edit {
      putStringSet(KEY_COMPLETED_STEPS, completedSteps)
      putString(KEY_LAST_STEP, stepName)
    }
  }

  fun completeOnboarding() {
    sharedPreferences.edit {
      putBoolean(KEY_ONBOARDING_COMPLETED, true)
      putLong(KEY_COMPLETION_TIMESTAMP, System.currentTimeMillis())
    }
  }

  fun resetOnboarding() {
    sharedPreferences.edit {
      putBoolean(KEY_ONBOARDING_COMPLETED, false)
      remove(KEY_COMPLETED_STEPS)
      remove(KEY_LAST_STEP)
      remove(KEY_COMPLETION_TIMESTAMP)
    }
  }

  fun getCompletionTimestamp(): Long? {
    val timestamp = sharedPreferences.getLong(KEY_COMPLETION_TIMESTAMP, -1L)
    return if (timestamp == -1L) null else timestamp
  }

  fun clearOnboardingData() {
    sharedPreferences.edit { clear() }
  }

  companion object {
    private const val PREFS_NAME = "onboarding_prefs"
    private const val KEY_ONBOARDING_COMPLETED = "onboarding_completed"
    private const val KEY_COMPLETED_STEPS = "completed_steps"
    private const val KEY_LAST_STEP = "last_step"
    private const val KEY_COMPLETION_TIMESTAMP = "completion_timestamp"
  }
}
