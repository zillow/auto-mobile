package dev.jasonpearson.automobile.slides.data

import dev.jasonpearson.automobile.slides.model.BulletPoint
import dev.jasonpearson.automobile.slides.model.PresentationEmoji
import dev.jasonpearson.automobile.slides.model.SlideContent

/** Slides introducing the problem space and AutoMobile's mission. */
fun getIntroductionSlides(): List<SlideContent> =
    listOf(
        SlideContent.LargeText(title = "AutoMobile", subtitle = "Jason Pearson"),
        SlideContent.Emoji(emoji = PresentationEmoji.PROGRAMMER, caption = "Who am I?"),
        SlideContent.LargeText(
            title = "The best of mobile tooling has been inaccessible",
        ),
        SlideContent.BulletPoints(
            title = "Behind walls of",
            points =
                listOf(
                    BulletPoint(text = "Cost"),
                    BulletPoint(text = "Specialized expertise"),
                ),
        ),
        SlideContent.LargeText(
            title = "No cohesive UX ties them together",
        ),
        SlideContent.Emoji(
            emoji = PresentationEmoji.SLOW,
            caption = "More like AutoCAD 2008",
        ),
        SlideContent.LargeText(
            title = "Automating tedium in mobile engineering has been out of reach",
        ),
        SlideContent.LargeText(
            title = "I built AutoMobile to change that",
        ),
        SlideContent.BulletPoints(
            title = "AutoMobile is:",
            points =
                listOf(
                    BulletPoint("Open source MCP server"),
                    BulletPoint("AI agents control Android & iOS devices"),
                    BulletPoint("Natural language interaction"),
                    BulletPoint("Most features require no SDK dependency"),
                ),
        ),
    )
