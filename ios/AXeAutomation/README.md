# iOS AXe Automation

Touch injection and automation layer for iOS simulators using macOS Accessibility APIs.

## Overview

The AXe Automation layer coordinates touch injection and MCP tool execution for iOS automation. It bridges the gap between the MCP server and iOS simulator by:

- Connecting to the iOS Accessibility Service via WebSocket
- Translating automation commands into touch/key events
- Injecting events into iOS Simulator using macOS accessibility APIs
- Managing deployment and lifecycle of the automation server

## Architecture

Based on the design documented in `docs/design-docs/plat/ios/axe-automation.md`, this component:

1. Runs on the macOS host (not inside iOS simulator)
2. Communicates with iOS Accessibility Service over WebSocket
3. Uses macOS CGEvent APIs to inject touches into iOS Simulator
4. Translates element bounds to screen coordinates
5. Supports deployment workflow (build, install, launch automation server)

## Key Components

- **AXeClient**: Main automation client for touch injection
- **WebSocketClient**: Communication layer with iOS Accessibility Service
- Touch injection via CGEvent APIs
- Coordinate translation from app space to simulator window space

## Building

```bash
# Build the package
swift build

# Run tests
swift test
```

## Usage Example

```swift
import AXeAutomation

let client = AXeClient(host: "localhost", port: 8080)

// Connect to iOS automation server
try await client.connect()

// Tap on an element
try await client.tap(elementId: "login-button")

// Tap at coordinates
try client.tap(at: CGPoint(x: 100, y: 200))

// Swipe gesture
try client.swipe(
    from: CGPoint(x: 100, y: 400),
    to: CGPoint(x: 100, y: 100),
    duration: 0.3
)

// Type text
try client.typeText("hello@example.com")

// Clean up
client.disconnect()
```

## Touch Injection Strategy

1. Query element bounds from Accessibility Service
2. Calculate center point of element
3. Translate coordinates to simulator window space
4. Inject CGEvent at calculated position
5. Post event to iOS Simulator process

## Development Status

**MVP Scaffold** - This is a minimal viable product scaffold with:
- Basic Swift Package Manager structure
- AXe client foundation
- WebSocket client for iOS communication
- Touch injection primitives
- Test scaffolding

**Next Steps:**
- Implement full coordinate translation logic
- Add simulator window detection and targeting
- Integrate with deployment workflow
- Add comprehensive test coverage
- Add error handling and retry logic
