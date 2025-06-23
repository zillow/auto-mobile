package com.zillow.automobile.slides.data

import com.zillow.automobile.slides.model.BulletPoint
import com.zillow.automobile.slides.model.PresentationEmoji
import com.zillow.automobile.slides.model.SlideContent

fun getEnvSetupSlides(): List<SlideContent> = listOf(
  SlideContent.LargeText(
    title = "Automatic Env Setup"
  ),

  // request action
  // action attempts to find current device session
  // if no session look for active devices
  // if no active devices look for avds
  // if no avds create one that matches project configuration latest target API
  SlideContent.MermaidDiagram(
    title = "Automatic Device Session",
    code = """
      flowchart LR
        Start([Start]) --> FindSession{Find Session}
        FindSession -->|No Session| FindActiveDevice{Find Active Device}
        FindSession -->|Has Session| End([End])
        FindActiveDevice -->|No Active Device| FindAvd{Find AVD}
        FindActiveDevice -->|Has Active Device| End
        FindAvd -->|No AVD| CreateAvd([Create AVD])
      """.trimIndent()
  ),

  SlideContent.Emoji(
    emoji = PresentationEmoji.LAPTOP,
    caption = "Automatic Android Platform Tool Installation"
  ),

  SlideContent.Emoji(
    emoji = PresentationEmoji.GLOBE,
    caption = "Automatic Android Cmdline Tool Installation"
  ),

  SlideContent.BulletPoints(
    title = "Did I get carried away?",
    points = listOf(
      BulletPoint(
        text = "Yes"
      ),
      BulletPoint(
        text = "But now anyone can use it"
      ),
    )
  ),
)
