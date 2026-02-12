package dev.jasonpearson.automobile.slides.data

import dev.jasonpearson.automobile.slides.model.BulletPoint
import dev.jasonpearson.automobile.slides.model.PresentationEmoji
import dev.jasonpearson.automobile.slides.model.SlideContent

/** Slides covering the rise of browser use and the mobile gap. */
fun getMobileUseSlides(): List<SlideContent> =
    listOf(
        SlideContent.LargeText(title = "Mobile Use"),
        SlideContent.LargeText(
            title = "2025 kicked off with browser use",
            subtitle = "Playwright + MCP",
        ),
        SlideContent.BulletPoints(
            title = "The web got:",
            points =
                listOf(
                    BulletPoint(text = "AI-driven tests for a wider audience"),
                    BulletPoint(text = "Explore, debug, prototype"),
                    BulletPoint(text = "An explosion of vibe coding"),
                ),
        ),
        SlideContent.Emoji(
            emoji = PresentationEmoji.PHONE,
            caption = "But not as much for mobile",
        ),
        SlideContent.LargeText(
            title = "What did web folks have that mobile didn't?",
        ),
        SlideContent.BulletPoints(
            title = "A frontend engineer could ask an AI agent to:",
            points =
                listOf(
                    BulletPoint(text = "Inspect a page"),
                    BulletPoint(text = "Click through a user flow"),
                    BulletPoint(text = "Check local storage, profile performance"),
                    BulletPoint(text = "File a bug — all in one session"),
                ),
        ),
        SlideContent.Emoji(
            emoji = PresentationEmoji.SHRUG,
            caption = "Mobile engineers were still alt-tabbing between Cursor and Android Studio",
        ),
        SlideContent.LargeText(
            title = "Solving UI testing tooling problems opens up full mobile use",
        ),
    )
