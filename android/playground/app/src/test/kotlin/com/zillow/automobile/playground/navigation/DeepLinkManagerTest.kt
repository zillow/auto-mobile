package com.zillow.automobile.playground.navigation

import android.net.Uri
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DeepLinkManagerTest {

  @Test
  fun testGenerateOnboardingUrl() {
    val url = DeepLinkManager.generateOnboardingUrl()
    assertEquals("automobile://playground/onboarding", url)
  }

  @Test
  fun testGenerateLoginUrl() {
    val url = DeepLinkManager.generateLoginUrl()
    assertEquals("automobile://playground/login", url)
  }

  @Test
  fun testGenerateHomeUrl() {
    val url = DeepLinkManager.generateHomeUrl()
    assertEquals("automobile://playground/home", url)
  }

  @Test
  fun testGenerateVideoPlayerUrl() {
    val url = DeepLinkManager.generateVideoPlayerUrl("test123")
    assertEquals("automobile://playground/video_player/test123", url)
  }

  @Test
  fun testParseValidOnboardingDeepLink() {
    val uri = Uri.parse("automobile://playground/onboarding")
    val destination = DeepLinkManager.parseDeepLink(uri)
    assertEquals(OnboardingDestination, destination)
  }

  @Test
  fun testParseValidLoginDeepLink() {
    val uri = Uri.parse("automobile://playground/login")
    val destination = DeepLinkManager.parseDeepLink(uri)
    assertEquals(LoginDestination, destination)
  }

  @Test
  fun testParseValidHomeDeepLink() {
    val uri = Uri.parse("automobile://playground/home")
    val destination = DeepLinkManager.parseDeepLink(uri)
    assertEquals(HomeDestination(), destination)
  }

  @Test
  fun testParseValidVideoPlayerDeepLink() {
    val uri = Uri.parse("automobile://playground/video_player/sample123")
    val destination = DeepLinkManager.parseDeepLink(uri)
    assertEquals(VideoPlayerDestination("sample123"), destination)
  }

  @Test
  fun testParseDeepLinkVideoPlayer() {
    val uri = Uri.parse("automobile://playground/video_player/sample123")
    val destination = DeepLinkManager.parseDeepLink(uri)
    assertEquals(VideoPlayerDestination("sample123"), destination)
  }

  @Test
  fun testParseDeepLinkSettings() {
    val uri = Uri.parse("automobile://playground/settings")
    val destination = DeepLinkManager.parseDeepLink(uri)
    assertEquals(SettingsDestination, destination)
  }

  @Test
  fun testParseValidSlidesDeepLink() {
    val uri = Uri.parse("automobile://playground/slides/5")
    val destination = DeepLinkManager.parseDeepLink(uri)
    assertEquals(SlidesDestination(5), destination)
  }

  @Test
  fun testParseInvalidScheme() {
    val uri = Uri.parse("https://playground/onboarding")
    val destination = DeepLinkManager.parseDeepLink(uri)
    assertNull(destination)
  }

  @Test
  fun testParseInvalidHost() {
    val uri = Uri.parse("automobile://wronghost/onboarding")
    val destination = DeepLinkManager.parseDeepLink(uri)
    assertNull(destination)
  }

  @Test
  fun testParseInvalidPath() {
    val uri = Uri.parse("automobile://playground/unknown")
    val destination = DeepLinkManager.parseDeepLink(uri)
    assertNull(destination)
  }

  @Test
  fun testParseVideoPlayerWithoutId() {
    val uri = Uri.parse("automobile://playground/video_player/")
    val destination = DeepLinkManager.parseDeepLink(uri)
    assertNull(destination)
  }

  @Test
  fun testIsValidDeepLink() {
    val validUri = Uri.parse("automobile://playground/home")
    assertTrue(DeepLinkManager.isValidDeepLink(validUri))

    val invalidUri = Uri.parse("https://google.com")
    assertFalse(DeepLinkManager.isValidDeepLink(invalidUri))
  }

  @Test
  fun testGetDestinationName() {
    val onboardingUri = Uri.parse("automobile://playground/onboarding")
    assertEquals("Onboarding", DeepLinkManager.getDestinationName(onboardingUri))

    val loginUri = Uri.parse("automobile://playground/login")
    assertEquals("Login", DeepLinkManager.getDestinationName(loginUri))

    val homeUri = Uri.parse("automobile://playground/home")
    assertEquals("Home", DeepLinkManager.getDestinationName(homeUri))

    val videoPlayerUri = Uri.parse("automobile://playground/video_player/sample123")
    assertEquals("Video Player", DeepLinkManager.getDestinationName(videoPlayerUri))

    val settingsUri = Uri.parse("automobile://playground/settings")
    assertEquals("Settings", DeepLinkManager.getDestinationName(settingsUri))

    val invalidUri = Uri.parse("https://invalid.com")
    assertNull(DeepLinkManager.getDestinationName(invalidUri))
  }

  @Test
  fun testGetAllDeepLinks() {
    val allLinks = DeepLinkManager.getAllDeepLinks()
    assertEquals(6, allLinks.size)

    val linkUrls = allLinks.map { it.second }
    assertTrue(linkUrls.contains("automobile://playground/onboarding"))
    assertTrue(linkUrls.contains("automobile://playground/login"))
    assertTrue(linkUrls.contains("automobile://playground/home"))
    assertTrue(linkUrls.contains("automobile://playground/video_player/sample123"))
    assertTrue(linkUrls.contains("automobile://playground/slides/0"))
    assertTrue(linkUrls.contains("automobile://playground/slides/3"))
  }
}
