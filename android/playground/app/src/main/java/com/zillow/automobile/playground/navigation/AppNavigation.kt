package com.zillow.automobile.playground.navigation

import android.net.Uri
import android.util.Log
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entry
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.runtime.rememberSavedStateNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import androidx.navigation3.ui.rememberSceneSetupNavEntryDecorator
import com.zillow.automobile.home.HomeScreen
import com.zillow.automobile.login.ui.LoginScreen
import com.zillow.automobile.mediaplayer.VideoPlayerScreen
import com.zillow.automobile.onboarding.OnboardingScreen
import com.zillow.automobile.settings.SettingsScreen
import com.zillow.automobile.slides.SlidesScreen
import com.zillow.automobile.storage.AnalyticsTracker
import com.zillow.automobile.storage.NavigationTracker
import com.zillow.automobile.storage.UserPreferences

/**
 * Creates a semantic test tag for a navigation destination using its class information. This
 * provides consistent test tags for each screen in the navigation flow.
 *
 * Example: OnboardingDestination -> "navigation.OnboardingDestination"
 */
inline fun <reified T : AppDestination> Modifier.destinationSemanticModifier(): Modifier {
  val destinationClass = T::class.java
  val packageName = destinationClass.`package`?.name?.split(".")?.lastOrNull() ?: "unknown"
  val className = destinationClass.simpleName ?: "unknown"

  val testTag = "$packageName.$className"

  return semantics {
    this.testTag = testTag
    this.testTagsAsResourceId = true
  }
}

/**
 * Creates a semantic test tag for a specific destination instance. This allows for parameterized
 * destinations to include their parameters in the test tag.
 *
 * Example: VideoPlayerDestination(videoId="abc123") ->
 * "navigation.VideoPlayerDestination.video_abc123"
 */
inline fun <reified T : NavKey> Modifier.destinationSemanticModifier(
    customTag: String? = null
): Modifier {
  val destinationClass = T::class.java
  val packageName = destinationClass.`package`?.name?.split(".")?.lastOrNull() ?: "unknown"
  val className = destinationClass.simpleName ?: "unknown"

  val testTag = buildString {
    append(packageName)
    append('.')
    append(className)
    if (customTag != null) {
      append('.')
      append(customTag)
    }
  }

  return semantics {
    this.testTag = testTag
    this.testTagsAsResourceId = true
  }
}

private const val TAG = "AppNavigation"

/** Determines the start destination based on user state */
fun determineStartDestination(
    hasCompletedOnboarding: Boolean,
    isAuthenticated: Boolean
): AppDestination {
  return when {
    !hasCompletedOnboarding -> OnboardingDestination
    !isAuthenticated -> LoginDestination
    else -> HomeDestination()
  }
}

/** Determines the start destination when a deep link is present */
fun determineStartDestinationWithDeepLink(
    deepLinkUri: Uri?,
    hasCompletedOnboarding: Boolean,
    isAuthenticated: Boolean
): AppDestination {
  Log.d(
      TAG,
      "determineStartDestinationWithDeepLink - deepLinkUri: $deepLinkUri, hasCompletedOnboarding: $hasCompletedOnboarding, isAuthenticated: $isAuthenticated")

  return if (deepLinkUri != null) {
    Log.d(TAG, "Processing deep link: $deepLinkUri")
    // Try to parse the deep link to a specific destination first
    val parsedDestination = DeepLinkManager.parseDeepLink(deepLinkUri)
    Log.d(TAG, "Parsed destination from deep link: $parsedDestination")

    if (parsedDestination != null) {
      // Check if the user has proper auth state for the destination
      val finalDestination =
          when (parsedDestination) {
            is OnboardingDestination -> {
              Log.d(TAG, "Deep link targets onboarding, allowing")
              parsedDestination
            }

            is LoginDestination -> {
              Log.d(TAG, "Deep link targets login, allowing")
              parsedDestination
            }
            is HomeDestination,
            is SlidesDestination,
            is VideoPlayerDestination,
            is SettingsDestination -> {
              // For protected destinations, ensure user is authenticated
              when {
                !hasCompletedOnboarding -> {
                  Log.d(
                      TAG,
                      "Deep link targets protected destination but user hasn't completed onboarding, redirecting to onboarding")
                  OnboardingDestination
                }

                !isAuthenticated -> {
                  Log.d(
                      TAG,
                      "Deep link targets protected destination but user not authenticated, redirecting to login")
                  LoginDestination
                }

                else -> {
                  Log.d(
                      TAG,
                      "Deep link targets protected destination and user is authenticated, allowing: $parsedDestination")
                  parsedDestination
                }
              }
            }
          }
      Log.d(TAG, "Final destination for deep link: $finalDestination")
      finalDestination
    } else {
      Log.d(TAG, "Failed to parse deep link, falling back to auth flow")
      // Fallback to auth flow if deep link parsing fails
      val fallbackDestination =
          when {
            !hasCompletedOnboarding -> {
              Log.d(TAG, "Fallback: user hasn't completed onboarding")
              OnboardingDestination
            }

            !isAuthenticated -> {
              Log.d(TAG, "Fallback: user not authenticated")
              LoginDestination
            }

            else -> {
              Log.d(TAG, "Fallback: user authenticated, going to home")
              HomeDestination()
            }
          }
      Log.d(TAG, "Fallback destination: $fallbackDestination")
      fallbackDestination
    }
  } else {
    Log.d(TAG, "No deep link present, using standard start destination logic")
    val standardDestination = determineStartDestination(hasCompletedOnboarding, isAuthenticated)
    Log.d(TAG, "Standard start destination: $standardDestination")
    standardDestination
  }
}

@Composable
fun AppNavigation(deepLinkUri: Uri? = null, onDeepLinkCallbackSet: ((Uri) -> Unit) -> Unit = {}) {
  val context = LocalContext.current
  val userPreferences = remember { UserPreferences(context) }
  val analyticsTracker = remember { AnalyticsTracker.getInstance() }

  // Determine the start destination based on user state and deep link presence
  val startDestination =
      determineStartDestinationWithDeepLink(
          deepLinkUri = deepLinkUri,
          hasCompletedOnboarding = userPreferences.hasCompletedOnboarding,
          isAuthenticated = userPreferences.isAuthenticated)

  Log.d(TAG, "Determined start destination: $startDestination")

  // Create back stack using nav3 with state restoration
  val backStack = rememberNavBackStack(startDestination)

  // Set up the deep link callback for runtime navigation
  LaunchedEffect(Unit) {
    Log.d(TAG, "Setting up deep link callback")
    onDeepLinkCallbackSet { uri ->
      Log.d(TAG, "Deep link callback invoked with URI: $uri")
      val parsedDestination = DeepLinkManager.parseDeepLink(uri)
      Log.d(TAG, "Parsed destination: $parsedDestination")

      if (parsedDestination != null) {
        // Check if the user has proper auth state for the destination
        val targetDestination =
            when (parsedDestination) {
              is OnboardingDestination -> parsedDestination
              is LoginDestination -> parsedDestination
              is HomeDestination,
              is SlidesDestination,
              is VideoPlayerDestination,
              is SettingsDestination -> {
                // For protected destinations, ensure user is authenticated
                when {
                  !userPreferences.hasCompletedOnboarding -> {
                    Log.d(TAG, "User hasn't completed onboarding, redirecting to onboarding")
                    OnboardingDestination
                  }

                  !userPreferences.isAuthenticated -> {
                    Log.d(TAG, "User not authenticated, redirecting to login")
                    LoginDestination
                  }

                  else -> {
                    Log.d(TAG, "User authenticated, navigating to: $parsedDestination")
                    parsedDestination
                  }
                }
              }
            }

        Log.d(TAG, "Navigating to destination: $targetDestination")
        // Clear the back stack and navigate to the deep link destination
        backStack.clear()
        backStack.add(targetDestination)

        // Track the deep link navigation
        analyticsTracker.trackEvent(
            "deep_link_navigation",
            mapOf(
                "uri" to uri.toString(),
                "destination" to targetDestination.toString(),
                "isRuntime" to "true"))
      } else {
        Log.w(TAG, "Failed to parse deep link destination: $uri")
      }
    }
  }

  NavDisplay(
      modifier = Modifier.semantics { testTagsAsResourceId = true },
      backStack = backStack,
      onBack = { backStack.removeLastOrNull() },
      entryDecorators =
          listOf(
              rememberSceneSetupNavEntryDecorator(),
              rememberSavedStateNavEntryDecorator(),
              rememberViewModelStoreNavEntryDecorator()),
      entryProvider =
          entryProvider {
            entry<OnboardingDestination> {
              LaunchedEffect(Unit) {
                Log.d(TAG, "Navigated to OnboardingScreen")
                analyticsTracker.trackScreenView("OnboardingScreen")
              }
              Box(modifier = Modifier.destinationSemanticModifier<OnboardingDestination>()) {
                OnboardingScreen(
                    onFinish = {
                      Log.d(TAG, "Onboarding finished, navigating to LoginScreen")
                      userPreferences.hasCompletedOnboarding = true
                      NavigationTracker.trackNavigation(
                          "OnboardingScreen", "LoginScreen", "onboarding_finish")
                      backStack.clear()
                      backStack.add(LoginDestination)
                    })
              }
            }

            entry<LoginDestination> {
              LaunchedEffect(Unit) {
                Log.d(TAG, "Navigated to LoginScreen")
                analyticsTracker.trackScreenView("LoginScreen")
              }
              Box(modifier = Modifier.destinationSemanticModifier<LoginDestination>()) {
                LoginScreen(
                    userPreferences = userPreferences,
                    onNavigateToHome = {
                      Log.d(TAG, "Login successful, navigating to HomeScreen")
                      NavigationTracker.trackNavigation(
                          "LoginScreen", "HomeScreen", "login_success")
                      backStack.clear()
                      backStack.add(HomeDestination())
                    },
                    onGuestMode = {
                      Log.d(TAG, "Guest mode selected, navigating to HomeScreen")
                      userPreferences.isGuestMode = true
                      NavigationTracker.trackNavigation("LoginScreen", "HomeScreen", "guest_mode")
                      backStack.clear()
                      backStack.add(HomeDestination())
                    })
              }
            }

            entry<HomeDestination> { homeDestination ->
              LaunchedEffect(Unit) {
                Log.d(
                    TAG,
                    "Navigated to HomeScreen with selectedTab: ${homeDestination.selectedTab}, selectedSubTab: ${homeDestination.selectedSubTab}")
                analyticsTracker.trackScreenView("HomeScreen")
              }
              Box(modifier = Modifier.destinationSemanticModifier<HomeDestination>()) {
                HomeScreen(
                    initialSelectedTab = homeDestination.selectedTab,
                    initialSelectedSubTab = homeDestination.selectedSubTab,
                    onNavigateToVideoPlayer = { videoId ->
                      Log.d(TAG, "Navigating to VideoPlayerScreen with videoId: $videoId")
                      NavigationTracker.trackNavigation(
                          "HomeScreen", "VideoPlayerScreen", "video_selection")
                      backStack.add(VideoPlayerDestination(videoId))
                    },
                    onNavigateToSlides = { slideIndex ->
                      Log.d(TAG, "Navigating to SlidesScreen with slideIndex: $slideIndex")
                      NavigationTracker.trackNavigation(
                          "HomeScreen", "SlidesScreen", "slides_selection")
                      backStack.add(SlidesDestination(slideIndex))
                    },
                    onLogout = {
                      Log.d(TAG, "Logout initiated, navigating to LoginScreen")
                      if (userPreferences.isGuestMode) {
                        userPreferences.isGuestMode = false
                      } else {
                        userPreferences.isAuthenticated = false
                      }
                      NavigationTracker.trackNavigation("HomeScreen", "LoginScreen", "logout")
                      backStack.clear()
                      backStack.add(LoginDestination)
                    },
                    onGuestModeNavigateToLogin = {
                      Log.d(TAG, "Guest mode to login, navigating to LoginScreen")
                      userPreferences.isGuestMode = false
                      NavigationTracker.trackNavigation(
                          "HomeScreen", "LoginScreen", "guest_to_login")
                      backStack.clear()
                      backStack.add(LoginDestination)
                    },
                    modifier = Modifier.destinationSemanticModifier<HomeDestination>(),
                )
              }
            }

            entry<SlidesDestination> { slidesDestination ->
              LaunchedEffect(Unit) {
                Log.d(
                    TAG,
                    "Navigated to SlidesScreen with slideIndex: ${slidesDestination.slideIndex}")
                analyticsTracker.trackScreenView("SlidesScreen")
              }
              Box(
                  modifier =
                      Modifier.destinationSemanticModifier<SlidesDestination>(
                          "slide_${slidesDestination.slideIndex}")) {
                    SlidesScreen(
                        initialSlideIndex = slidesDestination.slideIndex,
                        onNavigateBack = {
                          Log.d(TAG, "Navigating back from SlidesScreen to HomeScreen")
                          NavigationTracker.trackNavigation(
                              "SlidesScreen", "HomeScreen", "back_navigation")
                          backStack.removeLastOrNull()
                        })
                  }
            }

            entry<VideoPlayerDestination> { videoPlayerDestination ->
              LaunchedEffect(Unit) {
                Log.d(
                    TAG,
                    "Navigated to VideoPlayerScreen with videoId: ${videoPlayerDestination.videoId}")
                analyticsTracker.trackScreenView("VideoPlayerScreen")
              }
              Box(
                  modifier =
                      Modifier.destinationSemanticModifier<VideoPlayerDestination>(
                          "video_${videoPlayerDestination.videoId}")) {
                    VideoPlayerScreen(
                        videoId = videoPlayerDestination.videoId,
                        onNavigateBack = {
                          Log.d(TAG, "Navigating back from VideoPlayerScreen to HomeScreen")
                          NavigationTracker.trackNavigation(
                              "VideoPlayerScreen", "HomeScreen", "back_navigation")
                          backStack.removeLastOrNull()
                        })
                  }
            }

            entry<SettingsDestination> {
              LaunchedEffect(Unit) {
                Log.d(TAG, "Navigated to SettingsScreen")
                analyticsTracker.trackScreenView("SettingsScreen")
              }
              Box(modifier = Modifier.destinationSemanticModifier<SettingsDestination>()) {
                SettingsScreen(
                    onLogout = {
                      Log.d(TAG, "Logout initiated from settings, navigating to LoginScreen")
                      if (userPreferences.isGuestMode) {
                        userPreferences.isGuestMode = false
                      } else {
                        userPreferences.isAuthenticated = false
                      }
                      NavigationTracker.trackNavigation("SettingsScreen", "LoginScreen", "logout")
                      backStack.clear()
                      backStack.add(LoginDestination)
                    },
                    onGuestModeNavigateToLogin = {
                      Log.d(TAG, "Guest mode to login from settings, navigating to LoginScreen")
                      userPreferences.isGuestMode = false
                      NavigationTracker.trackNavigation(
                          "SettingsScreen", "LoginScreen", "guest_to_login")
                      backStack.clear()
                      backStack.add(LoginDestination)
                    })
              }
            }
          })
}
