# Overview

<kbd>✅ Implemented</kbd> <kbd>🧪 Tested</kbd>

> **Current state:** All capabilities described below are implemented and tested. See the [Status Glossary](../status-glossary.md) for chip definitions.

The MCP server exposes AutoMobile's capabilities as tool calls, resources, and real-time observations.

## Core Capabilities

- 🤖 **Fast UX Inspection** Kotlin [Accessibility Service](../plat/android/control-proxy.md) and Swift [XCTestService](../plat/ios/xctestservice.md) to enable fast, accurate observations. 10x faster than the next fastest observation toolkit.
- 🦾 **Full Touch Injection** Tap, Swipe, Pinch, Drag & Drop, Shake with automatic element targeting.
- ♻️ **Tool Feedback** [Observations](observe/index.md) drive the [interaction loop](interaction-loop.md) for all [tool calls](tools.md).
- 🧪 **Test Execution** [Kotlin JUnitRunner](../plat/android/junitrunner.md) & [Swift XCTestRunner](../plat/ios/xctestrunner.md) execute tests natively handling device pooling, multi-device tests, and automatically optimizing test timing.

## Additional Features

- 📹 **[Video recording](observe/video-recording.md)** Low-overhead capture for CI artifacts
- 💄 **[Visual Highlighting](observe/visual-highlighting.md)** Overlays for calling out important elements or regressions
- 📱 **[Device Snapshots](storage/snapshots.md)** Emulator Snapshots & Simulator App Containers
- 🗺️ **[Navigation graph](nav/index.md)** Automatic screen flow mapping
- ⚙️ **[Feature flags](feature-flags.md)** to gate debug or advanced features to be toggled at runtime in IDE integrations.
- 🦆 **[Migrations](storage/migrations.md)** Database & test plan schema management

## Transport

The MCP server uses **STDIO** transport (default). For hot reload development and IDE plugin integration, a background daemon process accepts connections via a Unix socket.

See [installation](../../install.md) for detailed configuration options.
