package com.zillow.automobile.playground.navigation

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log

/**
 * Utility class for managing deep link URLs within the AutoMobile Playground app. Provides methods
 * for generating and parsing deep link URLs for navigation.
 */
object DeepLinkManager {

  private const val TAG = "DeepLinkManager"

  // Base deep link scheme and host
  private const val SCHEME = "automobile"
  private const val HOST = "playground"

  // Deep link paths for different destinations
  private const val PATH_ONBOARDING = "/onboarding"
  private const val PATH_LOGIN = "/login"
  private const val PATH_HOME = "/home"
  private const val PATH_MEDIA = "/media"
  private const val PATH_TAP = "/tap"
  private const val PATH_SWIPE = "/swipe"
  private const val PATH_TEXT = "/text"
  private const val PATH_CHAT = "/chat"
  private const val PATH_VIDEO = "/video"
  private const val PATH_SLIDES = "/slides"
  private const val PATH_VIDEO_PLAYER = "/video_player"
  private const val PATH_SETTINGS = "/settings"

  /** Generate deep link URL for onboarding screen */
  fun generateOnboardingUrl(): String {
    val url = buildUri(PATH_ONBOARDING)
    Log.d(TAG, "Generated onboarding URL: $url")
    return url
  }

  /** Generate deep link URL for login screen */
  fun generateLoginUrl(): String {
    val url = buildUri(PATH_LOGIN)
    Log.d(TAG, "Generated login URL: $url")
    return url
  }

  /** Generate deep link URL for home screen */
  fun generateHomeUrl(): String {
    val url = buildUri(PATH_HOME)
    Log.d(TAG, "Generated home URL: $url")
    return url
  }

  /** Generate deep link URL for media/discover screen */
  fun generateMediaUrl(): String {
    val url = buildUri(PATH_MEDIA)
    Log.d(TAG, "Generated media URL: $url")
    return url
  }

  /** Generate deep link URL for tap screen (discover tab) */
  fun generateTapUrl(): String {
    val url = buildUri(PATH_TAP)
    Log.d(TAG, "Generated tap URL: $url")
    return url
  }

  /** Generate deep link URL for swipe screen (discover tab) */
  fun generateSwipeUrl(): String {
    val url = buildUri(PATH_SWIPE)
    Log.d(TAG, "Generated swipe URL: $url")
    return url
  }

  /** Generate deep link URL for text screen (discover tab) */
  fun generateTextUrl(): String {
    val url = buildUri(PATH_TEXT)
    Log.d(TAG, "Generated text URL: $url")
    return url
  }

  /** Generate deep link URL for chat screen (discover tab) */
  fun generateChatUrl(): String {
    val url = buildUri(PATH_CHAT)
    Log.d(TAG, "Generated chat URL: $url")
    return url
  }

  /** Generate deep link URL for video screen (discover tab) - alias for media */
  fun generateVideoUrl(): String {
    val url = buildUri(PATH_VIDEO)
    Log.d(TAG, "Generated video URL: $url")
    return url
  }

  /** Generate deep link URL for slides screen */
  fun generateSlidesUrl(slideIndex: Int = 0): String {
    val url = buildUri("$PATH_SLIDES/$slideIndex")
    Log.d(TAG, "Generated slides URL with slideIndex $slideIndex: $url")
    return url
  }

  /** Generate deep link URL for video player screen */
  fun generateVideoPlayerUrl(videoId: String): String {
    val url = buildUri("$PATH_VIDEO_PLAYER/$videoId")
    Log.d(TAG, "Generated video player URL with videoId '$videoId': $url")
    return url
  }

  /** Generate deep link URL for settings screen */
  fun generateSettingsUrl(): String {
    val url = buildUri(PATH_SETTINGS)
    Log.d(TAG, "Generated settings URL: $url")
    return url
  }

  /** Parse deep link URL and return the corresponding navigation destination */
  fun parseDeepLink(uri: Uri): AppDestination? {
    Log.d(TAG, "Parsing deep link URI: $uri")
    Log.d(TAG, "URI scheme: ${uri.scheme}, host: ${uri.host}, path: ${uri.path}")

    if (uri.scheme != SCHEME || uri.host != HOST) {
      Log.d(TAG, "Invalid scheme or host. Expected: $SCHEME://$HOST")
      return null
    }

    val path = uri.path
    if (path == null) {
      Log.d(TAG, "URI path is null")
      return null
    }

    val destination =
        when {
          path == PATH_ONBOARDING -> {
            Log.d(TAG, "Parsed as OnboardingDestination")
            OnboardingDestination
          }

          path == PATH_LOGIN -> {
            Log.d(TAG, "Parsed as LoginDestination")
            LoginDestination
          }

          path == PATH_HOME || path.isEmpty() -> {
            Log.d(TAG, "Parsed as HomeDestination with default tab (path: '$path')")
            HomeDestination(selectedTab = 0)
          }

          path == PATH_MEDIA -> {
            Log.d(TAG, "Parsed as HomeDestination with media/discover tab selected")
            HomeDestination(selectedTab = 0, selectedSubTab = 2) // Media sub-tab is index 2
          }

          path == PATH_TAP -> {
            Log.d(TAG, "Parsed as HomeDestination with tap sub-tab selected")
            HomeDestination(selectedTab = 0, selectedSubTab = 0) // Tap sub-tab is index 0
          }

          path == PATH_SWIPE -> {
            Log.d(TAG, "Parsed as HomeDestination with swipe sub-tab selected")
            HomeDestination(selectedTab = 0, selectedSubTab = 1) // Swipe sub-tab is index 1
          }

          path == PATH_TEXT -> {
            Log.d(TAG, "Parsed as HomeDestination with text sub-tab selected")
            HomeDestination(selectedTab = 0, selectedSubTab = 3) // Text sub-tab is index 3
          }

          path == PATH_CHAT -> {
            Log.d(TAG, "Parsed as HomeDestination with chat sub-tab selected")
            HomeDestination(selectedTab = 0, selectedSubTab = 4) // Chat sub-tab is index 4
          }

          path == PATH_VIDEO -> {
            Log.d(TAG, "Parsed as HomeDestination with video sub-tab selected (alias for media)")
            HomeDestination(selectedTab = 0, selectedSubTab = 2) // Video is same as Media sub-tab
          }

          path.startsWith(PATH_SLIDES) -> {
            val slideIndex = path.substringAfterLast("/").toIntOrNull()?.takeIf { it >= 0 } ?: 0
            Log.d(TAG, "Parsed as SlidesDestination with slideIndex: $slideIndex")
            SlidesDestination(slideIndex)
          }
          path.startsWith(PATH_VIDEO_PLAYER) -> {
            val videoId = path.substringAfterLast("/")
            if (videoId.isNotEmpty()) {
              Log.d(TAG, "Parsed as VideoPlayerDestination with videoId: '$videoId'")
              VideoPlayerDestination(videoId)
            } else {
              Log.d(TAG, "Empty videoId for video player path")
              null
            }
          }
          path == PATH_SETTINGS -> {
            Log.d(TAG, "Parsed as SettingsDestination")
            SettingsDestination
          }
          else -> {
            Log.d(TAG, "No matching destination for path: $path")
            null
          }
        }

    Log.d(TAG, "Final parsed destination: $destination")
    return destination
  }

  /** Validate if a URI is a valid deep link for this app */
  fun isValidDeepLink(uri: Uri): Boolean {
    Log.d(TAG, "Validating deep link: $uri")
    val isValid = uri.scheme == SCHEME && uri.host == HOST && parseDeepLink(uri) != null
    Log.d(TAG, "Deep link validation result: $isValid")
    return isValid
  }

  /** Get the destination name from a deep link URI */
  fun getDestinationName(uri: Uri): String? {
    Log.d(TAG, "Getting destination name for URI: $uri")

    if (!isValidDeepLink(uri)) {
      Log.d(TAG, "Invalid deep link, returning null destination name")
      return null
    }

    val path = uri.path
    if (path == null) {
      Log.d(TAG, "URI path is null, returning null destination name")
      return null
    }

    val destinationName =
        when {
          path == PATH_ONBOARDING -> "Onboarding"
          path == PATH_LOGIN -> "Login"
          path == PATH_HOME || path.isEmpty() -> "Home"
          path == PATH_MEDIA -> "Media"
          path == PATH_TAP -> "Tap"
          path == PATH_SWIPE -> "Swipe"
          path == PATH_TEXT -> "Text"
          path == PATH_CHAT -> "Chat"
          path == PATH_VIDEO -> "Video"
          path.startsWith(PATH_SLIDES) -> "Slides"
          path.startsWith(PATH_VIDEO_PLAYER) -> "Video Player"
          path == PATH_SETTINGS -> "Settings"
          else -> null
        }

    Log.d(TAG, "Destination name: $destinationName")
    return destinationName
  }

  // AutoMobile test integration methods

  /** Navigate to onboarding screen via deep link for AutoMobile tests */
  fun navigateToOnboardingForTest(context: Context) {
    Log.d(TAG, "Navigating to onboarding for test")
    launchDeepLink(context, generateOnboardingUrl())
  }

  /** Navigate to login screen via deep link for AutoMobile tests */
  fun navigateToLoginForTest(context: Context) {
    Log.d(TAG, "Navigating to login for test")
    launchDeepLink(context, generateLoginUrl())
  }

  /** Navigate to home screen via deep link for AutoMobile tests */
  fun navigateToHomeForTest(context: Context) {
    Log.d(TAG, "Navigating to home for test")
    launchDeepLink(context, generateHomeUrl())
  }

  /** Navigate to media/discover screen via deep link for AutoMobile tests */
  fun navigateToMediaForTest(context: Context) {
    Log.d(TAG, "Navigating to media for test")
    launchDeepLink(context, generateMediaUrl())
  }

  /** Navigate to tap screen (discover tab) via deep link for AutoMobile tests */
  fun navigateToTapForTest(context: Context) {
    Log.d(TAG, "Navigating to tap for test")
    launchDeepLink(context, generateTapUrl())
  }

  /** Navigate to swipe screen (discover tab) via deep link for AutoMobile tests */
  fun navigateToSwipeForTest(context: Context) {
    Log.d(TAG, "Navigating to swipe for test")
    launchDeepLink(context, generateSwipeUrl())
  }

  /** Navigate to text screen (discover tab) via deep link for AutoMobile tests */
  fun navigateToTextForTest(context: Context) {
    Log.d(TAG, "Navigating to text for test")
    launchDeepLink(context, generateTextUrl())
  }

  /** Navigate to chat screen (discover tab) via deep link for AutoMobile tests */
  fun navigateToChatForTest(context: Context) {
    Log.d(TAG, "Navigating to chat for test")
    launchDeepLink(context, generateChatUrl())
  }

  /** Navigate to video screen (discover tab) via deep link for AutoMobile tests */
  fun navigateToVideoForTest(context: Context) {
    Log.d(TAG, "Navigating to video for test")
    launchDeepLink(context, generateVideoUrl())
  }

  /** Navigate to slides screen via deep link for AutoMobile tests */
  fun navigateToSlidesForTest(context: Context, slideIndex: Int = 0) {
    Log.d(TAG, "Navigating to slides for test with slideIndex: $slideIndex")
    launchDeepLink(context, generateSlidesUrl(slideIndex))
  }

  /** Navigate to video player screen via deep link for AutoMobile tests */
  fun navigateToVideoPlayerForTest(context: Context, videoId: String) {
    Log.d(TAG, "Navigating to video player for test with videoId: '$videoId'")
    launchDeepLink(context, generateVideoPlayerUrl(videoId))
  }

  /** Navigate to settings screen via deep link for AutoMobile tests */
  fun navigateToSettingsForTest(context: Context) {
    Log.d(TAG, "Navigating to settings for test")
    launchDeepLink(context, generateSettingsUrl())
  }

  /** Generic method to launch a deep link intent for testing */
  fun launchDeepLink(context: Context, deepLinkUrl: String) {
    Log.d(TAG, "Launching deep link: $deepLinkUrl")
    Log.d(TAG, "Context package name: ${context.packageName}")

    val intent =
        Intent(Intent.ACTION_VIEW, Uri.parse(deepLinkUrl)).apply {
          setPackage(context.packageName)
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }

    Log.d(TAG, "Intent created with flags: ${intent.flags}")
    Log.d(TAG, "Starting activity with intent")

    try {
      context.startActivity(intent)
      Log.d(TAG, "Successfully started activity for deep link")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to start activity for deep link", e)
    }
  }

  /** Get all available deep link URLs for testing purposes */
  fun getAllDeepLinks(): List<Pair<String, String>> {
    Log.d(TAG, "Getting all available deep links")
    val deepLinks =
        listOf(
            "Onboarding" to generateOnboardingUrl(),
            "Login" to generateLoginUrl(),
            "Home" to generateHomeUrl(),
            "Media" to generateMediaUrl(),
            "Tap" to generateTapUrl(),
            "Swipe" to generateSwipeUrl(),
            "Text" to generateTextUrl(),
            "Chat" to generateChatUrl(),
            "Video" to generateVideoUrl(),
            "Slides (slide 0)" to generateSlidesUrl(0),
            "Slides (slide 3)" to generateSlidesUrl(3),
            "Video Player (sample)" to generateVideoPlayerUrl("sample123"),
            "Settings" to generateSettingsUrl())
    Log.d(TAG, "Generated ${deepLinks.size} deep links")
    return deepLinks
  }

  private fun buildUri(path: String): String {
    val uri = Uri.Builder().scheme(SCHEME).authority(HOST).path(path).build().toString()
    Log.d(TAG, "Built URI with path '$path': $uri")
    return uri
  }
}
