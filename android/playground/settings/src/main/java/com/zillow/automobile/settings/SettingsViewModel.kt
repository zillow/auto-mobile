package com.zillow.automobile.settings

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.zillow.automobile.experimentation.Experiment
import com.zillow.automobile.experimentation.ExperimentRepository
import com.zillow.automobile.experimentation.Treatment
import com.zillow.automobile.storage.AnalyticsRepository
import com.zillow.automobile.storage.OnboardingRepository
import com.zillow.automobile.storage.UserProfile
import com.zillow.automobile.storage.UserRepository
import com.zillow.automobile.storage.UserStats
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class SettingsViewModel(
    private val experimentRepository: ExperimentRepository,
    private val userRepository: UserRepository,
    private val analyticsRepository: AnalyticsRepository,
    private val onboardingRepository: OnboardingRepository
) : ViewModel() {

  private val _experiments = MutableStateFlow<List<Experiment<*>>>(emptyList())
  val experiments: StateFlow<List<Experiment<*>>> = _experiments.asStateFlow()

  val userStats: StateFlow<UserStats> = analyticsRepository.userStats

  private val _trackingEnabled = MutableStateFlow(false)
  val trackingEnabled: StateFlow<Boolean> = _trackingEnabled.asStateFlow()

  private val _email = MutableStateFlow("john.doe@example.com")
  val email: StateFlow<String> = _email.asStateFlow()

  private val _name = MutableStateFlow("John Doe")
  val name: StateFlow<String> = _name.asStateFlow()

  private val _isEditingEmail = MutableStateFlow(false)
  val isEditingEmail: StateFlow<Boolean> = _isEditingEmail.asStateFlow()

  private val _tempEmail = MutableStateFlow("")
  val tempEmail: StateFlow<String> = _tempEmail.asStateFlow()

  private val _shouldNavigateToLogin = MutableStateFlow(false)
  val shouldNavigateToLogin: StateFlow<Boolean> = _shouldNavigateToLogin.asStateFlow()

  init {
    setupGuestModeCallback()
    loadExperiments()
    loadUserData()
    loadAnalyticsData()
  }

  private fun setupGuestModeCallback() {
    userRepository.onGuestModeProfileModificationAttempt = { _shouldNavigateToLogin.value = true }
  }

  fun onNavigatedToLogin() {
    _shouldNavigateToLogin.value = false
  }

  private fun loadExperiments() {
    _experiments.value = experimentRepository.getExperiments()
  }

  private fun loadUserData() {
    val userProfile = userRepository.getUserProfile()
    if (userProfile == null) {
      // Create default user profile
      val defaultProfile = UserProfile("John Doe", "john.doe@example.com")
      userRepository.saveUserProfile(defaultProfile)
      _name.value = defaultProfile.name
      _email.value = defaultProfile.email
    } else {
      _name.value = userProfile.name
      _email.value = userProfile.email
    }
  }

  private fun loadAnalyticsData() {
    _trackingEnabled.value = analyticsRepository.isTrackingEnabled
  }

  fun <T : Treatment> updateExperimentTreatment(experiment: Experiment<T>, treatment: Treatment) {
    experimentRepository.updateExperimentTreatment(experiment, treatment)
    loadExperiments() // Refresh the state
  }

  fun updateTrackingEnabled(enabled: Boolean) {
    analyticsRepository.isTrackingEnabled = enabled
    _trackingEnabled.value = enabled
  }

  fun startEmailEditing(currentEmail: String) {
    _tempEmail.value = currentEmail
    _isEditingEmail.value = true
  }

  fun updateTempEmail(email: String) {
    _tempEmail.value = email
  }

  fun dismissEmailEdit() {
    _isEditingEmail.value = false
  }

  fun saveEmail(email: String) {
    userRepository.updateEmail(email)
    _email.value = email
    _isEditingEmail.value = false
  }

  fun updateName(name: String) {
    userRepository.updateName(name)
    _name.value = name
  }

  fun resetStats() {
    analyticsRepository.resetStats()
  }

  fun resetOnboarding() {
    onboardingRepository.resetOnboarding()
  }
}

class SettingsViewModelFactory(private val context: Context) : ViewModelProvider.Factory {
  override fun <T : ViewModel> create(modelClass: Class<T>): T {
    if (modelClass.isAssignableFrom(SettingsViewModel::class.java)) {
      @Suppress("UNCHECKED_CAST")
      return SettingsViewModel(
          ExperimentRepository(context),
          UserRepository(context),
          AnalyticsRepository(context),
          OnboardingRepository(context))
          as T
    }
    throw IllegalArgumentException("Unknown ViewModel class")
  }
}
