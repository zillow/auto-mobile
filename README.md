# AutoMobile

![AutoMobile sticker](docs/img/auto_mobile_sticker_splash.png)

**AutoMobile lets AI agents control your mobile devices using natural language.** Tell an AI what you want to do, and it interacts with your Android or iOS app.

It can do all this by being an MCP server that uses standard platform tools like adb & simctl paired with additional Kotlin & Swift libraries and apps. All components are open source. The point is to provide mobile engineers with AI workflow tools to perform UX deep dives, reproduce bugs, and run automated tests.

![Setting an alarm in the Clock app](img/clock-app.gif)
*An AI agent navigating to the Clock app, creating a new alarm*

![Searching YouTube for a video](img/youtube-search.gif)
*An AI agent searching YouTube and browsing results*

### Explore and Test

| Task | What it does |
|------|-------------|
| **[Explore app UX](using/ux-exploration.md)** | Navigate your app, discover screens, map user flows, identify confusing interactions |
| **[Reproduce bugs](using/reproducting-bugs.md)** | Paste a bug report and get exact reproduction steps with screenshots |
| **[Create UI tests](using/ui-tests.md)** | Describe test scenarios in plain English, get executable test plans |
| **[Measure startup time](using/perf-analysis/startup.md)** | Profile cold and warm launch performance |
| **[Check scroll performance](using/perf-analysis/scroll-framerate.md)** | Detect jank and dropped frames |
| **[Audit contrast](using/a11y/contrast.md)** | Find accessibility issues with color contrast |
| **[Check tap targets](using/a11y/tap-targets.md)** | Ensure touch targets meet size guidelines |

## How it works

- 🤖 **Fast UX Inspection** Kotlin Accessibility Service and Swift XCTestService to enable fast, accurate observations. 10x faster than the next fastest observation toolkit.
- 🦾 **Full Touch Injection** Tap, Swipe, Pinch, Drag & Drop, Shake with automatic element targeting.
- ♻️ **Tool Feedback** [Observations](docs/features/mcp-server/observation.md) drive the [interaction loop](docs/features/mcp-server/interaction-loop.md) for all [tool calls](docs/features/mcp-server/tools.md).
- 🧪 **[Test Execution](docs/features/test-execution/index.md)** Kotlin JUnitRunner & Swift XCTestRunner execute tests natively handling device pooling, multi-device tests, and automatically optimizing test timing.

## Get Started

You can use our interactive installer to step through all host platform requirements and configuration options. It checks host dependencies, optionally downloads Android or iOS developer tools, and configured the MCP daemon.

``` bash title="One-line install (click to copy)"
curl -fsSL https://raw.githubusercontent.com/kaeawc/auto-mobile/main/scripts/install/interactive.sh | bash
```

or you can read and follow the [step-by-step manual guide](manual.md).

## Documentation

- **[Full Documentation](docs/index.md)** - Complete guide with examples
- **[FAQ](docs/faq.md)** - Common questions answered
- **[Design Docs](docs/design-docs/index.md)** - Architecture and implementation details

## Contributing

- [Code of Conduct](CODE_OF_CONDUCT.md)
- Please report security vulnerabilities via GitHub
- [Contributing](.github/CONTRIBUTING.md)
