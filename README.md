# AutoMobile

[![Pull Request](https://github.com/kaeawc/auto-mobile/actions/workflows/pull_request.yml/badge.svg)](https://github.com/kaeawc/auto-mobile/actions/workflows/pull_request.yml)
[![On Merge](https://github.com/kaeawc/auto-mobile/actions/workflows/merge.yml/badge.svg)](https://github.com/kaeawc/auto-mobile/actions/workflows/merge.yml)
[![Nightly](https://github.com/kaeawc/auto-mobile/actions/workflows/nightly.yml/badge.svg)](https://github.com/kaeawc/auto-mobile/actions/workflows/nightly.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey)
![Platform: Linux](https://img.shields.io/badge/platform-Linux-lightgrey)

![TypeScript tests: 3,135](https://img.shields.io/badge/TypeScript_tests-3%2C135-3178C6)
![Kotlin tests: 744](https://img.shields.io/badge/Kotlin_tests-744-7F52FF)
![Swift tests: 146](https://img.shields.io/badge/Swift_tests-146-F05138)
![TS coverage](https://img.shields.io/endpoint?url=https://kaeawc.github.io/auto-mobile/ts-coverage-badge.json)
![Kotlin coverage](https://img.shields.io/endpoint?url=https://kaeawc.github.io/auto-mobile/kotlin-coverage-badge.json)
![Swift coverage](https://img.shields.io/endpoint?url=https://kaeawc.github.io/auto-mobile/swift-coverage-badge.json)

![AutoMobile sticker](docs/img/auto_mobile_sticker_splash.png)

**AutoMobile lets AI agents control your mobile devices using natural language.** Tell an AI what you want to do, and it interacts with your Android or iOS app.

It can do all this by being an MCP server that uses standard platform tools like adb & simctl paired with additional Kotlin & Swift libraries and apps. All components are open source. The point is to provide mobile engineers with AI workflow tools to perform UX deep dives, reproduce bugs, and run automated tests.

![Setting an alarm in the Clock app](docs/img/clock-app.gif)
*An AI agent navigating to the Clock app, creating a new alarm*

![Searching YouTube for a video](docs/img/youtube-search.gif)
*An AI agent searching YouTube and browsing results*

### Explore and Test

| Task | What it does |
|------|-------------|
| **[Explore app UX](docs/using/ux-exploration.md)** | Navigate your app, discover screens, map user flows, identify confusing interactions |
| **[Reproduce bugs](docs/using/reproducing-bugs.md)** | Paste a bug report and get exact reproduction steps with screenshots |
| **[Create UI tests](docs/using/ui-tests.md)** | Describe test scenarios in plain English, get executable test plans |
| **[Measure startup time](docs/using/perf-analysis/startup.md)** | Profile cold and warm launch performance |
| **[Check scroll performance](docs/using/perf-analysis/scroll-framerate.md)** | Detect jank and dropped frames |
| **[Audit contrast](docs/using/a11y.md#contrast)** | Find accessibility issues with color contrast |
| **[Check tap targets](docs/using/a11y.md#tap-targets)** | Ensure touch targets meet size guidelines |

## How it works

- 🤖 **Fast UX Inspection** Kotlin Accessibility Service and Swift XCTestService to enable fast, accurate observations. 10x faster than the next fastest observation toolkit.
- 🦾 **Full Touch Injection** Tap, Swipe, Pinch, Drag & Drop, Shake with automatic element targeting.
- ♻️ **Tool Feedback** [Observations](docs/design-docs/mcp/observe/index.md) drive the [interaction loop](docs/design-docs/mcp/interaction-loop.md) for all [tool calls](docs/design-docs/mcp/tools.md).
- 🧪 **Test Execution** [Kotlin JUnitRunner](docs/design-docs/plat/android/junit-runner/index.md) & [Swift XCTestRunner](docs/design-docs/plat/ios/xctestrunner/index.md) execute tests natively handling device pooling, multi-device tests, and automatically optimizing test timing.

## Get Started

You can use our interactive installer to step through all host platform requirements and configuration options. It checks host dependencies, optionally downloads Android or iOS developer tools, and configured the MCP daemon.

``` bash title="One-line install (click to copy)"
curl -fsSL https://raw.githubusercontent.com/kaeawc/auto-mobile/refs/heads/main/scripts/install.sh | bash
```

or you can read and follow the [step-by-step manual guide](docs/install.md).

## Documentation

- **[Full Documentation](docs/index.md)** - Complete guide with examples
- **[FAQ](docs/faq.md)** - Common questions answered
- **[Design Docs](docs/design-docs/index.md)** - Architecture and implementation details

## Contributing

- [Code of Conduct](CODE_OF_CONDUCT.md)
- Please report security vulnerabilities via GitHub
- [Contributing](.github/CONTRIBUTING.md)
