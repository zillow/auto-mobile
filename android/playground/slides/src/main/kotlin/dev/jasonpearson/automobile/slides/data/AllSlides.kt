package dev.jasonpearson.automobile.slides.data

import dev.jasonpearson.automobile.slides.model.PresentationEmoji
import dev.jasonpearson.automobile.slides.model.SlideContent

/**
 * Combined slides data for the complete AutoMobile presentation. Combines all individual slide
 * sections into one comprehensive presentation.
 */
fun getAllSlides(): List<SlideContent> =
    getIntroductionSlides() +
        getMobileUseSlides() +
        getWhatAutoMobileDoesSlides() +
        listOf(
            SlideContent.Emoji(
                emoji = PresentationEmoji.PLAYGROUND,
                caption = "Demo: AutoMobile Playground",
            ),
        ) +
        getVisionSlides()
