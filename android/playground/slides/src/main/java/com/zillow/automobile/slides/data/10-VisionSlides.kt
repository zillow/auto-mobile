package com.zillow.automobile.slides.data

import com.zillow.automobile.slides.R
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
            emoji = PresentationEmoji.DATA_TRANSFER, caption = "State Capture and Restoration"),
        SlideContent.Emoji(
            emoji = PresentationEmoji.TOOLBOX, caption = "We can build a better toolbox"),
        SlideContent.LargeText(title = "Project Status"),
        SlideContent.LargeText(title = "Works on all Android apps today"),
        SlideContent.LargeText(title = "iOS support prototyped"),
        SlideContent.BulletPoints(
            title = "Parameterization of everything",
            points =
                listOf(
                    BulletPoint(text = "Day/Night"),
                    BulletPoint(text = "Portrait/Landscape"),
                    BulletPoint(text = "API Levels"),
                    BulletPoint(text = "Input devices"),
                )),
        SlideContent.LargeText(title = "Self healing soon"),
        SlideContent.BulletPoints(
            title = "Android MCP SDK which is also OSS",
            points =
                listOf(
                    BulletPoint(text = "Tools: View Hierarchy, Storage, Network"),
                    BulletPoint(text = "Resources: App Resources, Filesystem"),
                    BulletPoint(text = "https://github.com/kaeawc/android-mcp-sdk"),
                )),
        SlideContent.Screenshot(
            title = "Questions?",
            lightScreenshot = R.drawable.auto_mobile_qr_code,
            caption = "https://www.jasonpearson.dev"),
    )
