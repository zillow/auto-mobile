package com.zillow.automobile.slides.data

import com.zillow.automobile.slides.model.PresentationEmoji
import com.zillow.automobile.slides.model.SlideContent

/** Slides for Introduction to AutoMobile? */
fun getOriginSlides(): List<SlideContent> =
    listOf(
        // - Origin Story
        //    - Was looking into open source MCP servers because I knew from early experiences that
        // they could be powerful
        //    - Didn't find what I was looking for
        //      - Most MCP tool calls were wrapper implementations of existing tools
        //      - Diagram of screenshot, tap, screenshot, swipe with AI agent. That's like throwing
        // instructions at someone who has never used a mobile phone before
        //      - What if instead I looked at it from the perspective of someone who knows how to
        // navigate mobile devices? After all we'd all love to have a UI testing tool that could
        // innately understand that.
        //      - Big text slides
        //        - Open recent apps
        //        - Swipe down to see notifications
        //        - Double tap on text, tap "Select All", tap "Cut" or press Delete key to clear
        // text field
        //        - Mermaid diagram showing system design of automatic observation on interaction
        SlideContent.LargeText(title = "Origin Story"),
        SlideContent.Emoji(
            emoji = PresentationEmoji.DOLPHIN, caption = "Flipper got deprecated in 2024"),
        SlideContent.Emoji(
            emoji = PresentationEmoji.MAGNIFYING_GLASS,
            caption = "Didn't find what I was looking for in OSS"),
        SlideContent.Emoji(
            emoji = PresentationEmoji.GIFT, caption = "Most MCP servers are just thin wrappers"),

        // - Mermaid Diagram of screenshot, tap, screenshot, swipe with AI agent. That's like
        // throwing instructions at someone who has never used a mobile phone before

        SlideContent.MermaidDiagram(
            title = "These instructions don't have any context",
            code =
                """
      flowchart LR
      A[Screenshot] --> B[Tap]
      B --> C[Screenshot]
      C --> D[Swipe]
      D --> E[Screenshot]
      """
                    .trimIndent()),
        SlideContent.Emoji(
            emoji = PresentationEmoji.THINKING,
            caption =
                "What if instead I looked at it from the perspective of someone who knows how to navigate mobile devices?"),
        SlideContent.LargeText(
            title =
                "Depending on device settings either swipe up from bottom edge or tap the recent apps button",
            subtitle = "Open recent apps"),
        SlideContent.LargeText(
            title = "Swipe down on system bar, scroll to find relevant icon/text",
            subtitle = "Looking at notifications"),
        SlideContent.LargeText(
            title =
                "Double tap on text, tap \"Select All\", tap \"Cut\" or press Delete key to clear text field",
            subtitle = "Selecting text"),
        SlideContent.MermaidDiagram(
            title = "Automatic observation on interaction",
            code =
                """
      flowchart LR
      A[Observation] --> B[Interaction]
      B --> C[Observation]
      C --> D[Verify Success]
      D --> E[Next]
      """
                    .trimIndent()),
    )
