# Manual Guide

Prerequisites:

- **Bun 1.3.6+**
- **Node 24+**
- **Android SDK** with platform-tools (adb & emulator) - only for Android
- **XCode Developer Tools** with platform-tools (simctl & xcodebuild) - only for iOS
- **Connected device** (emulator or physical with USB debugging)

## Claude Code Plugin

The easiest way to get started is with the [AutoMobile plugin for Claude Code](https://github.com/kaeawc/auto-mobile). It bundles the MCP server configuration plus specialized skills:

- `/explore` - Comprehensive device interaction and navigation
- `/reproduce-bug` - Structured bug reproduction workflow
- `/apps`, `/gesture`, `/text`, `/system` - Focused interaction skills
- `/snapshot` - Capture and restore device state
- `/doctor` - Diagnose setup issues

Add to your MCP client configuration:

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
}
```

For Codex, add to `~/.codex/config.toml`:

```toml
[mcp_servers.auto-mobile]
command = "npx"
args = ["-y", "@kaeawc/auto-mobile@latest"]

[mcp_servers.auto-mobile.env]
ANDROID_HOME = "/path/to/android/sdk"
```

## Private npm Registry

```json
{
  "mcpServers": {
    "auto-mobile": {
      "command": "npx",
      "args": [
        "-y",
        "--registry",
        "https://your.registry.net/npm",
        "@kaeawc/auto-mobile@latest"
      ]
    }
  }
}
```

## Docker

See [docker specific instructions](docker.md)

## Specific Platform Setup

[Android](plat/android.md) | [iOS](plat/ios.md)

### AI Agent & Model Providers

Any MCP-compatible client can use AutoMobile. Configuration guides for specific clients:

- [Claude Desktop](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- [Claude Code](https://code.claude.com/docs/en/mcp#option-3:-add-a-local-stdio-server)
- [Codex](https://developers.openai.com/codex/mcp/)
- [Cursor](https://cursor.com/docs/context/mcp#using-mcpjson)
- [Firebender](https://docs.firebender.com/context/mcp/overview#stdio-server-configuration)
- [Goose](https://block.github.io/goose/docs/getting-started/using-extensions#mcp-servers)

For model provider supported features like JUnitRunner AI self-healing tests you will need to configure API keys:

- **Anthropic Claude** - [Get API Key](https://console.anthropic.com/settings/keys) | [Docs](https://docs.anthropic.com/en/api/getting-started)
- **OpenAI** - [Get API Key](https://platform.openai.com/api-keys) | [Docs](https://platform.openai.com/docs/quickstart)
- **Google Gemini** - [Get API Key](https://aistudio.google.com/app/apikey) | [Docs](https://ai.google.dev/gemini-api/docs/api-key)
- **AWS Bedrock** - [Setup Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/setting-up.html)

Set API keys via environment variables or system properties. See [JUnitRunner](../design-docs/plat/android/junitrunner.md#model-providers) for configuration details.
