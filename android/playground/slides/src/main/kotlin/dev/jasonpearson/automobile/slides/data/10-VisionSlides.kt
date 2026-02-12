package dev.jasonpearson.automobile.slides.data

import dev.jasonpearson.automobile.slides.R
import dev.jasonpearson.automobile.slides.model.BulletPoint
import dev.jasonpearson.automobile.slides.model.SlideContent

fun getVisionSlides(): List<SlideContent> =
    listOf(
        SlideContent.LargeText(title = "State of the Project"),
        SlideContent.LargeText(title = "Android platform support is solid"),
        SlideContent.LargeText(
            title = "iOS support prototyped",
            subtitle = "AI agent & IDE plugin running on iOS simulators",
        ),
        SlideContent.LargeText(title = "What's Next"),
        SlideContent.BulletPoints(
            title = "Actively building toward 1.0",
            points =
                listOf(
                    BulletPoint(text = "Design docs to organize project vision and architecture"),
                    BulletPoint(text = "Technical blog posts on the journey"),
                    BulletPoint(text = "Standalone desktop apps in the works"),
                ),
        ),
        SlideContent.BulletPoints(
            title = "Writing about:",
            points =
                listOf(
                    BulletPoint(text = "Performance improvements"),
                    BulletPoint(text = "How it reuses its observability"),
                    BulletPoint(text = "Challenges of emulator/simulator operation"),
                    BulletPoint(text = "Keeping a mono-repo with big ambitions organized"),
                ),
        ),
        SlideContent.Screenshot(
            title = "Questions?",
            lightScreenshot = R.drawable.auto_mobile_qr_code,
            caption = "https://www.jasonpearson.dev",
        ),
    )
