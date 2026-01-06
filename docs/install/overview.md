# Installation

Right now this guide assumes you are a software engineer who is roughly familiar with AI coding assistants like Cursor,
Claude Code, Codex, or Firebender.

### MCP Server Configuration for your Agent

AutoMobile is distributed mainly as an npm package (`@kaeawc/auto-mobile`) and exposes the `auto-mobile` CLI.

Its primary use case for local development environments is as an MCP server.

1-click install:

- [Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=auto-mobile&config=eyJfX3R5cGVuYW1lIjoiQ2F0YWxvZ0l0ZW1NY3BDb25maWdDb21tYW5kIiwiY29tbWFuZCI6Im5weCIsImFyZ3MiOlsiLXkiLCJhdXRvLW1vYmlsZUBsYXRlc3QiXSwiZW52IjpudWxsfQ==)

If your favorite MCP client doesn't have that capability yet, copy the following into your MCP config:

```json
{
  "mcpServers": {
    "AutoMobile": {
      "command": "npx",
      "args": [
        "-y",
        "@kaeawc/auto-mobile@latest"
      ]
    }
  }
}
```

### Prerequisites

- Bun 1.3.5 or later

#### Android SDK + Emulator Setup

AutoMobile expects the Android SDK/command-line tools to be installed already; the automatic installation path has been
removed. Configure the SDK path with `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `ANDROID_SDK_HOME` so AutoMobile can find
`adb`, or make sure `adb` is on your `PATH`.

Physical devices do need USB debugging enabled for AutoMobile to function with them.


If you have a private npm registry for proxying public npm:

```json
{
  "mcpServers": {
    "AutoMobile": {
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

You can also install it directly as a CLI tool.

```shell
bun install -g @kaeawc/auto-mobile@latest

# Test CLI mode to check installation succeeded
auto-mobile --cli
```

For full integration:

1. Follow [MCP client config](ai-agents.md) guide.
2. Add [AutoMobile JUnitRunner test dependency](../design-docs/plat/android/junitrunner.md) to all Android application and library modules.
