package dev.jasonpearson.automobile.slides.data

import dev.jasonpearson.automobile.slides.model.BulletPoint
import dev.jasonpearson.automobile.slides.model.PresentationEmoji
import dev.jasonpearson.automobile.slides.model.SlideContent

fun getDevWorkflowAssistSlides(): List<SlideContent> =
    listOf(
        SlideContent.LargeText(title = "Dev Workflow Assistance"),
        SlideContent.BulletPoints(
            title = "Why is this important?",
            points =
                listOf(
                    BulletPoint(text = "Constantly seeking ways to be more productive"),
                    BulletPoint(
                        text =
                            "Hope we're always applying all the deep technical knowledge for all the things"
                    ),
                ),
        ),
        SlideContent.Emoji(
            emoji = PresentationEmoji.NEW_EMPLOYEE,
            caption = "Demo: Onboarding a new dev",
        ),
        SlideContent.Emoji(
            emoji = PresentationEmoji.MAGNIFYING_GLASS,
            caption = "Demo: Identifying UI issues",
        ),
    )
