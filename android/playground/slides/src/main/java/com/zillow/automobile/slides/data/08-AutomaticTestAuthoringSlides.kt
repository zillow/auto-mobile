package com.zillow.automobile.slides.data

import com.zillow.automobile.slides.model.BulletPoint
import com.zillow.automobile.slides.model.PresentationEmoji
import com.zillow.automobile.slides.model.SlideContent

fun getAutomaticTestAuthoringSlides(): List<SlideContent> =
    listOf(
        SlideContent.LargeText(title = "Automatic Test Authoring"),
        SlideContent.BulletPoints(
            title = "Kotlin Test Author Clikt app",
            points =
                listOf(
                    BulletPoint(
                        text =
                            "Writes Kotlin test files with KotlinPoet + public modifier scrubbing"),
                    BulletPoint(text = "Highly configurable to put tests in the right place"),
                )),
        SlideContent.CodeSample(
            title = "Environment Credentials Example",
            code =
                """
      @Test
      fun `given valid credentials, login should succeed`() {
          val result = AutoMobilePlan("test-plans/login.yaml", {
            "username" to "jason@zillow.com"
            "password" to "hunter2"
          }).execute()
          assertTrue(result.status)
      }
    """
                    .trimIndent(),
            language = "kotlin"),
        SlideContent.Emoji(emoji = PresentationEmoji.THINKING, caption = "Why is this important?"),
        SlideContent.Emoji(emoji = PresentationEmoji.EASY, caption = "Allows for easier adoption"),
        SlideContent.Emoji(
            emoji = PresentationEmoji.FAST, caption = "Allows for easier parallelization"),
    )
