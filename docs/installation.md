# Installation

Right now this guide assumes you are a software engineer who is roughly familiar with AI coding assistants like Cursor,
Claude Code, or Firebender.

### MCP Server Configuration for your Agent

AutoMobile is distributed mainly as an npm package.

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
        "auto-mobile@latest"
      ]
    }
  }
}
```

### Prerequisites

- Node.js 20 or later

#### Android SDK + Emulator Setup

AutoMobile will automatically download and install the following unless they already exist:

- Command line tools installed via Homebrew or manually in `$ANDROID_HOME/cmdline_tools`
- Android SDK installed at `$ANDROID_HOME`
- At least one Android device or emulator

Physical devices do need USB debugging enabled for AutoMobile to function with them. Ripgrep makes it go faster.


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
        "auto-mobile@latest"
      ]
    }
  }
}
```

You can also install it directly as a CLI tool.

```shell
npm install -g auto-mobile@latest

# Test CLI mode to check installation succeeded
auto-mobile --cli
```

For full integration:

1. Follow [MCP client config](mcp-clients/index.md) guide.
2. Add [AutoMobile JUnitRunner test dependency](features/test-execution/junitrunner.md) to all Android application and library modules.
