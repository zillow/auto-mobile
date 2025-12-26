package dev.jasonpearson.automobile.slides.data

import dev.jasonpearson.automobile.slides.model.BulletPoint
import dev.jasonpearson.automobile.slides.model.PresentationEmoji
import dev.jasonpearson.automobile.slides.model.SlideContent

/** Slides for Introduction to AutoMobile? */
fun getEarlySuccessSlides(): List<SlideContent> =
    listOf(
        SlideContent.LargeText(title = "Early Success & Demos"),

        SlideContent.Emoji(emoji = PresentationEmoji.CLOCK, caption = "Clock app set alarm demo"),
        SlideContent.BulletPoints(
            title = "Quickly iterated to explore as many apps as possible",
            points =
                listOf(
                    BulletPoint(text = "Tons of different form fields and UX patterns"),
                    BulletPoint(text = "Edge cases in parsing active windows"),
                )),

        SlideContent.Emoji(emoji = PresentationEmoji.GLOBE, caption = "Decided to pursue OSS"),
    )
