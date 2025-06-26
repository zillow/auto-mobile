package com.zillow.automobile.slides.data

import com.zillow.automobile.slides.R
import com.zillow.automobile.slides.model.BulletPoint
import com.zillow.automobile.slides.model.PresentationEmoji
import com.zillow.automobile.slides.model.SlideContent

fun getHotReloadingSlides(): List<SlideContent> =
    listOf(
        SlideContent.LargeText(title = "MCP Dev Workflow"),
        SlideContent.BulletPoints(
            title = "Reloading is challenging",
            points =
                listOf(
                    BulletPoint(text = "Make Code Change"),
                    BulletPoint(text = "Rebuild MCP Server"),
                    BulletPoint(text = "npm install -g"),
                    BulletPoint(text = "Tail all the logs and hope for the best"),
                )),
        SlideContent.Emoji(
            emoji = PresentationEmoji.BROKEN_CHAIN,
            caption = "Decoupling Architecture",
        ),
        SlideContent.MermaidDiagram(
            title = "Decoupling Architecture",
            code =
                """
      sequenceDiagram
        Client->>MCP Remote: Communicate via STDIO
        MCP Remote->>Transport Layer: Establish streaming transport that can reconnect
        Transport Layer->>Server Tools: Request the same set of tools
        Server Tools->>Transport: Respond with the same output
        Transport-->>Client: Relay through mcp-remote
      """
                    .trimIndent()),
        SlideContent.LargeText(
            title = "ts-node-dev --respawn --transpile-only src/index.ts --transport streamable"),
        SlideContent.Screenshot(
            darkScreenshot = R.drawable.firebender_auto_mobile_hot_reload,
        ),
    )
