package com.zillow.automobile.playground.navigation

import android.net.Uri
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

/** Determines the start destination based on user state */
fun determineStartDestination(
    hasCompletedOnboarding: Boolean,
    isAuthenticated: Boolean
): AppDestination {
  return when {
    !hasCompletedOnboarding -> OnboardingDestination
    !isAuthenticated -> LoginDestination
    else -> HomeDestination
  }
}

/** Determines the start destination when a deep link is present */
fun determineStartDestinationWithDeepLink(
    deepLinkUri: Uri?,
    hasCompletedOnboarding: Boolean,
    isAuthenticated: Boolean
): AppDestination {
  return if (deepLinkUri != null) {
    // Try to parse the deep link to a specific destination first
    val parsedDestination = DeepLinkManager.parseDeepLink(deepLinkUri)
    if (parsedDestination != null) {
      // Check if the user has proper auth state for the destination
      when (parsedDestination) {
        is OnboardingDestination -> parsedDestination
        is LoginDestination -> parsedDestination
        is HomeDestination,
        is SlidesDestination,
        is VideoPlayerDestination -> {
          // For protected destinations, ensure user is authenticated
          when {
            !hasCompletedOnboarding -> OnboardingDestination
            !isAuthenticated -> LoginDestination
            else -> parsedDestination
          }
        }
      }
    } else {
      // Fallback to auth flow if deep link parsing fails
      when {
        !hasCompletedOnboarding -> OnboardingDestination
        !isAuthenticated -> LoginDestination
        else -> HomeDestination
      }
    }
  } else {
    determineStartDestination(hasCompletedOnboarding, isAuthenticated)
  }
}

@Composable
fun AppNavigation(deepLinkUri: Uri? = null) {
  val context = LocalContext.current
  val userPreferences = remember { UserPreferences(context) }
  val analyticsTracker = remember { AnalyticsTracker.getInstance() }

  // Determine the start destination based on user state and deep link presence
  val startDestination =
      determineStartDestinationWithDeepLink(
          deepLinkUri = deepLinkUri,
          hasCompletedOnboarding = userPreferences.hasCompletedOnboarding,
          isAuthenticated = userPreferences.isAuthenticated)

  // Create back stack using nav3 with state restoration
  val backStack = rememberNavBackStack(startDestination)

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
              LaunchedEffect(Unit) { analyticsTracker.trackScreenView("OnboardingScreen") }
              Box(modifier = Modifier.destinationSemanticModifier<OnboardingDestination>()) {
                OnboardingScreen(
                    onFinish = {
                      userPreferences.hasCompletedOnboarding = true
                      NavigationTracker.trackNavigation(
                          "OnboardingScreen", "LoginScreen", "onboarding_finish")
                      backStack.clear()
                      backStack.add(LoginDestination)
                    })
              }
            }

            entry<LoginDestination> {
              LaunchedEffect(Unit) { analyticsTracker.trackScreenView("LoginScreen") }
              Box(modifier = Modifier.destinationSemanticModifier<LoginDestination>()) {
                LoginScreen(
                    userPreferences = userPreferences,
                    onNavigateToHome = {
                      NavigationTracker.trackNavigation(
                          "LoginScreen", "HomeScreen", "login_success")
                      backStack.clear()
                      backStack.add(HomeDestination)
                    },
                    onGuestMode = {
                      userPreferences.isGuestMode = true
                      NavigationTracker.trackNavigation("LoginScreen", "HomeScreen", "guest_mode")
                      backStack.clear()
                      backStack.add(HomeDestination)
                    })
              }
            }

            entry<HomeDestination> {
              LaunchedEffect(Unit) { analyticsTracker.trackScreenView("HomeScreen") }
              Box(modifier = Modifier.destinationSemanticModifier<HomeDestination>()) {
                HomeScreen(
                    onNavigateToVideoPlayer = { videoId ->
                      NavigationTracker.trackNavigation(
                          "HomeScreen", "VideoPlayerScreen", "video_selection")
                      backStack.add(VideoPlayerDestination(videoId))
                    },
                    onNavigateToSlides = { slideIndex ->
                      NavigationTracker.trackNavigation(
                          "HomeScreen", "SlidesScreen", "slides_selection")
                      backStack.add(SlidesDestination(slideIndex))
                    },
                    onLogout = {
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
              LaunchedEffect(Unit) { analyticsTracker.trackScreenView("SlidesScreen") }
              Box(
                  modifier =
                      Modifier.destinationSemanticModifier<SlidesDestination>(
                          "slide_${slidesDestination.slideIndex}")) {
                    SlidesScreen(
                        initialSlideIndex = slidesDestination.slideIndex,
                        onNavigateBack = {
                          NavigationTracker.trackNavigation(
                              "SlidesScreen", "HomeScreen", "back_navigation")
                          backStack.removeLastOrNull()
                        })
                  }
            }

            entry<VideoPlayerDestination> { videoPlayerDestination ->
              LaunchedEffect(Unit) { analyticsTracker.trackScreenView("VideoPlayerScreen") }
              Box(
                  modifier =
                      Modifier.destinationSemanticModifier<VideoPlayerDestination>(
                          "video_${videoPlayerDestination.videoId}")) {
                    VideoPlayerScreen(
                        videoId = videoPlayerDestination.videoId,
                        onNavigateBack = {
                          NavigationTracker.trackNavigation(
                              "VideoPlayerScreen", "HomeScreen", "back_navigation")
                          backStack.removeLastOrNull()
                        })
                  }
            }
          })
}
