package com.zillow.automobile.playground.navigation

/**
 * App navigation destinations with deep link support
 */
sealed class AppDestination(val route: String, val deepLinkPattern: String)

object OnboardingDestination : AppDestination(
  route = "onboarding",
  deepLinkPattern = "automobile://playground/onboarding"
)

object LoginDestination : AppDestination(
  route = "login",
  deepLinkPattern = "automobile://playground/login"
)

object HomeDestination : AppDestination(
  route = "home",
  deepLinkPattern = "automobile://playground/home"
)

object SlidesDestination : AppDestination(
  route = "slides/{slideIndex}",
  deepLinkPattern = "automobile://playground/slides/{slideIndex}"
) {
  const val routeWithArgs = "slides/{slideIndex}"
  const val routeBase = "slides"

  fun createRoute(slideIndex: Int = 0) = "slides/$slideIndex"

  fun createDeepLink(slideIndex: Int = 0) = "automobile://playground/slides/$slideIndex"
}

object VideoPlayerDestination : AppDestination(
  route = "video_player/{videoId}",
  deepLinkPattern = "automobile://playground/video_player/{videoId}"
) {
  const val routeWithArgs = "video_player/{videoId}"

  fun createRoute(videoId: String) = "video_player/$videoId"

  fun createDeepLink(videoId: String) = "automobile://playground/video_player/$videoId"
}
