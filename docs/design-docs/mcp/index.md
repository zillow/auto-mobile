# Overview

The MCP server exposes AutoMobile's capabilities as tool calls, resources, and real-time observations.

## Core Capabilities

- 🤖 **Fast UX Inspection** Kotlin [Accessibility Service](../plat/android/accessibility-service.md) and Swift [XCTestService](../plat/ios/xctestservice.md) to enable fast, accurate observations. 10x faster than the next fastest observation toolkit.
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

## Transport Modes

| Mode | Use Case |
|------|----------|
| 💻 **STDIO** (default) | Workstations, CI automation |
| 🌐 **Streamable HTTP** | Hot reload development, HTTP-only clients |

See [installation](../../install.md) for detailed configuration options.
