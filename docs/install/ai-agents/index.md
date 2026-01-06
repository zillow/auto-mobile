# AI Agent Setup

AutoMobile runs as an MCP (Model Context Protocol) server in STDIO mode. Configure your AI agent to connect to AutoMobile using the examples below.

## Quick Setup

```json
{
  "mcpServers": {
    "auto-mobile": {
      "command": "npx",
      "args": ["-y", "@kaeawc/auto-mobile@latest"]
    }
  }
}
```

If Android SDK is not on `PATH`:

```json
{
  "mcpServers": {
    "auto-mobile": {
      "command": "npx",
      "args": ["-y", "@kaeawc/auto-mobile@latest"],
      "env": {
        "ANDROID_HOME": "/path/to/android/sdk"
      }
    }
  }
}
```

## Supported AI Agents

Any MCP-compatible client can use AutoMobile. Configuration guides for specific clients:

### MCP Client Documentation

- **Claude Desktop** - [MCP Configuration Guide](https://modelcontextprotocol.io/quickstart/user)
- **Claude Code** - [MCP Server Setup](claude-code.md)
- **Cursor** - [MCP Integration](https://docs.cursor.com/context/context-mcp)
- **Codex** - [MCP Setup](codex.md)
- **Firebender** - [MCP Config](firebender.md)
- **Goose** - [MCP Configuration](goose.md)

### Model Provider API Keys

For JUnitRunner AI self-healing tests, configure API keys:

- **Anthropic Claude** - [Get API Key](https://console.anthropic.com/settings/keys) | [Docs](https://docs.anthropic.com/en/api/getting-started)
- **OpenAI** - [Get API Key](https://platform.openai.com/api-keys) | [Docs](https://platform.openai.com/docs/quickstart)
- **Google Gemini** - [Get API Key](https://aistudio.google.com/app/apikey) | [Docs](https://ai.google.dev/gemini-api/docs/api-key)
- **AWS Bedrock** - [Setup Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/setting-up.html)

Set API keys via environment variables or system properties. See [AutoMobile SDK](../../design-docs/plat/android/auto-mobile-sdk.md#model-providers) for configuration details.

## MCP Protocol

AutoMobile implements the [Model Context Protocol](https://modelcontextprotocol.io/introduction) specification for AI agent integration.

Technical details: [MCP Server Design](../../design-docs/mcp/index.md)
