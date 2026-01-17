# Overview

AutoMobile is a bun TypeScript MCP server providing Android & iOS device automation capabilities through its tools and resources. It also uses its own Kotlin & Swift supporting libraries and apps to make highly performant and accurate automation possible. The point is to provide mobile engineers with AI workflow tools to run explorations, reproduce bugs, and run automated tests.

![Setting an alarm in the Clock app](img/clock-app-demo.gif)
*Demo: An AI agent navigating to the Clock app, opening the alarm tab, and creating a new alarm.*

![Searching YouTube for a video](img/youtube-search.gif)
*Demo: An AI agent opening YouTube, entering a search query, and browsing the results.*

## Get Started

1. [Install AutoMobile](install/overview.md)
2. Try some use cases:

	- [Explore app ux](using/ux-exploration.md), [create UI tests](using/ui-tests.md), and easily create [bug reports]() with built-in [video recording](design-docs/mcp/observe/video-recording.md) and [visual highlights](design-docs/mcp/observe/visual-highlighting.md).
	- Measure [startup](using/perf-analysis/startup.md), [scroll framerate](using/perf-analysis/scroll-framerate.md), and [screen transitions](using/perf-analysis/screen-transition.md).
	- Audit accessibility compliance with [contrast ratios](using/a11y/contrast.md) & [tap targets](using/a11y/tap-targets.md).
    - (Coming soon) record tests via AutoMobile's companion Android plugin & MacOS app.
    - Run tests natively via [JUnitRunner for Android](design-docs/plat/android/junitrunner.md) and (coming soon) XCTestRunner for iOS.

## Resources

- [Design Docs](design-docs/index.md) - Architecture and implementation details
- [FAQ](faq.md) - Common questions
- [Contributing](contributing/overview.md) - How to contribute

![AutoMobile](img/auto-mobile-party.gif)

## License

```
Copyright 2025 Zillow, Inc.
Copyright 2025-2026 Jason Pearson

Licensed under the Apache License, Version 2.0
https://www.apache.org/licenses/LICENSE-2.0
```
