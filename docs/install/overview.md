# AI Agent Setup

AutoMobile runs as an MCP (Model Context Protocol) server in STDIO mode. Configure your AI agent to connect to AutoMobile using the example below.

### Prerequisites

- Bun 1.3.5 or later

## Interactive Installer (macOS/Linux)

Prefer a guided setup? Run the interactive installer (Bash + Gum) to check dependencies, install Gum/Bun if missing,
optionally download Android command line tools, install the Accessibility Service APK, install the IDE plugin, and start
the MCP daemon, all while showing an animated AutoMobile logo during setup.

From a cloned repo:

```bash
./scripts/install/interactive.sh
```

Or run it directly:

```bash
curl -fsSL https://raw.githubusercontent.com/kaeawc/auto-mobile/main/scripts/install/interactive.sh | bash
```

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

## Android first run

Use this short path once the MCP server is running, a device is connected, the Accessibility Service is enabled, and your
app is installed on the device.

1. **Verify device connectivity**
   Claude Code prompt: "Use AutoMobile to list connected Android devices and confirm one is ready."
2. **List installed apps**
   Claude Code prompt: "List installed apps and show package names so I can pick the target package."
3. **Launch the target app**
   Claude Code prompt: "Launch package `com.example.app` and confirm it is in the foreground."
4. **Run a short exploration**
   Claude Code prompt: "Explore this app for about 10 interactions, avoid destructive actions, and stay in the main flow."
5. **Capture a concrete result**
   Claude Code prompt: "Summarize the screens discovered and the actions that navigate between them (a mini navigation graph)."

You should end with a device ID, a package name, and a short navigation summary you can save or share.

## Decision guide (Android)

If your goal is interactive AI-driven automation, the MCP server plus an agent is enough. The rest are optional based on
what you want to do:

- **IntelliJ IDE Plugin** - Toggle feature flags, record tests, visualize the navigation graph, and inspect app
  performance while coding.
- **JUnitRunner** - Test framework dependency (not the SDK library) to run AutoMobile tests from JUnit/Gradle or CI with
  device pooling, timing ordering, and optional AI self-healing (requires model provider keys).
- **Android SDK library** - Add app-side instrumentation like recomposition tracking.

For Android UI automation, you must enable the [Accessibility Service](../design-docs/plat/android/accessibility-service.md)
on test devices so AutoMobile can access the view hierarchy.

For a comparison table and scenarios, see the [Android decision guide](plat/android.md#decision-guide).

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
