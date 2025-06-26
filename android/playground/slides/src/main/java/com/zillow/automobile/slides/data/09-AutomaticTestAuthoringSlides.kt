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
        SlideContent.BulletPoints(
            title = "Test Placement Configurations",
            points =
                listOf(
                    BulletPoint(text = "Root common module of plurality of Composable (default)"),
                    BulletPoint(text = "Submodule of root common with greatest plurality"),
                    BulletPoint(text = "Activity/Fragment only"),
                    BulletPoint(text = "Application module"),
                    BulletPoint(text = "Suggestions welcome!"),
                )),
        SlideContent.Emoji(emoji = PresentationEmoji.THINKING, caption = "Why is this important?"),
        SlideContent.Emoji(emoji = PresentationEmoji.EASY, caption = "Allows for easier adoption"),
        SlideContent.Emoji(
            emoji = PresentationEmoji.FAST, caption = "Allows for easier parallelization"),
    )
