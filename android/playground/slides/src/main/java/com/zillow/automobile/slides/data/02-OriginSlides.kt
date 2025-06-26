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
            emoji = PresentationEmoji.PROGRAMMER,
            caption = "I got tasked with looking at OSS AI tools for UI testing"),
        SlideContent.Emoji(
            emoji = PresentationEmoji.SHRUG, caption = "Didn't find what I was looking for"),
        SlideContent.Emoji(
            emoji = PresentationEmoji.GIFT, caption = "Most MCP servers are just thin wrappers"),

        // - Mermaid Diagram of screenshot, tap, screenshot, swipe with AI agent. That's like
        // throwing instructions at someone who has never used a mobile phone before

        SlideContent.LargeText(title = "Screenshot"),
        SlideContent.LargeText(title = "Tap"),
        SlideContent.LargeText(title = "Screenshot"),
        SlideContent.LargeText(title = "Swipe"),
        SlideContent.Emoji(
            emoji = PresentationEmoji.THINKING,
            caption = "What if instead I made tool calls the way we navigate mobile devices?"),
        SlideContent.LargeText(
            title = "Open recent apps",
            subtitle =
                "Depending on device settings either swipe up from bottom edge or tap the recent apps button"),
        SlideContent.LargeText(
            title = "Looking at notifications",
            subtitle = "Swipe down on system bar, scroll to find relevant icon/text"),
        SlideContent.LargeText(
            title = "Selecting text",
            subtitle =
                "Double tap on text, tap \"Select All\", tap \"Cut\" or press Delete key to clear text field"),
        SlideContent.Emoji(
            emoji = PresentationEmoji.THINKING,
            caption = "What if I provided the AI agent with the exact relevant context it needs?"),
        SlideContent.MermaidDiagram(
            title = "Automatic observation on interaction",
            code =
                """
      sequenceDiagram
          participant Agent as AI Agent
          participant MCP as MCP Server
          participant Device as Android Device

          Agent->>MCP: Observation Request
          MCP->>Device: Execute UI Dump/Query
          Device-->>MCP: UI State/Data
          MCP-->>Agent: Observation Response

          Agent->>MCP: Interaction Command
          MCP->>Device: Execute Action (tap/swipe/input)
          Device-->>MCP: Action Result
          MCP-->>Agent: Interaction Response

          Agent->>MCP: Verification Request
          MCP->>Device: Query UI State
          Device-->>MCP: Updated UI State
          MCP-->>Agent: Verification Response

          Note over Agent: Verify Success & Plan Next Action
      """
                    .trimIndent()),
        SlideContent.Emoji(
            emoji = PresentationEmoji.FIRE,
            caption = "Leveraged Firebender & Claude to quickly iterate"))
