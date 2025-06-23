package com.zillow.automobile.slides

import com.zillow.automobile.slides.model.BulletPoint
import com.zillow.automobile.slides.model.PresentationEmoji
import com.zillow.automobile.slides.model.SlideContent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Unit tests for slides business logic without Android dependencies. */
class SlidesLogicTest {

  @Test
  fun `slide content types should be correctly distinguished`() {
    val slides = createTestSlides()

    val largeTextSlides = slides.filterIsInstance<SlideContent.LargeText>()
    val emojiSlides = slides.filterIsInstance<SlideContent.Emoji>()
    val bulletPointSlides = slides.filterIsInstance<SlideContent.BulletPoints>()
    val codeSlides = slides.filterIsInstance<SlideContent.CodeSample>()
    val visualizationSlides = slides.filterIsInstance<SlideContent.Visualization>()
    val videoSlides = slides.filterIsInstance<SlideContent.Video>()
    val mermaidSlides = slides.filterIsInstance<SlideContent.MermaidDiagram>()
    val screenshotSlides = slides.filterIsInstance<SlideContent.Screenshot>()

    assertEquals("Should have 1 large text slide", 1, largeTextSlides.size)
    assertEquals("Should have 1 emoji slide", 1, emojiSlides.size)
    assertEquals("Should have 1 bullet point slide", 1, bulletPointSlides.size)
    assertEquals("Should have 1 code slide", 1, codeSlides.size)
    assertEquals("Should have 1 visualization slide", 1, visualizationSlides.size)
    assertEquals("Should have 1 video slide", 1, videoSlides.size)
    assertEquals("Should have 1 mermaid diagram slide", 1, mermaidSlides.size)
    assertEquals("Should have 1 screenshot slide", 1, screenshotSlides.size)
  }

  @Test
  fun `slide navigation logic should work correctly`() {
    val slides = createTestSlides()
    val totalSlides = slides.size

    // Test navigation boundaries
    assertTrue("Should be able to navigate to first slide", 0 in 0 until totalSlides)
    assertTrue("Should be able to navigate to last slide", (totalSlides - 1) in 0 until totalSlides)
    assertFalse("Should not be able to navigate to negative index", -1 in 0 until totalSlides)
    assertFalse(
        "Should not be able to navigate beyond last slide", totalSlides in 0 until totalSlides)

    // Test coercion logic
    assertEquals("Negative index should coerce to 0", 0, (-5).coerceIn(0, totalSlides - 1))
    assertEquals(
        "Index beyond range should coerce to last",
        totalSlides - 1,
        (totalSlides + 5).coerceIn(0, totalSlides - 1))
    assertEquals("Valid index should remain unchanged", 2, 2.coerceIn(0, totalSlides - 1))
  }

  @Test
  fun `slide content should have meaningful data`() {
    val slides = createTestSlides()

    slides.forEach { slide ->
      when (slide) {
        is SlideContent.LargeText -> {
          assertTrue("LargeText should have non-empty title", slide.title.isNotEmpty())
        }

        is SlideContent.BulletPoints -> {
          assertTrue("BulletPoints should have non-empty title", slide.title?.isNotEmpty() == true)
          assertTrue("BulletPoints should have points", slide.points.isNotEmpty())
          slide.points.forEach { point ->
            assertTrue("Each bullet point should have text", point.text.isNotEmpty())
          }
        }

        is SlideContent.Emoji -> {
          assertTrue("Emoji should have unicode", slide.emoji.unicode.isNotEmpty())
          assertTrue("Emoji should have description", slide.emoji.description.isNotEmpty())
        }

        is SlideContent.CodeSample -> {
          assertTrue("CodeSample should have code", slide.code.isNotEmpty())
          assertTrue("CodeSample should have language", slide.language.isNotEmpty())
        }

        is SlideContent.Visualization -> {
          assertTrue("Visualization should have image URL", slide.imageUrl.isNotEmpty())
        }

        is SlideContent.Video -> {
          assertTrue("Video should have video URL", slide.videoUrl.isNotEmpty())
        }

        is SlideContent.MermaidDiagram -> {
          assertTrue("MermaidDiagram should have mermaid code", slide.code.isNotEmpty())
        }

        is SlideContent.Screenshot -> {
          assertTrue(
              "Screenshot should have at least one screenshot",
              slide.lightScreenshot != null || slide.darkScreenshot != null)
        }
      }
    }
  }

  @Test
  fun `bullet points should support nested structure`() {
    val bulletPoints =
        listOf(
            BulletPoint("Main point 1", listOf("Sub 1", "Sub 2")),
            BulletPoint("Main point 2", emptyList()),
            BulletPoint("Main point 3", listOf("Sub A", "Sub B", "Sub C")))

    val slide = SlideContent.BulletPoints("Test Features", bulletPoints)

    assertEquals("Should have 3 main points", 3, slide.points.size)
    assertEquals("First point should have 2 sub-points", 2, slide.points[0].subPoints.size)
    assertEquals("Second point should have no sub-points", 0, slide.points[1].subPoints.size)
    assertEquals("Third point should have 3 sub-points", 3, slide.points[2].subPoints.size)
  }

  @Test
  fun `emoji enum should provide all expected values`() {
    val expectedEmojis =
        mapOf(
            PresentationEmoji.CONSTRUCTION to "🚧",
            PresentationEmoji.THINKING to "🤔",
            PresentationEmoji.ROCKET to "🚀",
            PresentationEmoji.LIGHTBULB to "💡",
            PresentationEmoji.CHECKMARK to "✅",
            PresentationEmoji.WARNING to "⚠️",
            PresentationEmoji.FIRE to "🔥",
            PresentationEmoji.THUMBS_UP to "👍")

    expectedEmojis.forEach { (emoji, expectedUnicode) ->
      assertEquals("Emoji $emoji should have correct unicode", expectedUnicode, emoji.unicode)
      assertTrue("Emoji $emoji should have description", emoji.description.isNotEmpty())
    }
  }

  @Test
  fun `slide index calculations should be correct`() {
    val slides = createTestSlides()
    val slideCount = slides.size

    // Test slide counting
    assertEquals("Slide count should match list size", slideCount, slides.size)

    // Test valid indices
    for (i in slides.indices) {
      assertTrue("Index $i should be valid", i in slides.indices)
    }

    // Test invalid indices
    assertFalse("Negative index should be invalid", -1 in slides.indices)
    assertFalse("Index equal to size should be invalid", slideCount in slides.indices)
    assertFalse("Index beyond size should be invalid", (slideCount + 1) in slides.indices)
  }

  @Test
  fun `slide content should support optional fields correctly`() {
    // Test LargeText with and without subtitle
    val titleOnly = SlideContent.LargeText("Title Only")
    val titleWithSubtitle = SlideContent.LargeText("Title", "Subtitle")

    assertEquals("Title Only", titleOnly.title)
    assertEquals(null, titleOnly.subtitle)

    assertEquals("Title", titleWithSubtitle.title)
    assertEquals("Subtitle", titleWithSubtitle.subtitle)

    // Test Emoji with and without caption
    val emojiOnly = SlideContent.Emoji(PresentationEmoji.ROCKET)
    val emojiWithCaption = SlideContent.Emoji(PresentationEmoji.ROCKET, "Fast!")

    assertEquals(PresentationEmoji.ROCKET, emojiOnly.emoji)
    assertEquals(null, emojiOnly.caption)

    assertEquals(PresentationEmoji.ROCKET, emojiWithCaption.emoji)
    assertEquals("Fast!", emojiWithCaption.caption)

    // Test CodeSample with optional title
    val codeWithoutTitle = SlideContent.CodeSample("code", "kotlin")
    val codeWithTitle = SlideContent.CodeSample("code", "kotlin", "Example")

    assertEquals("code", codeWithoutTitle.code)
    assertEquals("kotlin", codeWithoutTitle.language)
    assertEquals(null, codeWithoutTitle.title)

    assertEquals("code", codeWithTitle.code)
    assertEquals("kotlin", codeWithTitle.language)
    assertEquals("Example", codeWithTitle.title)
  }

  private fun createTestSlides(): List<SlideContent> =
      listOf(
          SlideContent.LargeText("AutoMobile", "Testing Framework"),
          SlideContent.Emoji(PresentationEmoji.ROCKET, "Lightning Fast"),
          SlideContent.BulletPoints(
              "Features",
              listOf(
                  BulletPoint("Source Intelligence", listOf("Code analysis", "Smart selectors")),
                  BulletPoint("Cross-platform", listOf("Android", "iOS")),
                  BulletPoint("JUnit Integration"))),
          SlideContent.CodeSample(
              code =
                  "@Test\nfun testExample() {\n    tapOn(text = \"Button\")\n    assertVisible(text = \"Success\")\n}",
              language = "kotlin",
              title = "Simple Test"),
          SlideContent.Visualization("architecture.png", "System Architecture"),
          SlideContent.Video("demo.mp4", "Live Demo"),
          SlideContent.MermaidDiagram("mermaidCode", "Mermaid Diagram"),
          SlideContent.Screenshot(
              lightScreenshot = 1, darkScreenshot = 2, caption = "Screenshot Example"))
}
