package com.zillow.automobile.slides.data

import com.zillow.automobile.slides.model.BulletPoint
import com.zillow.automobile.slides.model.PresentationEmoji
import com.zillow.automobile.slides.model.SlideContent

/** Slides for Introduction to AutoMobile? */
fun getIntroductionSlides(): List<SlideContent> =
    listOf(
        SlideContent.LargeText(title = "AutoMobile", subtitle = "Jason Pearson @ Zillow"),
        SlideContent.Emoji(emoji = PresentationEmoji.THINKING, caption = "Who am I?"),

        // Swipe screen to show promo video

        SlideContent.BulletPoints(
            title = "UI testing up until now",
            points =
                listOf(
                    BulletPoint(text = "Manual"),
                    BulletPoint(text = "Automated"),
                )),
        SlideContent.LargeText(
            title =
                "AutoMobile is a set of tools for automating the authoring and execution of UI testing"),
        SlideContent.Emoji(emoji = PresentationEmoji.THINKING, caption = "How?"),
        SlideContent.BulletPoints(
            points =
                listOf(
                    BulletPoint(text = "Directly uses Android platform tools"),
                    BulletPoint(text = "Runs as a simple JVM test"),
                    BulletPoint(text = "Understands your source code"),
                )),
        SlideContent.BulletPoints(
            title = "AutoMobile includes:",
            points =
                listOf(
                    BulletPoint("MCP server that doubles as a CLI tool"),
                    BulletPoint("A Kotlin test authoring Clikt app"),
                    BulletPoint("A custom JUnitRunner"),
                    // TODO: Uncomment if koog lands BulletPoint("An agentic loop for intelligently
                    // self-healing tests")
                )),
    )
