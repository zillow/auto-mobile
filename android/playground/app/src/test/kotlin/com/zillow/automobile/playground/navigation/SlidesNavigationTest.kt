package com.zillow.automobile.playground.navigation

import android.net.Uri
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SlidesNavigationTest {

  @Test
  fun `SlidesDestination should create correct routes`() {
    assertEquals("slides/0", SlidesDestination.createRoute(0))
    assertEquals("slides/5", SlidesDestination.createRoute(5))
    assertEquals("slides/10", SlidesDestination.createRoute(10))
    assertEquals("slides/0", SlidesDestination.createRoute()) // Default value
  }

  @Test
  fun `SlidesDestination should create correct deep links`() {
    assertEquals("automobile://playground/slides/0", SlidesDestination.createDeepLink(0))
    assertEquals("automobile://playground/slides/3", SlidesDestination.createDeepLink(3))
    assertEquals(
      "automobile://playground/slides/0",
      SlidesDestination.createDeepLink()
    ) // Default value
  }

  @Test
  fun `SlidesDestination should have correct route properties`() {
    assertEquals("slides/{slideIndex}", SlidesDestination.route)
    assertEquals("slides/{slideIndex}", SlidesDestination.routeWithArgs)
    assertEquals("slides", SlidesDestination.routeBase)
    assertEquals("automobile://playground/slides/{slideIndex}", SlidesDestination.deepLinkPattern)
  }

  @Test
  fun `DeepLinkManager should generate slides URLs correctly`() {
    assertEquals("automobile://playground/slides/0", DeepLinkManager.generateSlidesUrl())
    assertEquals("automobile://playground/slides/1", DeepLinkManager.generateSlidesUrl(1))
    assertEquals("automobile://playground/slides/42", DeepLinkManager.generateSlidesUrl(42))
  }

  @Test
  fun `DeepLinkManager should parse slides deep links correctly`() {
    val slideUri0 = Uri.parse("automobile://playground/slides/0")
    val slideUri5 = Uri.parse("automobile://playground/slides/5")
    val slideUriInvalid = Uri.parse("automobile://playground/slides/invalid")

    assertEquals("slides/0", DeepLinkManager.parseDeepLink(slideUri0))
    assertEquals("slides/5", DeepLinkManager.parseDeepLink(slideUri5))
    assertEquals(
      "slides/0",
      DeepLinkManager.parseDeepLink(slideUriInvalid)
    ) // Invalid index defaults to 0
  }

  @Test
  fun `DeepLinkManager should validate slides deep links correctly`() {
    val validSlideUri = Uri.parse("automobile://playground/slides/3")
    val invalidSchemeUri = Uri.parse("http://playground/slides/3")
    val invalidHostUri = Uri.parse("automobile://other/slides/3")
    val invalidPathUri = Uri.parse("automobile://playground/other/3")

    assertTrue("Valid slide URI should be valid", DeepLinkManager.isValidDeepLink(validSlideUri))
    assertTrue(
      "Invalid scheme should be invalid",
      !DeepLinkManager.isValidDeepLink(invalidSchemeUri)
    )
    assertTrue("Invalid host should be invalid", !DeepLinkManager.isValidDeepLink(invalidHostUri))
    assertTrue("Invalid path should be invalid", !DeepLinkManager.isValidDeepLink(invalidPathUri))
  }

  @Test
  fun `DeepLinkManager should get correct destination name for slides`() {
    val slideUri = Uri.parse("automobile://playground/slides/2")
    val invalidUri = Uri.parse("invalid://uri")

    assertEquals("Slides", DeepLinkManager.getDestinationName(slideUri))
    assertNull("Invalid URI should return null", DeepLinkManager.getDestinationName(invalidUri))
  }

  @Test
  fun `DeepLinkManager should include slides in all deep links`() {
    val allDeepLinks = DeepLinkManager.getAllDeepLinks()

    assertTrue("Should include slides deep links", allDeepLinks.size >= 6)

    val slidesLinks = allDeepLinks.filter { it.first.contains("Slides") }
    assertTrue("Should have multiple slides links", slidesLinks.size >= 2)

    // Check specific slides links exist
    val slide0Link = slidesLinks.find { it.first.contains("slide 0") }
    val slide3Link = slidesLinks.find { it.first.contains("slide 3") }

    assertNotNull("Should have slide 0 link", slide0Link)
    assertNotNull("Should have slide 3 link", slide3Link)

    assertEquals("automobile://playground/slides/0", slide0Link?.second)
    assertEquals("automobile://playground/slides/3", slide3Link?.second)
  }

  @Test
  fun `DeepLinkManager should navigate to slides for testing`() {
    // This test verifies the method signature and URL generation
    // Actual navigation would require Android Context

    val expectedUrl0 = "automobile://playground/slides/0"
    val expectedUrl5 = "automobile://playground/slides/5"

    assertEquals(expectedUrl0, DeepLinkManager.generateSlidesUrl(0))
    assertEquals(expectedUrl5, DeepLinkManager.generateSlidesUrl(5))
  }

  @Test
  fun `Slides navigation should handle edge cases`() {
    // Test negative slide index
    val negativeIndexUri = Uri.parse("automobile://playground/slides/-1")
    val parsedNegative = DeepLinkManager.parseDeepLink(negativeIndexUri)
    assertEquals("slides/0", parsedNegative) // Should default to 0

    // Test very large slide index
    val largeIndexUri = Uri.parse("automobile://playground/slides/999999")
    val parsedLarge = DeepLinkManager.parseDeepLink(largeIndexUri)
    assertEquals("slides/999999", parsedLarge) // Should preserve the number

    // Test missing slide index
    val missingIndexUri = Uri.parse("automobile://playground/slides/")
    val parsedMissing = DeepLinkManager.parseDeepLink(missingIndexUri)
    assertEquals("slides/0", parsedMissing) // Should default to 0
  }

  @Test
  fun `Slides destination creation should handle boundary values`() {
    // Test minimum values
    assertEquals("slides/0", SlidesDestination.createRoute(0))
    assertEquals("automobile://playground/slides/0", SlidesDestination.createDeepLink(0))

    // Test reasonable maximum values
    assertEquals("slides/100", SlidesDestination.createRoute(100))
    assertEquals("automobile://playground/slides/100", SlidesDestination.createDeepLink(100))

    // Test default parameter behavior
    assertEquals("slides/0", SlidesDestination.createRoute())
    assertEquals("automobile://playground/slides/0", SlidesDestination.createDeepLink())
  }
}
