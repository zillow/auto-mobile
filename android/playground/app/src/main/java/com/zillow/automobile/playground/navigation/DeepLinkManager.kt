package com.zillow.automobile.playground.navigation

import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Utility class for managing deep link URLs within the AutoMobile Playground app. Provides methods
 * for generating and parsing deep link URLs for navigation.
 */
object DeepLinkManager {

  // Base deep link scheme and host
  private const val SCHEME = "automobile"
  private const val HOST = "playground"

  // Deep link paths for different destinations
  private const val PATH_ONBOARDING = "/onboarding"
  private const val PATH_LOGIN = "/login"
  private const val PATH_HOME = "/home"
  private const val PATH_SLIDES = "/slides"
  private const val PATH_VIDEO_PLAYER = "/video_player"

  /** Generate deep link URL for onboarding screen */
  fun generateOnboardingUrl(): String {
    return buildUri(PATH_ONBOARDING)
  }

  /** Generate deep link URL for login screen */
  fun generateLoginUrl(): String {
    return buildUri(PATH_LOGIN)
  }

  /** Generate deep link URL for home screen */
  fun generateHomeUrl(): String {
    return buildUri(PATH_HOME)
  }

  /** Generate deep link URL for slides screen */
  fun generateSlidesUrl(slideIndex: Int = 0): String {
    return buildUri("$PATH_SLIDES/$slideIndex")
  }

  /** Generate deep link URL for video player screen */
  fun generateVideoPlayerUrl(videoId: String): String {
    return buildUri("$PATH_VIDEO_PLAYER/$videoId")
  }

  /** Parse deep link URL and return the corresponding navigation route */
  fun parseDeepLink(uri: Uri): String? {
    if (uri.scheme != SCHEME || uri.host != HOST) {
      return null
    }

    val path = uri.path ?: return null

    return when {
      path == PATH_ONBOARDING -> OnboardingDestination.route
      path == PATH_LOGIN -> LoginDestination.route
      path == PATH_HOME -> HomeDestination.route
      path.startsWith(PATH_SLIDES) -> {
        val slideIndex = path.substringAfterLast("/").toIntOrNull() ?: 0
        SlidesDestination.createRoute(slideIndex)
      }

      path.startsWith(PATH_VIDEO_PLAYER) -> {
        val videoId = path.substringAfterLast("/")
        if (videoId.isNotEmpty()) {
          VideoPlayerDestination.createRoute(videoId)
        } else {
          null
        }
      }
      else -> null
    }
  }

  /** Validate if a URI is a valid deep link for this app */
  fun isValidDeepLink(uri: Uri): Boolean {
    return uri.scheme == SCHEME && uri.host == HOST && parseDeepLink(uri) != null
  }

  /** Get the destination name from a deep link URI */
  fun getDestinationName(uri: Uri): String? {
    if (!isValidDeepLink(uri)) return null

    val path = uri.path ?: return null

    return when {
      path == PATH_ONBOARDING -> "Onboarding"
      path == PATH_LOGIN -> "Login"
      path == PATH_HOME -> "Home"
      path.startsWith(PATH_SLIDES) -> "Slides"
      path.startsWith(PATH_VIDEO_PLAYER) -> "Video Player"
      else -> null
    }
  }

  // AutoMobile test integration methods

  /** Navigate to onboarding screen via deep link for AutoMobile tests */
  fun navigateToOnboardingForTest(context: Context) {
    launchDeepLink(context, generateOnboardingUrl())
  }

  /** Navigate to login screen via deep link for AutoMobile tests */
  fun navigateToLoginForTest(context: Context) {
    launchDeepLink(context, generateLoginUrl())
  }

  /** Navigate to home screen via deep link for AutoMobile tests */
  fun navigateToHomeForTest(context: Context) {
    launchDeepLink(context, generateHomeUrl())
  }

  /** Navigate to slides screen via deep link for AutoMobile tests */
  fun navigateToSlidesForTest(context: Context, slideIndex: Int = 0) {
    launchDeepLink(context, generateSlidesUrl(slideIndex))
  }

  /** Navigate to video player screen via deep link for AutoMobile tests */
  fun navigateToVideoPlayerForTest(context: Context, videoId: String) {
    launchDeepLink(context, generateVideoPlayerUrl(videoId))
  }

  /** Generic method to launch a deep link intent for testing */
  fun launchDeepLink(context: Context, deepLinkUrl: String) {
    val intent =
        Intent(Intent.ACTION_VIEW, Uri.parse(deepLinkUrl)).apply {
          setPackage(context.packageName)
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
    context.startActivity(intent)
  }

  /** Get all available deep link URLs for testing purposes */
  fun getAllDeepLinks(): List<Pair<String, String>> {
    return listOf(
        "Onboarding" to generateOnboardingUrl(),
        "Login" to generateLoginUrl(),
        "Home" to generateHomeUrl(),
        "Slides (slide 0)" to generateSlidesUrl(0),
        "Slides (slide 3)" to generateSlidesUrl(3),
        "Video Player (sample)" to generateVideoPlayerUrl("sample123"))
  }

  private fun buildUri(path: String): String {
    return Uri.Builder().scheme(SCHEME).authority(HOST).path(path).build().toString()
  }
}
