package com.zillow.automobile.slides.data

import com.zillow.automobile.slides.model.PresentationEmoji
import com.zillow.automobile.slides.model.SlideContent

fun getHotReloadingSlides(): List<SlideContent> = listOf(
  SlideContent.LargeText(
    title = "MCP Dev Workflow"
  ),

  SlideContent.MermaidDiagram(
    title = "Challenges and Goals",
    code = """
      flowchart LR
        A[Make Code Change] --> B[Rebuild MCP Server]
        B --> C[npm install -g]
        C --> D[Restart MCP Server]
        D --> E[Tail MCP server logs]
        E --> F[Tail Firebender MCP client logs]
      """.trimIndent()
  ),

  SlideContent.Emoji(
    emoji = PresentationEmoji.BROKEN_CHAIN,
    caption = "Decoupling Architecture",
  ),

  SlideContent.CodeSample(
    title = "Node TypeScript Hot Reloading package.json",
    code = """
{
  "name": "auto-mobile",
  "version": "0.0.1",
  "description": "Mobile device interaction automation with first class MCP support",
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts --transport streamable",
    "dev:port": "ts-node-dev --respawn --transpile-only src/index.ts --transport streamable --port",
    "dev:stdio": "npx tsx src/index.ts",
    ...
  },
  ...
      """.trimIndent(),
    language = "json"
  ),

  SlideContent.MermaidDiagram(
    title = "Hot Reloading STDIO via mcp-remote",
    code = """
      flowchart LR
        MCP_Client --> PID
        PID --> StreamingTransport
        StreamingTransport --> MCP_Server
        MCP_Server --> MCP_Client
      """.trimIndent()
  ),

//  SlideContent.Screenshot(
//    caption = "Android Studio + Firebender Integration",
//    imageUrl = "TODO: Insert actual image URL here"
//  ),

  SlideContent.CodeSample(
    title = "MCP Server Config",
    code = """
      {
        "mcpServers": {
          "AutoMobile": {
            "cmd": "npx",
            "args": ["-y", "mcp-remote", "http://localhost:9000/auto-mobile/streaming"],
          }
        }
      }
    """.trimIndent(),
    language = "json"
  )
)
