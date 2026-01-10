package dev.jasonpearson.automobile.playground.navigation

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
import androidx.navigation3.runtime.*
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.*
import androidx.navigation3.ui.NavDisplay
import dev.jasonpearson.automobile.demos.BugReproScreen
import dev.jasonpearson.automobile.demos.ContrastDemoScreen
import dev.jasonpearson.automobile.demos.DemoIndexScreen
import dev.jasonpearson.automobile.demos.PerformanceDetailScreen
import dev.jasonpearson.automobile.demos.PerformanceListScreen
import dev.jasonpearson.automobile.demos.StartupDemoScreen
import dev.jasonpearson.automobile.demos.TapTargetsDemoScreen
import dev.jasonpearson.automobile.demos.UxFlowDetailsScreen
import dev.jasonpearson.automobile.demos.UxFlowStartScreen
import dev.jasonpearson.automobile.demos.UxFlowSummaryScreen
import dev.jasonpearson.automobile.home.HomeScreen
import dev.jasonpearson.automobile.login.ui.LoginScreen
import dev.jasonpearson.automobile.mediaplayer.VideoPlayerScreen
import dev.jasonpearson.automobile.onboarding.OnboardingScreen
import dev.jasonpearson.automobile.sdk.AutoMobileSDK
import dev.jasonpearson.automobile.sdk.adapters.Navigation3Adapter
import dev.jasonpearson.automobile.settings.SettingsScreen
import dev.jasonpearson.automobile.slides.SlidesScreen
import dev.jasonpearson.automobile.storage.AnalyticsTracker
import dev.jasonpearson.automobile.storage.NavigationTracker
import dev.jasonpearson.automobile.storage.UserPreferences

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
    isAuthenticated: Boolean,
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
    isAuthenticated: Boolean,
): AppDestination {
  Log.d(
      TAG,
      "determineStartDestinationWithDeepLink - deepLinkUri: $deepLinkUri, hasCompletedOnboarding: $hasCompletedOnboarding, isAuthenticated: $isAuthenticated",
  )

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
            is SettingsDestination,
            is DemoIndexDestination,
            is DemoUxStartDestination,
            is DemoUxDetailsDestination,
            is DemoUxSummaryDestination,
            is DemoStartupDestination,
            is DemoPerformanceListDestination,
            is DemoPerformanceDetailDestination,
            is DemoContrastDestination,
            is DemoTapTargetsDestination,
            is DemoBugReproDestination -> {
              // For protected destinations, ensure user is authenticated
              when {
                !hasCompletedOnboarding -> {
                  Log.d(
                      TAG,
                      "Deep link targets protected destination but user hasn't completed onboarding, redirecting to onboarding",
                  )
                  OnboardingDestination
                }

                !isAuthenticated -> {
                  Log.d(
                      TAG,
                      "Deep link targets protected destination but user not authenticated, redirecting to login",
                  )
                  LoginDestination
                }

                else -> {
                  Log.d(
                      TAG,
                      "Deep link targets protected destination and user is authenticated, allowing: $parsedDestination",
                  )
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
          isAuthenticated = userPreferences.isAuthenticated,
      )

  Log.d(TAG, "Determined start destination: $startDestination")

  // Create back stack using nav3 with state restoration
  val backStack = rememberNavBackStack(startDestination)

  // Register a navigation listener to log all navigation events
  LaunchedEffect(Unit) {
    AutoMobileSDK.addNavigationListener { event ->
      Log.d(
          TAG,
          "AutoMobileSDK Navigation Event: destination=${event.destination}, source=${event.source}, arguments=${event.arguments}, metadata=${event.metadata}",
      )
    }
  }

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
              is SettingsDestination,
              is DemoIndexDestination,
              is DemoUxStartDestination,
              is DemoUxDetailsDestination,
              is DemoUxSummaryDestination,
              is DemoStartupDestination,
              is DemoPerformanceListDestination,
              is DemoPerformanceDetailDestination,
              is DemoContrastDestination,
              is DemoTapTargetsDestination,
              is DemoBugReproDestination -> {
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
                "isRuntime" to "true",
            ),
        )
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
              rememberSaveableStateHolderNavEntryDecorator(),
              rememberViewModelStoreNavEntryDecorator(),
          ),
      entryProvider =
          entryProvider {
            entry<OnboardingDestination> { destination ->
              Navigation3Adapter.TrackNavigation(destination)
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
                          "OnboardingScreen",
                          "LoginScreen",
                          "onboarding_finish",
                      )
                      backStack.clear()
                      backStack.add(LoginDestination)
                    }
                )
              }
            }

            entry<LoginDestination> { destination ->
              Navigation3Adapter.TrackNavigation(destination)
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
                          "LoginScreen",
                          "HomeScreen",
                          "login_success",
                      )
                      backStack.clear()
                      backStack.add(HomeDestination())
                    },
                    onGuestMode = {
                      Log.d(TAG, "Guest mode selected, navigating to HomeScreen")
                      userPreferences.isGuestMode = true
                      NavigationTracker.trackNavigation("LoginScreen", "HomeScreen", "guest_mode")
                      backStack.clear()
                      backStack.add(HomeDestination())
                    },
                )
              }
            }

            entry<HomeDestination> { homeDestination ->
              Navigation3Adapter.TrackNavigation(
                  destination = homeDestination,
                  extractArguments = {
                    mapOf("selectedTab" to it.selectedTab, "selectedSubTab" to it.selectedSubTab)
                  },
              )
              LaunchedEffect(Unit) {
                Log.d(
                    TAG,
                    "Navigated to HomeScreen with selectedTab: ${homeDestination.selectedTab}, selectedSubTab: ${homeDestination.selectedSubTab}",
                )
                analyticsTracker.trackScreenView("HomeScreen")
              }
              Box(modifier = Modifier.destinationSemanticModifier<HomeDestination>()) {
                HomeScreen(
                    initialSelectedTab = homeDestination.selectedTab,
                    initialSelectedSubTab = homeDestination.selectedSubTab,
                    onNavigateToVideoPlayer = { videoId ->
                      Log.d(TAG, "Navigating to VideoPlayerScreen with videoId: $videoId")
                      NavigationTracker.trackNavigation(
                          "HomeScreen",
                          "VideoPlayerScreen",
                          "video_selection",
                      )
                      backStack.add(VideoPlayerDestination(videoId))
                    },
                    onNavigateToDemos = {
                      Log.d(TAG, "Navigating to DemoIndexScreen")
                      NavigationTracker.trackNavigation(
                          "HomeScreen",
                          "DemoIndexScreen",
                          "demo_selection",
                      )
                      backStack.add(DemoIndexDestination)
                    },
                    onNavigateToSlides = { slideIndex ->
                      Log.d(TAG, "Navigating to SlidesScreen with slideIndex: $slideIndex")
                      NavigationTracker.trackNavigation(
                          "HomeScreen",
                          "SlidesScreen",
                          "slides_selection",
                      )
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
                          "HomeScreen",
                          "LoginScreen",
                          "guest_to_login",
                      )
                      backStack.clear()
                      backStack.add(LoginDestination)
                    },
                    modifier = Modifier.destinationSemanticModifier<HomeDestination>(),
                )
              }
            }

            entry<SlidesDestination> { slidesDestination ->
              Navigation3Adapter.TrackNavigation(
                  destination = slidesDestination,
                  extractArguments = { mapOf("slideIndex" to it.slideIndex) },
              )
              LaunchedEffect(Unit) {
                Log.d(
                    TAG,
                    "Navigated to SlidesScreen with slideIndex: ${slidesDestination.slideIndex}",
                )
                analyticsTracker.trackScreenView("SlidesScreen")
              }
              Box(
                  modifier =
                      Modifier.destinationSemanticModifier<SlidesDestination>(
                          "slide_${slidesDestination.slideIndex}"
                      )
              ) {
                SlidesScreen(
                    initialSlideIndex = slidesDestination.slideIndex,
                    onNavigateBack = {
                      Log.d(TAG, "Navigating back from SlidesScreen to HomeScreen")
                      NavigationTracker.trackNavigation(
                          "SlidesScreen",
                          "HomeScreen",
                          "back_navigation",
                      )
                      backStack.removeLastOrNull()
                    },
                )
              }
            }

            entry<VideoPlayerDestination> { videoPlayerDestination ->
              Navigation3Adapter.TrackNavigation(
                  destination = videoPlayerDestination,
                  extractArguments = { mapOf("videoId" to it.videoId) },
              )
              LaunchedEffect(Unit) {
                Log.d(
                    TAG,
                    "Navigated to VideoPlayerScreen with videoId: ${videoPlayerDestination.videoId}",
                )
                analyticsTracker.trackScreenView("VideoPlayerScreen")
              }
              Box(
                  modifier =
                      Modifier.destinationSemanticModifier<VideoPlayerDestination>(
                          "video_${videoPlayerDestination.videoId}"
                      )
              ) {
                VideoPlayerScreen(
                    videoId = videoPlayerDestination.videoId,
                    onNavigateBack = {
                      Log.d(TAG, "Navigating back from VideoPlayerScreen to HomeScreen")
                      NavigationTracker.trackNavigation(
                          "VideoPlayerScreen",
                          "HomeScreen",
                          "back_navigation",
                      )
                      backStack.removeLastOrNull()
                    },
                )
              }
            }

            entry<SettingsDestination> { destination ->
              Navigation3Adapter.TrackNavigation(destination)
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
                          "SettingsScreen",
                          "LoginScreen",
                          "guest_to_login",
                      )
                      backStack.clear()
                      backStack.add(LoginDestination)
                    },
                )
              }
            }

            entry<DemoIndexDestination> { destination ->
              Navigation3Adapter.TrackNavigation(destination)
              LaunchedEffect(Unit) {
                Log.d(TAG, "Navigated to DemoIndexScreen")
                analyticsTracker.trackScreenView("DemoIndexScreen")
              }
              Box(modifier = Modifier.destinationSemanticModifier<DemoIndexDestination>()) {
                DemoIndexScreen(
                    onNavigateToUxFlow = { backStack.add(DemoUxStartDestination) },
                    onNavigateToStartup = { backStack.add(DemoStartupDestination) },
                    onNavigateToPerformanceList = {
                      backStack.add(DemoPerformanceListDestination)
                    },
                    onNavigateToContrast = { backStack.add(DemoContrastDestination) },
                    onNavigateToTapTargets = { backStack.add(DemoTapTargetsDestination) },
                    onNavigateToBugRepro = { backStack.add(DemoBugReproDestination) },
                    onNavigateBack = { backStack.removeLastOrNull() },
                )
              }
            }

            entry<DemoUxStartDestination> { destination ->
              Navigation3Adapter.TrackNavigation(destination)
              LaunchedEffect(Unit) {
                Log.d(TAG, "Navigated to DemoUxStartScreen")
                analyticsTracker.trackScreenView("DemoUxStartScreen")
              }
              Box(modifier = Modifier.destinationSemanticModifier<DemoUxStartDestination>()) {
                UxFlowStartScreen(
                    onNavigateNext = { backStack.add(DemoUxDetailsDestination) },
                    onNavigateBack = { backStack.removeLastOrNull() },
                )
              }
            }

            entry<DemoUxDetailsDestination> { destination ->
              Navigation3Adapter.TrackNavigation(destination)
              LaunchedEffect(Unit) {
                Log.d(TAG, "Navigated to DemoUxDetailsScreen")
                analyticsTracker.trackScreenView("DemoUxDetailsScreen")
              }
              Box(modifier = Modifier.destinationSemanticModifier<DemoUxDetailsDestination>()) {
                UxFlowDetailsScreen(
                    onNavigateNext = { backStack.add(DemoUxSummaryDestination) },
                    onNavigateBack = { backStack.removeLastOrNull() },
                )
              }
            }

            entry<DemoUxSummaryDestination> { destination ->
              Navigation3Adapter.TrackNavigation(destination)
              LaunchedEffect(Unit) {
                Log.d(TAG, "Navigated to DemoUxSummaryScreen")
                analyticsTracker.trackScreenView("DemoUxSummaryScreen")
              }
              Box(modifier = Modifier.destinationSemanticModifier<DemoUxSummaryDestination>()) {
                UxFlowSummaryScreen(
                    onRestartFlow = {
                      repeat(2) { backStack.removeLastOrNull() }
                    },
                    onNavigateBack = { backStack.removeLastOrNull() },
                )
              }
            }

            entry<DemoStartupDestination> { destination ->
              Navigation3Adapter.TrackNavigation(destination)
              LaunchedEffect(Unit) {
                Log.d(TAG, "Navigated to StartupDemoScreen")
                analyticsTracker.trackScreenView("StartupDemoScreen")
              }
              Box(modifier = Modifier.destinationSemanticModifier<DemoStartupDestination>()) {
                StartupDemoScreen(onNavigateBack = { backStack.removeLastOrNull() })
              }
            }

            entry<DemoPerformanceListDestination> { destination ->
              Navigation3Adapter.TrackNavigation(destination)
              LaunchedEffect(Unit) {
                Log.d(TAG, "Navigated to PerformanceListScreen")
                analyticsTracker.trackScreenView("PerformanceListScreen")
              }
              Box(
                  modifier = Modifier.destinationSemanticModifier<DemoPerformanceListDestination>()
              ) {
                PerformanceListScreen(
                    onNavigateToDetail = { itemId ->
                      backStack.add(DemoPerformanceDetailDestination(itemId))
                    },
                    onNavigateBack = { backStack.removeLastOrNull() },
                )
              }
            }

            entry<DemoPerformanceDetailDestination> { destination ->
              Navigation3Adapter.TrackNavigation(
                  destination = destination,
                  extractArguments = { mapOf("itemId" to it.itemId) },
              )
              LaunchedEffect(Unit) {
                Log.d(TAG, "Navigated to PerformanceDetailScreen with itemId: ${destination.itemId}")
                analyticsTracker.trackScreenView("PerformanceDetailScreen")
              }
              Box(
                  modifier =
                      Modifier.destinationSemanticModifier<DemoPerformanceDetailDestination>(
                          "item_${destination.itemId}"
                      )
              ) {
                PerformanceDetailScreen(
                    itemId = destination.itemId,
                    onNavigateBack = { backStack.removeLastOrNull() },
                )
              }
            }

            entry<DemoContrastDestination> { destination ->
              Navigation3Adapter.TrackNavigation(destination)
              LaunchedEffect(Unit) {
                Log.d(TAG, "Navigated to ContrastDemoScreen")
                analyticsTracker.trackScreenView("ContrastDemoScreen")
              }
              Box(modifier = Modifier.destinationSemanticModifier<DemoContrastDestination>()) {
                ContrastDemoScreen(onNavigateBack = { backStack.removeLastOrNull() })
              }
            }

            entry<DemoTapTargetsDestination> { destination ->
              Navigation3Adapter.TrackNavigation(destination)
              LaunchedEffect(Unit) {
                Log.d(TAG, "Navigated to TapTargetsDemoScreen")
                analyticsTracker.trackScreenView("TapTargetsDemoScreen")
              }
              Box(modifier = Modifier.destinationSemanticModifier<DemoTapTargetsDestination>()) {
                TapTargetsDemoScreen(onNavigateBack = { backStack.removeLastOrNull() })
              }
            }

            entry<DemoBugReproDestination> { destination ->
              Navigation3Adapter.TrackNavigation(destination)
              LaunchedEffect(Unit) {
                Log.d(TAG, "Navigated to BugReproScreen")
                analyticsTracker.trackScreenView("BugReproScreen")
              }
              Box(modifier = Modifier.destinationSemanticModifier<DemoBugReproDestination>()) {
                BugReproScreen(onNavigateBack = { backStack.removeLastOrNull() })
              }
            }
          },
  )
}
