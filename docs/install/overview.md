# AI Agent Setup

AutoMobile runs as an MCP (Model Context Protocol) server in STDIO mode. Configure your AI agent to connect to AutoMobile using the example below.

### Prerequisites

- Bun 1.3.5 or later

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

## Advanced Configuration

If you need to point at a specific Android SDK path, set `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) in the MCP server env:

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

If you have a private npm registry for proxying public npm:

```json
{
  "mcpServers": {
    "auto-mobile": {
      "command": "npx",
      "args": [
        "-y",
        "--registry",
        "https://your.awesome.private.registry.net/path/to/npm/proxy",
        "@kaeawc/auto-mobile@latest"
      ]
    }
  }
}
```

## Platform Setup

- Android: [Android setup](plat/android.md)
- iOS: unsupported at the moment, but the [design doc](../design-docs/plat/ios/index.md) outlines plans.

### AI Agent & Model Providers

Any MCP-compatible client can use AutoMobile. Configuration guides for specific clients:

- [Claude Desktop](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- [Claude Code](https://code.claude.com/docs/en/mcp#option-3:-add-a-local-stdio-server)
- [Cursor](https://cursor.com/docs/context/mcp#using-mcpjson)
- [Firebender](https://docs.firebender.com/context/mcp/overview#stdio-server-configuration)
- [Goose](https://block.github.io/goose/docs/getting-started/using-extensions#mcp-servers)

For model provider supported features like JUnitRunner AI self-healing tests you will need to configure API keys:

- **Anthropic Claude** - [Get API Key](https://console.anthropic.com/settings/keys) | [Docs](https://docs.anthropic.com/en/api/getting-started)
- **OpenAI** - [Get API Key](https://platform.openai.com/api-keys) | [Docs](https://platform.openai.com/docs/quickstart)
- **Google Gemini** - [Get API Key](https://aistudio.google.com/app/apikey) | [Docs](https://ai.google.dev/gemini-api/docs/api-key)
- **AWS Bedrock** - [Setup Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/setting-up.html)

Set API keys via environment variables or system properties. See [JUnitRunner](../design-docs/plat/android/junitrunner.md#model-providers) for configuration details.


