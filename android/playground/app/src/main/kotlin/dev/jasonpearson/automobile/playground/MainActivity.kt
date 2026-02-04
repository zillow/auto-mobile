package dev.jasonpearson.automobile.playground

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import dev.jasonpearson.automobile.design.system.theme.AutoMobileTheme
import dev.jasonpearson.automobile.experimentation.ExperimentRepository
import dev.jasonpearson.automobile.playground.navigation.AppNavigation
import dev.jasonpearson.automobile.playground.navigation.DeepLinkManager
import dev.jasonpearson.automobile.sdk.AutoMobileSDK
import dev.jasonpearson.automobile.sdk.EnableComposeObservableApi
import dev.jasonpearson.automobile.sdk.storage.SharedPreferencesInspector
import dev.jasonpearson.automobile.storage.AnalyticsTracker

class MainActivity : ComponentActivity() {
  private var pendingDeepLink: Uri? = null
  private lateinit var experimentRepository: ExperimentRepository
  private var deepLinkCallback: ((Uri) -> Unit)? = null

  companion object {
    private const val TAG = "MainActivity"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    Log.d(TAG, "onCreate() called")
    // Install the splash screen before super.onCreate()
    installSplashScreen()

    super.onCreate(savedInstanceState)

    // Initialize AutoMobile SDK for navigation tracking
    AutoMobileSDK.initialize(applicationContext)
    // Enable SharedPreferences inspection in debug builds
    SharedPreferencesInspector.setEnabled(true)
    Log.d(TAG, "AutoMobileSDK initialized")

    // Initialize analytics tracking
    val analyticsTracker = AnalyticsTracker.getInstance()
    analyticsTracker.initialize(this)

    // Track screen view for MainActivity
    analyticsTracker.trackScreenView("MainActivity")

    // Initialize experiment repository
    experimentRepository = ExperimentRepository(this)

    // Handle deep links before setting content
    handleDeepLink(intent, isNewIntent = false)

    enableEdgeToEdge()
    setComposeContent()
  }

  override fun onNewIntent(intent: Intent) {
    Log.d(TAG, "onNewIntent() called with intent: $intent")
    super.onNewIntent(intent)
    setIntent(intent)

    // Handle deep link for already running app
    handleDeepLink(intent, isNewIntent = true)
  }

  override fun onStop() {
    super.onStop()
    // End analytics session when app goes to background
    AnalyticsTracker.getInstance().getAnalyticsRepository()?.endSession()
  }

  private fun setComposeContent() {
    Log.d(TAG, "setComposeContent() called with pendingDeepLink: $pendingDeepLink")
    setContent {
      EnableComposeObservableApi()
      AutoMobileTheme(experimentRepository = experimentRepository) {
        AppNavigation(
            deepLinkUri = pendingDeepLink,
            onDeepLinkCallbackSet = { callback ->
              Log.d(TAG, "Deep link callback set")
              deepLinkCallback = callback
            },
        )
      }
    }
  }

  private fun handleDeepLink(intent: Intent, isNewIntent: Boolean) {
    val data = intent.data
    Log.d(TAG, "handleDeepLink() called - isNewIntent: $isNewIntent, data: $data")

    if (data != null && DeepLinkManager.isValidDeepLink(data)) {
      Log.d(TAG, "Valid deep link found: $data")
      val destinationName = DeepLinkManager.getDestinationName(data)
      Log.d(TAG, "Deep link destination: $destinationName")

      if (isNewIntent && deepLinkCallback != null) {
        Log.d(TAG, "Navigating to deep link via callback")
        deepLinkCallback?.invoke(data)
        // Clear the pending deep link since we're handling it immediately
        pendingDeepLink = null
      } else {
        Log.d(TAG, "Setting pending deep link for initial navigation")
        pendingDeepLink = data
      }

      // Analytics tracking for deep link usage
      AnalyticsTracker.getInstance()
          .trackEvent(
              "deep_link_opened",
              mapOf(
                  "uri" to data.toString(),
                  "destination" to (destinationName ?: "unknown"),
                  "isNewIntent" to isNewIntent.toString(),
              ),
          )
    } else {
      Log.d(TAG, "No valid deep link found, clearing pending deep link")
      // Clear any previous deep link if this isn't a deep link intent
      pendingDeepLink = null
    }
  }
}
