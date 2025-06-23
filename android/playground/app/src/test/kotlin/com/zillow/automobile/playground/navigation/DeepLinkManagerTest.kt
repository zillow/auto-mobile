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
    val route = DeepLinkManager.parseDeepLink(uri)
    assertEquals(OnboardingDestination.route, route)
  }

  @Test
  fun testParseValidLoginDeepLink() {
    val uri = Uri.parse("automobile://playground/login")
    val route = DeepLinkManager.parseDeepLink(uri)
    assertEquals(LoginDestination.route, route)
  }

  @Test
  fun testParseValidHomeDeepLink() {
    val uri = Uri.parse("automobile://playground/home")
    val route = DeepLinkManager.parseDeepLink(uri)
    assertEquals(HomeDestination.route, route)
  }

  @Test
  fun testParseValidVideoPlayerDeepLink() {
    val uri = Uri.parse("automobile://playground/video_player/sample123")
    val route = DeepLinkManager.parseDeepLink(uri)
    assertEquals(VideoPlayerDestination.createRoute("sample123"), route)
  }

  @Test
  fun testParseInvalidScheme() {
    val uri = Uri.parse("https://playground/onboarding")
    val route = DeepLinkManager.parseDeepLink(uri)
    assertNull(route)
  }

  @Test
  fun testParseInvalidHost() {
    val uri = Uri.parse("automobile://wronghost/onboarding")
    val route = DeepLinkManager.parseDeepLink(uri)
    assertNull(route)
  }

  @Test
  fun testParseInvalidPath() {
    val uri = Uri.parse("automobile://playground/unknown")
    val route = DeepLinkManager.parseDeepLink(uri)
    assertNull(route)
  }

  @Test
  fun testParseVideoPlayerWithoutId() {
    val uri = Uri.parse("automobile://playground/video_player/")
    val route = DeepLinkManager.parseDeepLink(uri)
    assertNull(route)
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

      val videoPlayerUri = Uri.parse("automobile://playground/video_player/test123")
      assertEquals("Video Player", DeepLinkManager.getDestinationName(videoPlayerUri))

      val invalidUri = Uri.parse("https://google.com")
      assertNull(DeepLinkManager.getDestinationName(invalidUri))
    }

  @Test
  fun testGetAllDeepLinks() {
    val allLinks = DeepLinkManager.getAllDeepLinks()
    assertEquals(4, allLinks.size)

    val linkUrls = allLinks.map { it.second }
    assertTrue(linkUrls.contains("automobile://playground/onboarding"))
    assertTrue(linkUrls.contains("automobile://playground/login"))
    assertTrue(linkUrls.contains("automobile://playground/home"))
    assertTrue(linkUrls.contains("automobile://playground/video_player/sample123"))
  }
}
