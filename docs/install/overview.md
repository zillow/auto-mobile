# Overview

AutoMobile runs as an MCP server, connecting AI agents to Android devices for automation.

## Interactive Installer (MacOS)

``` bash title="One-line install (click to copy)"
curl -fsSL https://raw.githubusercontent.com/kaeawc/auto-mobile/main/scripts/install/interactive.sh | bash
```

## Manual Setup

Prerequisites:

- **Bun 1.3.5+** (or Node.js for npx)
- **Android SDK** with platform-tools (ADB)
- **Connected device** (emulator or physical with USB debugging)

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
The installer checks dependencies, optionally downloads Android tools, installs the Accessibility Service APK, and configures the MCP daemon.

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

## Specific Platform Setup

[Android](plat/android.md) | [iOS](plat/ios.md)

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
