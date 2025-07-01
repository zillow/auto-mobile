# Installation

Right now this guide assumes you are a software engineer. Eventually I'll have a more non-technical guide.

### Prerequisites

- Node.js 18 or later

AutoMobile will automatically download and install the following unless they already exist.
- Command line tools installed via Homebrew or manually in $ANDROID_HOME/cmdline_tools
- Android SDK installed at ANDROID_HOME,
- At least one Android device or emulator

Physical devices do need USB debugging enabled for AutoMobile to function with them. Ripgrep makes it go faster.

### Setup

AutoMobile is distributed mainly as an NPM package.

Its primary use case for local development environments is as an MCP server. Copy the following into Firebender/Cursor/your favorite MCP client:

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

You can also install it directly as a CLI tool.

```shell
npm install -g auto-mobile@latest

# Test CLI mode to check installation succeeded
auto-mobile --cli
```

For full integration:

1. Follow [MCP client config](mcp/overview.md) guide.
2. Add [AutoMobile JUnitRunner test dependency](junitrunner/setup.md) to all Android application and library modules.
