package com.zillow.automobile.slides.data

import com.zillow.automobile.slides.model.BulletPoint
import com.zillow.automobile.slides.model.PresentationEmoji
import com.zillow.automobile.slides.model.SlideContent

fun getVisionSlides(): List<SlideContent> =
    listOf(
        SlideContent.LargeText(title = "Vision"),
        SlideContent.BulletPoints(
            title = "Optional built in-assertions",
            points =
                listOf(
                    BulletPoint(text = "Accessibility"),
                    BulletPoint(text = "Security"),
                    BulletPoint(text = "Performance"),
                )),
        SlideContent.BulletPoints(
            title = "Easy parameterization of everything",
            points =
                listOf(
                    BulletPoint(text = "Day/Night"),
                    BulletPoint(text = "Portrait/Landscape"),
                    BulletPoint(text = "API Levels"),
                )),

        // TODO: If this lands before talk omit from vision
        SlideContent.LargeText(title = "Self healing agentic loop"),

        // TODO: If this lands before talk omit from vision
        SlideContent.LargeText(title = "Android MCP SDK which is also OSS"),
        SlideContent.LargeText(title = "And now so is AutoMobile"),
        SlideContent.Emoji(emoji = PresentationEmoji.ROCKET, caption = "Launching"),
        SlideContent.Emoji(emoji = PresentationEmoji.MICROPHONE, caption = "Questions?"),
    )
