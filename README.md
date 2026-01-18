# AutoMobile

![AutoMobile sticker](docs/img/auto_mobile_sticker_splash.png)

**AutoMobile lets AI agents control your Android and iOS devices.** It's an MCP server that enables natural language automation of mobile apps - explore UX flows, reproduce bugs, run UI tests, and audit accessibility or performance.

![AutoMobile Demo](docs/img/clock-app.gif)
*An AI agent setting an alarm in the Clock app*

## What can I do with AutoMobile?

| Use Case | Description |
|----------|-------------|
| **[Explore app UX](docs/using/ux-exploration.md)** | Ask an AI to navigate your app, map user flows, and identify confusing interactions |
| **[Reproduce bugs](docs/using/reproducting-bugs.md)** | Paste a bug report and let the agent find and document exact reproduction steps |
| **[Create UI tests](docs/using/ui-tests.md)** | Generate automated tests from natural language descriptions |
| **[Audit accessibility](docs/using/a11y/contrast.md)** | Check contrast ratios, tap target sizes, and screen reader compatibility |
| **[Measure performance](docs/using/perf-analysis/startup.md)** | Profile app startup, scroll framerate, and screen transitions |

## How it works

AutoMobile is built from three components:

1. **MCP Server** (TypeScript) - Exposes device automation as tool calls that any MCP-compatible AI agent can use
2. **Platform Libraries** (Kotlin for Android, Swift for iOS) - Native code that enables fast, accurate observations and touch injection
3. **IDE Plugins** - Android Studio plugin and macOS companion app for test recording and navigation graph visualization

## Get Started

The easiest way to get started is to run the fully automated interactive installer.

### Claude Code Plugin

The easiest way to get started is with the [AutoMobile plugin for Claude Code](https://github.com/kaeawc/auto-mobile). It bundles the MCP server configuration plus specialized skills:

- `/explore` - Comprehensive device interaction and navigation
- `/reproduce-bug` - Structured bug reproduction workflow
- `/apps`, `/gesture`, `/text`, `/system` - Focused interaction skills
- `/snapshot` - Capture and restore device state
- `/doctor` - Diagnose setup issues

### Manual Setup

Add to your MCP client configuration:

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

See the [installation guide](docs/install/overview.md) for detailed setup instructions including Docker configuration.

## Platform Support

| Platform | Status |
|----------|--------|
| **Android** | Fully supported - emulators and physical devices |
| **iOS** | Simulator support available, physical devices coming soon |

## Documentation

- **[Full Documentation](docs/index.md)** - Complete guide with examples
- **[FAQ](docs/faq.md)** - Common questions answered
- **[Design Docs](docs/design-docs/index.md)** - Architecture and implementation details

## Contributing

- [Code of Conduct](CODE_OF_CONDUCT.md)
- Please report security vulnerabilities via GitHub
- [Contributing](.github/CONTRIBUTING.md)
