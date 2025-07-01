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

As we're not yet published on npm you need to build it from source, install it, then run the local installation:

```shell
# clone the rep
npm install -g auto-mobile@latest
```

Copy the following into Firebender/Cursor/your favorite MCP client:

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

For full integration:

1. Follow [MCP client config](mcp/overview.md) guide.
2. Add [AutoMobile JUnitRunner dependency](junitrunner/setup.md)
3. Begin interacting with your device through AI commands. Ask to export a plan when you want to write a test with it.
4. Point your agent at an existing test (Espresso/Maestro/Zephyr) and ask it to rewrite it with AutoMobile.
