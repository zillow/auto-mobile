package dev.jasonpearson.automobile.slides.data

import dev.jasonpearson.automobile.slides.model.BulletPoint
import dev.jasonpearson.automobile.slides.model.PresentationEmoji
import dev.jasonpearson.automobile.slides.model.SlideContent

/** Slides explaining what AutoMobile does and its key capabilities. */
fun getWhatAutoMobileDoesSlides(): List<SlideContent> =
    listOf(
        SlideContent.LargeText(title = "What AutoMobile Does"),
        SlideContent.LargeText(
            title = "You describe what you want to do",
            subtitle = "The AI handles the implementation details",
        ),
        SlideContent.Emoji(
            emoji = PresentationEmoji.MAGNIFYING_GLASS,
            caption = "Explore the app and explain how it works",
        ),
        SlideContent.BulletPoints(
            title = "App exploration",
            points =
                listOf(
                    BulletPoint(text = "Navigate and inspect like real users do"),
                    BulletPoint(text = "Discover features through well designed UX"),
                    BulletPoint(text = "Helpful early development feedback cycle"),
                ),
        ),
        SlideContent.Emoji(
            emoji = PresentationEmoji.TARGET,
            caption = "Reproduce a bug from a crash report",
        ),
        SlideContent.BulletPoints(
            title = "Bug reproduction",
            points =
                listOf(
                    BulletPoint(text = "Paste a bug report and say \"reproduce this\""),
                    BulletPoint(text = "Automatic video recording and device snapshot"),
                    BulletPoint(text = "Time series performance data correlated with actions"),
                ),
        ),
        SlideContent.Emoji(
            emoji = PresentationEmoji.FAST,
            caption = "Profile app performance",
        ),
        SlideContent.BulletPoints(
            title = "Performance profiling",
            points =
                listOf(
                    BulletPoint(text = "Constant performance indicator for debug and release"),
                    BulletPoint(text = "Real time numbers in IDE companion plugin"),
                    BulletPoint(text = "Making performance work more accessible"),
                ),
        ),
        SlideContent.LargeText(
            title = "Element search is highly reproducible",
        ),
        SlideContent.BulletPoints(
            title = "How it keeps working:",
            points =
                listOf(
                    BulletPoint(text = "Automatically determines element and screen position"),
                    BulletPoint(text = "Survives design changes and different devices"),
                    BulletPoint(text = "Does not rely on AI for every interaction"),
                ),
        ),
    )
