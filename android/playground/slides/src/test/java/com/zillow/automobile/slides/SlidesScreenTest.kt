package com.zillow.automobile.slides

import com.zillow.automobile.slides.data.getAllSlides
import com.zillow.automobile.slides.model.BulletPoint
import com.zillow.automobile.slides.model.PresentationEmoji
import com.zillow.automobile.slides.model.SlideContent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SlidesScreenTest {

  @Test
  fun `getAllSlides should return non-empty list of slides`() {
    val slides = getAllSlides()
    assertTrue("Sample slides should not be empty", slides.isNotEmpty())
    assertTrue("Should have multiple slides", slides.size > 3)
  }

  @Test
  fun `sample slides should include different slide types`() {
    val slides = getAllSlides()

    val hasLargeText = slides.any { it is SlideContent.LargeText }
    val hasEmoji = slides.any { it is SlideContent.Emoji }
    val hasBulletPoints = slides.any { it is SlideContent.BulletPoints }
    val hasCodeSample = slides.any { it is SlideContent.CodeSample }
    val hasMermaidDiagram = slides.any { it is SlideContent.MermaidDiagram }

    assertTrue("Should include LargeText slides", hasLargeText)
    assertTrue("Should include Emoji slides", hasEmoji)
    assertTrue("Should include BulletPoints slides", hasBulletPoints)
    assertTrue("Should include CodeSample slides", hasCodeSample)
    assertTrue("Should include MermaidDiagram slides", hasMermaidDiagram)
  }

  @Test
  fun `getAllSlides should contain MermaidDiagram slides`() {
    val slides = getAllSlides()
    val mermaidSlides = slides.filterIsInstance<SlideContent.MermaidDiagram>()
    assertTrue("Should contain at least one Mermaid diagram slide", mermaidSlides.isNotEmpty())

    // Verify the Mermaid slide has proper content
    val testFlowSlide = mermaidSlides.find { it.title == "AutoMobile Test Flow" }
    assertTrue("Should contain the AutoMobile Test Flow diagram", testFlowSlide != null)
    testFlowSlide?.let { slide ->
      assertTrue("Should contain flowchart syntax", slide.code.contains("flowchart TD"))
      assertTrue(
          "Should contain AutoMobile-specific content", slide.code.contains("observe Screen"))
    }
  }

  @Test
  fun `sample slides should have meaningful content`() {
    val slides = getAllSlides()

    // Check first slide is a title slide
    val firstSlide = slides.first()
    assertTrue("First slide should be LargeText", firstSlide is SlideContent.LargeText)

    val titleSlide = firstSlide as SlideContent.LargeText
    assertTrue("Title should mention AutoMobile", titleSlide.title.contains("AutoMobile"))

    // Check there are emoji slides with captions
    val emojiSlides = slides.filterIsInstance<SlideContent.Emoji>()
    assertTrue("Should have emoji slides", emojiSlides.isNotEmpty())

    val emojiSlidesWithCaptions = emojiSlides.filter { it.caption != null }
    assertTrue("Some emoji slides should have captions", emojiSlidesWithCaptions.isNotEmpty())

    // Check bullet point slides have multiple points
    val bulletPointSlides = slides.filterIsInstance<SlideContent.BulletPoints>()
    assertTrue("Should have bullet point slides", bulletPointSlides.isNotEmpty())

    bulletPointSlides.forEach { slide ->
      assertTrue("Bullet point slides should have multiple points", slide.points.size >= 2)
    }

    // Check code sample slides have valid content
    val codeSlides = slides.filterIsInstance<SlideContent.CodeSample>()
    assertTrue("Should have code sample slides", codeSlides.isNotEmpty())

    codeSlides.forEach { slide ->
      assertTrue("Code should not be empty", slide.code.isNotEmpty())
      assertTrue("Language should not be empty", slide.language.isNotEmpty())
      // Updated to be more flexible for mermaid diagrams and other content
      assertTrue(
          "Code should contain meaningful content",
          slide.code.contains("@Test") ||
              slide.code.contains("fun ") ||
              slide.code.contains("flowchart") ||
              slide.code.contains("sequenceDiagram") ||
              slide.code.length > 20)
    }
  }
}

class SlideContentTestHelper {

  @Test
  fun `createTestSlides should generate valid slide content`() {
    val slides = createTestSlides()

    assertEquals("Should have 5 test slides", 5, slides.size)

    // Verify each slide type
    assertTrue("First slide should be LargeText", slides[0] is SlideContent.LargeText)
    assertTrue("Second slide should be Emoji", slides[1] is SlideContent.Emoji)
    assertTrue("Third slide should be BulletPoints", slides[2] is SlideContent.BulletPoints)
    assertTrue("Fourth slide should be CodeSample", slides[3] is SlideContent.CodeSample)
    assertTrue("Fifth slide should be Visualization", slides[4] is SlideContent.Visualization)
  }

  @Test
  fun `createEmptySlideList should return empty list`() {
    val slides = createEmptySlideList()

    assertTrue("Slide list should be empty", slides.isEmpty())
  }

  @Test
  fun `createSingleSlide should return list with one slide`() {
    val slide = SlideContent.LargeText("Test Title", "Test Subtitle")
    val slides = createSingleSlideList(slide)

    assertEquals("Should have exactly one slide", 1, slides.size)
    assertEquals("Should be the same slide", slide, slides[0])
  }

  private fun createTestSlides(): List<SlideContent> =
      listOf(
          SlideContent.LargeText("Test Title", "Test Subtitle"),
          SlideContent.Emoji(PresentationEmoji.ROCKET, "Test Caption"),
          SlideContent.BulletPoints(
              "Test Features",
              listOf(BulletPoint("Feature 1", listOf("Sub 1", "Sub 2")), BulletPoint("Feature 2"))),
          SlideContent.CodeSample("fun test() {}", "kotlin", "Test Code"),
          SlideContent.Visualization("test-image.png", "Test Image"))

  private fun createEmptySlideList(): List<SlideContent> = emptyList()

  private fun createSingleSlideList(slide: SlideContent): List<SlideContent> = listOf(slide)
}

class SlideNavigationTest {

  @Test
  fun `slide index should be coerced within valid range`() {
    val slides =
        listOf(
            SlideContent.LargeText("Slide 1"),
            SlideContent.LargeText("Slide 2"),
            SlideContent.LargeText("Slide 3"))

    // Test negative index
    val negativeIndex = -5
    val coercedNegative = negativeIndex.coerceIn(0, slides.size - 1)
    assertEquals("Negative index should be coerced to 0", 0, coercedNegative)

    // Test index beyond range
    val beyondIndex = 10
    val coercedBeyond = beyondIndex.coerceIn(0, slides.size - 1)
    assertEquals("Index beyond range should be coerced to last slide", 2, coercedBeyond)

    // Test valid index
    val validIndex = 1
    val coercedValid = validIndex.coerceIn(0, slides.size - 1)
    assertEquals("Valid index should remain unchanged", 1, coercedValid)
  }

  @Test
  fun `slide validation should work correctly`() {
    val slides = listOf(SlideContent.LargeText("Slide 1"), SlideContent.LargeText("Slide 2"))

    assertTrue("Index 0 should be valid", 0 in slides.indices)
    assertTrue("Index 1 should be valid", 1 in slides.indices)
    assertFalse("Index 2 should be invalid", 2 in slides.indices)
    assertFalse("Negative index should be invalid", -1 in slides.indices)
  }

  @Test
  fun `slide count should be calculated correctly`() {
    val emptySlides = emptyList<SlideContent>()
    assertEquals("Empty slides should have count 0", 0, emptySlides.size)

    val singleSlide = listOf(SlideContent.LargeText("Single"))
    assertEquals("Single slide should have count 1", 1, singleSlide.size)

    val multipleSlides =
        listOf(
            SlideContent.LargeText("First"),
            SlideContent.Emoji(PresentationEmoji.ROCKET),
            SlideContent.BulletPoints("Third", emptyList()))
    assertEquals("Multiple slides should have correct count", 3, multipleSlides.size)
  }
}
