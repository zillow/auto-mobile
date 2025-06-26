package com.zillow.automobile.playground

import android.content.Intent
import android.net.Uri
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
  private var pendingDeepLink: Uri? = null
  private lateinit var experimentRepository: ExperimentRepository

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
    experimentRepository = ExperimentRepository(this)

    // Handle deep links before setting content
    handleDeepLink(intent)

    enableEdgeToEdge()
    setComposeContent()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)

    // Handle deep link for already running app
    handleDeepLink(intent)

    // Recreate the Compose content with the new deep link
    setComposeContent()
  }

  override fun onStop() {
    super.onStop()
    // End analytics session when app goes to background
    AnalyticsTracker.getInstance().getAnalyticsRepository()?.endSession()
  }

  private fun setComposeContent() {
    setContent {
      AutoMobileTheme(experimentRepository = experimentRepository) {
        AppNavigation(deepLinkUri = pendingDeepLink)
      }
    }
  }

  private fun handleDeepLink(intent: Intent) {
    val data = intent.data
    if (data != null && DeepLinkManager.isValidDeepLink(data)) {
      pendingDeepLink = data
      // Analytics tracking for deep link usage
      AnalyticsTracker.getInstance()
          .trackEvent(
              "deep_link_opened",
              mapOf(
                  "uri" to data.toString(),
                  "destination" to (DeepLinkManager.getDestinationName(data) ?: "unknown")))
    } else {
      // Clear any previous deep link if this isn't a deep link intent
      pendingDeepLink = null
    }
  }
}
