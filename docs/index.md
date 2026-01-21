# AutoMobile

AutoMobile is an MCP server that lets AI agents control your Android & iOS devices using natural language. [Install it now](install.md) and [get started](using/ux-exploration.md).

It uses standard platform tools like `adb` & `simctl` paired with its own additional Kotlin & Swift libraries and apps. All components are open source. The point is to provide mobile engineers with AI workflow tools to perform UX deep dives, reproduce bugs, and run automated tests.

??? example "See demo: Clock app alarm"
    ![Setting an alarm in the Clock app](img/clock-app.gif)
    *An AI agent navigating to the Clock app, creating a new alarm*

??? example "See demo: YouTube search"
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
| **[Audit contrast](using/a11y.md#contrast)** | Find accessibility issues with color contrast |
| **[Check tap targets](using/a11y.md#tap-targets)** | Ensure touch targets meet size guidelines |

## How it works

- 🤖 **Fast UX Inspection** Kotlin Accessibility Service and Swift XCTestService to enable fast, accurate observations. 10x faster than the next fastest observation toolkit.
- 🦾 **Full Touch Injection** Tap, Swipe, Pinch, Drag & Drop, Shake with automatic element targeting.
- ♻️ **Tool Feedback** [Observations](design-docs/mcp/observe/index.md) drive the [interaction loop](design-docs/mcp/interaction-loop.md) for all [tool calls](design-docs/mcp/tools/index.md).
- 🧪 **Test Execution** [Kotlin JUnitRunner](design-docs/plat/android/junitrunner.md) & [Swift XCTestRunner](design-docs/plat/ios/xctestrunner.md) execute tests natively handling device pooling, multi-device tests, and automatically optimizing test timing.

## License

```
Copyright 2025 Zillow, Inc.
Copyright 2025-2026 Jason Pearson

Licensed under the Apache License, Version 2.0
https://www.apache.org/licenses/LICENSE-2.0
```
