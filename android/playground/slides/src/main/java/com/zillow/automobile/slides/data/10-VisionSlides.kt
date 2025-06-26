package com.zillow.automobile.slides.data

import com.zillow.automobile.slides.model.BulletPoint
import com.zillow.automobile.slides.model.PresentationEmoji
import com.zillow.automobile.slides.model.SlideContent

fun getVisionSlides(): List<SlideContent> =
    listOf(
        SlideContent.LargeText(title = "Vision"),
        SlideContent.LargeText(title = "Built-in opt-in testing"),
        SlideContent.Emoji(
            emoji = PresentationEmoji.ACCESSIBILITY, caption = "Accessibility Testing"),
        SlideContent.Emoji(
            emoji = PresentationEmoji.SECURE, caption = "Security and Privacy Testing"),
        SlideContent.Emoji(emoji = PresentationEmoji.FAST, caption = "Performance Testing"),
        SlideContent.Emoji(
            emoji = PresentationEmoji.TOOLBOX, caption = "We can build a better toolbox"),
        SlideContent.LargeText(title = "Project Status"),
        SlideContent.LargeText(title = "Works on all Android apps today"),
        SlideContent.LargeText(title = "iOS support on the roadmap"),
        SlideContent.BulletPoints(
            title = "Parameterization of everything",
            points =
                listOf(
                    BulletPoint(text = "Day/Night"),
                    BulletPoint(text = "Portrait/Landscape"),
                    BulletPoint(text = "API Levels"),
                    BulletPoint(text = "Input devices"),
                )),

        // TODO: If this lands before talk omit from vision
        SlideContent.LargeText(title = "Self healing agentic loop coming very soon"),

        // TODO: If this lands before talk omit from vision
        SlideContent.LargeText(title = "Android MCP SDK which is also OSS"),
        SlideContent.BulletPoints(
            title = "Android MCP SDK which is also OSS",
            points =
                listOf(
                    BulletPoint(text = "Tools: View Hierarchy, Storage, Network"),
                    BulletPoint(text = "Resources: App Resources, Filesystem"),
                )),
        SlideContent.LargeText(title = "And now so is AutoMobile"),
        SlideContent.Emoji(emoji = PresentationEmoji.ROCKET, caption = "Launching"),
        SlideContent.Emoji(emoji = PresentationEmoji.MICROPHONE, caption = "Questions?"),
    )
