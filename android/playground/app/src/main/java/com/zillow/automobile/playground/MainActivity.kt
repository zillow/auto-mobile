package com.zillow.automobile.playground

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.zillow.automobile.design.system.theme.AutoMobileTheme
import com.zillow.automobile.experimentation.ExperimentRepository
import com.zillow.automobile.playground.navigation.AppNavigation
import com.zillow.automobile.playground.navigation.DeepLinkManager
import com.zillow.automobile.storage.AnalyticsTracker

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Install the splash screen before super.onCreate()
    installSplashScreen()

    super.onCreate(savedInstanceState)

    // Initialize analytics tracking
    val analyticsTracker = AnalyticsTracker.getInstance()
    analyticsTracker.initialize(this)

    // Track screen view for MainActivity
    analyticsTracker.trackScreenView("MainActivity")

    // Initialize experiment repository
    val experimentRepository = ExperimentRepository(this)

    enableEdgeToEdge()
    setContent { AutoMobileTheme(experimentRepository = experimentRepository) { AppNavigation() } }

    // Handle deep links
    handleDeepLink(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleDeepLink(intent)
  }

  override fun onStop() {
    super.onStop()
    // End analytics session when app goes to background
    AnalyticsTracker.getInstance().getAnalyticsRepository()?.endSession()
  }

  private fun handleDeepLink(intent: Intent) {
    val data = intent.data
    if (data != null && DeepLinkManager.isValidDeepLink(data)) {
      // Deep link handling is managed by Navigation Compose
      // The NavHost will automatically navigate to the correct destination
      // based on the deep link patterns defined in AppNavigation
    }
  }
}
