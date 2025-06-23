package com.zillow.automobile.slides.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class SlideContentTest {

  @Test
  fun `LargeText slide content should store title and subtitle correctly`() {
    val title = "Welcome to AutoMobile"
    val subtitle = "The Future of Testing"

    val slideContent = SlideContent.LargeText(title, subtitle)

    assertEquals(title, slideContent.title)
    assertEquals(subtitle, slideContent.subtitle)
  }

  @Test
  fun `LargeText slide content should handle null subtitle`() {
    val title = "AutoMobile"

    val slideContent = SlideContent.LargeText(title)

    assertEquals(title, slideContent.title)
    assertEquals(null, slideContent.subtitle)
  }

  @Test
  fun `BulletPoints slide content should store title and points correctly`() {
    val title = "Features"
    val points =
        listOf(
            BulletPoint("Feature 1", listOf("Sub-point 1", "Sub-point 2")),
            BulletPoint("Feature 2"))

    val slideContent = SlideContent.BulletPoints(title, points)

    assertEquals(title, slideContent.title)
    assertEquals(points, slideContent.points)
    assertEquals(2, slideContent.points.size)
  }

  @Test
  fun `Emoji slide content should store emoji and caption correctly`() {
    val emoji = PresentationEmoji.ROCKET
    val caption = "Fast and reliable"

    val slideContent = SlideContent.Emoji(emoji, caption)

    assertEquals(emoji, slideContent.emoji)
    assertEquals(caption, slideContent.caption)
  }

  @Test
  fun `CodeSample slide content should store code, language and title correctly`() {
    val code = "fun main() { println(\"Hello World\") }"
    val language = "kotlin"
    val title = "Hello World Example"

    val slideContent = SlideContent.CodeSample(code, language, title)

    assertEquals(code, slideContent.code)
    assertEquals(language, slideContent.language)
    assertEquals(title, slideContent.title)
  }

  @Test
  fun `Visualization slide content should store image URL and caption correctly`() {
    val imageUrl = "https://example.com/image.png"
    val caption = "Architecture diagram"
    val contentDescription = "Detailed architecture overview"

    val slideContent = SlideContent.Visualization(imageUrl, caption, contentDescription)

    assertEquals(imageUrl, slideContent.imageUrl)
    assertEquals(caption, slideContent.caption)
    assertEquals(contentDescription, slideContent.contentDescription)
  }

  @Test
  fun `Video slide content should store video URL and caption correctly`() {
    val videoUrl = "https://example.com/demo.mp4"
    val caption = "Feature demonstration"
    val contentDescription = "Video showing app features"

    val slideContent = SlideContent.Video(videoUrl, caption, contentDescription)

    assertEquals(videoUrl, slideContent.videoUrl)
    assertEquals(caption, slideContent.caption)
    assertEquals(contentDescription, slideContent.contentDescription)
  }
}

class BulletPointTest {

  @Test
  fun `BulletPoint should store text correctly`() {
    val text = "Main bullet point"

    val bulletPoint = BulletPoint(text)

    assertEquals(text, bulletPoint.text)
    assertEquals(emptyList<String>(), bulletPoint.subPoints)
  }

  @Test
  fun `BulletPoint should store text and sub-points correctly`() {
    val text = "Main bullet point"
    val subPoints = listOf("Sub-point 1", "Sub-point 2", "Sub-point 3")

    val bulletPoint = BulletPoint(text, subPoints)

    assertEquals(text, bulletPoint.text)
    assertEquals(subPoints, bulletPoint.subPoints)
    assertEquals(3, bulletPoint.subPoints.size)
  }
}

class PresentationEmojiTest {

  @Test
  fun `PresentationEmoji should have correct unicode values`() {
    assertEquals("🚧", PresentationEmoji.CONSTRUCTION.unicode)
    assertEquals("🤔", PresentationEmoji.THINKING.unicode)
    assertEquals("🚀", PresentationEmoji.ROCKET.unicode)
    assertEquals("💡", PresentationEmoji.LIGHTBULB.unicode)
    assertEquals("✅", PresentationEmoji.CHECKMARK.unicode)
    assertEquals("⚠️", PresentationEmoji.WARNING.unicode)
    assertEquals("🔥", PresentationEmoji.FIRE.unicode)
    assertEquals("👍", PresentationEmoji.THUMBS_UP.unicode)
  }

  @Test
  fun `PresentationEmoji should have meaningful descriptions`() {
    assertEquals("Under Construction", PresentationEmoji.CONSTRUCTION.description)
    assertEquals("Thinking", PresentationEmoji.THINKING.description)
    assertEquals("Launch/Fast", PresentationEmoji.ROCKET.description)
    assertEquals("Idea", PresentationEmoji.LIGHTBULB.description)
    assertEquals("Success/Done", PresentationEmoji.CHECKMARK.description)
    assertEquals("Warning", PresentationEmoji.WARNING.description)
    assertEquals("Hot/Popular", PresentationEmoji.FIRE.description)
    assertEquals("Approval", PresentationEmoji.THUMBS_UP.description)
  }

  @Test
  fun `All PresentationEmoji values should be accessible`() {
    val allEmojis = PresentationEmoji.values()

    // Verify we have the expected number of emojis
    assertEquals(51, allEmojis.size)

    // Verify each emoji has both unicode and description
    allEmojis.forEach { emoji ->
      assertNotNull("Unicode should not be null for $emoji", emoji.unicode)
      assertNotNull("Description should not be null for $emoji", emoji.description)
      assert(emoji.unicode.isNotEmpty()) { "Unicode should not be empty for $emoji" }
      assert(emoji.description.isNotEmpty()) { "Description should not be empty for $emoji" }
    }
  }

  @Test
  fun `PresentationEmoji should support common use cases`() {
    // Test some common presentation scenarios
    val constructionEmoji = PresentationEmoji.CONSTRUCTION
    assertEquals("🚧", constructionEmoji.unicode)

    val successEmoji = PresentationEmoji.CHECKMARK
    assertEquals("✅", successEmoji.unicode)

    val speedEmoji = PresentationEmoji.ROCKET
    assertEquals("🚀", speedEmoji.unicode)

    val ideaEmoji = PresentationEmoji.LIGHTBULB
    assertEquals("💡", ideaEmoji.unicode)
  }
}
