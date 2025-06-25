package com.zillow.automobile.playground.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import com.zillow.automobile.home.HomeScreen
import com.zillow.automobile.login.ui.login.LoginScreen
import com.zillow.automobile.mediaplayer.VideoPlayerScreen
import com.zillow.automobile.onboarding.OnboardingScreen
import com.zillow.automobile.slides.SlidesScreen
import com.zillow.automobile.storage.AnalyticsTracker
import com.zillow.automobile.storage.NavigationTracker
import com.zillow.automobile.storage.UserPreferences

/** Determines the start destination based on user state */
fun determineStartDestination(hasCompletedOnboarding: Boolean, isAuthenticated: Boolean): String {
  return when {
    !hasCompletedOnboarding -> OnboardingDestination.route
    !isAuthenticated -> LoginDestination.route
    else -> HomeDestination.route
  }
}

@Composable
fun AppNavigation() {
  val navController = rememberNavController()
  val context = LocalContext.current
  val userPreferences = remember { UserPreferences(context) }
  val analyticsTracker = remember { AnalyticsTracker.getInstance() }

  // Determine the start destination based on user state
  val startDestination =
      determineStartDestination(
          hasCompletedOnboarding = userPreferences.hasCompletedOnboarding,
          isAuthenticated = userPreferences.isAuthenticated)

  NavHost(navController = navController, startDestination = startDestination) {
    composable(
        route = OnboardingDestination.route,
        deepLinks = listOf(navDeepLink { uriPattern = OnboardingDestination.deepLinkPattern })) {
          LaunchedEffect(Unit) { analyticsTracker.trackScreenView("OnboardingScreen") }
          OnboardingScreen(
              onFinish = {
                userPreferences.hasCompletedOnboarding = true
                NavigationTracker.trackNavigation(
                    "OnboardingScreen", "LoginScreen", "onboarding_finish")
                navController.navigate(LoginDestination.route) {
                  popUpTo(OnboardingDestination.route) { inclusive = true }
                }
              })
        }

    composable(
        route = LoginDestination.route,
        deepLinks = listOf(navDeepLink { uriPattern = LoginDestination.deepLinkPattern })) {
          LaunchedEffect(Unit) { analyticsTracker.trackScreenView("LoginScreen") }
          LoginScreen(
              userPreferences = userPreferences,
              onNavigateToHome = {
                NavigationTracker.trackNavigation("LoginScreen", "HomeScreen", "login_success")
                navController.navigate(HomeDestination.route) {
                  popUpTo(LoginDestination.route) { inclusive = true }
                }
              },
              onGuestMode = {
                userPreferences.isGuestMode = true
                NavigationTracker.trackNavigation("LoginScreen", "HomeScreen", "guest_mode")
                navController.navigate(HomeDestination.route) {
                  popUpTo(LoginDestination.route) { inclusive = true }
                }
              })
        }

    composable(
        route = HomeDestination.route,
        deepLinks = listOf(navDeepLink { uriPattern = HomeDestination.deepLinkPattern })) {
          LaunchedEffect(Unit) { analyticsTracker.trackScreenView("HomeScreen") }
          HomeScreen(
              onNavigateToVideoPlayer = { videoId ->
                NavigationTracker.trackNavigation(
                    "HomeScreen", "VideoPlayerScreen", "video_selection")
                navController.navigate(VideoPlayerDestination.createRoute(videoId))
              },
              onNavigateToSlides = { slideIndex ->
                NavigationTracker.trackNavigation("HomeScreen", "SlidesScreen", "slides_selection")
                navController.navigate(SlidesDestination.createRoute(slideIndex))
              },
              onLogout = {
                if (userPreferences.isGuestMode) {
                  userPreferences.isGuestMode = false
                } else {
                  userPreferences.isAuthenticated = false
                }
                NavigationTracker.trackNavigation("HomeScreen", "LoginScreen", "logout")
                navController.navigate(LoginDestination.route) {
                  popUpTo(HomeDestination.route) { inclusive = true }
                }
              },
              onGuestModeNavigateToLogin = {
                userPreferences.isGuestMode = false
                NavigationTracker.trackNavigation("HomeScreen", "LoginScreen", "guest_to_login")
                navController.navigate(LoginDestination.route) {
                  popUpTo(HomeDestination.route) { inclusive = true }
                }
              })
        }

    composable(
        route = SlidesDestination.routeWithArgs,
        arguments =
            listOf(
                navArgument("slideIndex") {
                  type = NavType.IntType
                  defaultValue = 0
                }),
        deepLinks = listOf(navDeepLink { uriPattern = SlidesDestination.deepLinkPattern })) {
            backStackEntry ->
          val slideIndex = backStackEntry.arguments?.getInt("slideIndex") ?: 0
          LaunchedEffect(Unit) { analyticsTracker.trackScreenView("SlidesScreen") }
          SlidesScreen(
              initialSlideIndex = slideIndex,
              onNavigateBack = {
                NavigationTracker.trackNavigation("SlidesScreen", "HomeScreen", "back_navigation")
                navController.popBackStack()
              })
        }

    composable(
        route = VideoPlayerDestination.routeWithArgs,
        deepLinks = listOf(navDeepLink { uriPattern = VideoPlayerDestination.deepLinkPattern })) {
            backStackEntry ->
          val videoId = backStackEntry.arguments?.getString("videoId")
          videoId?.let {
            LaunchedEffect(Unit) { analyticsTracker.trackScreenView("VideoPlayerScreen") }
            VideoPlayerScreen(
                videoId = it,
                onNavigateBack = {
                  NavigationTracker.trackNavigation(
                      "VideoPlayerScreen", "HomeScreen", "back_navigation")
                  navController.popBackStack()
                })
          }
        }
  }
}
