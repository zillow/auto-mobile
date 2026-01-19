# iOS

AutoMobile supports iOS simulator automation. Physical device support is coming soon.

## Prerequisites

- **macOS 13.0+** (Ventura or newer)
- **Xcode 15.0+** with Command Line Tools installed
- **Bun or Node.js** - see [requirements](../index.md#requirements)

## Setup

1. Install Xcode from the App Store
2. Install Command Line Tools: `xcode-select --install`
3. Configure AutoMobile with your MCP client (see [installation overview](../index.md))

## Limitations

- **macOS required** - iOS Simulator only runs on Mac
- **Simulator only** - Physical device support requires additional provisioning (tracked in [#912](https://github.com/kaeawc/auto-mobile/issues/912), [#913](https://github.com/kaeawc/auto-mobile/issues/913), [#914](https://github.com/kaeawc/auto-mobile/issues/914))
- **No Docker support** - iOS automation cannot run in containers

## Architecture

iOS automation uses native XCTest APIs through the XCTestService, which provides a WebSocket server for observations and touch injection. Simulator lifecycle is managed via `simctl`.

See the [iOS design doc](../../design-docs/plat/ios/index.md) for implementation details.

## What's next

Learn [how to use AutoMobile](../../using/ux-exploration.md)
