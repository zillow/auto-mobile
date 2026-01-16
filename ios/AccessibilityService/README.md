# iOS Accessibility Service

Native iOS automation server that exposes the accessibility tree over WebSocket for automation and testing.

## Overview

The Accessibility Service is a core component of AutoMobile's iOS automation platform. It runs as a native iOS app and provides:

- WebSocket server for external automation clients
- Real-time accessibility tree exposure
- Element lookup by ID, text, and type
- Element bounds for touch injection
- View hierarchy updates on UI changes
- First responder and focus state tracking

## Architecture

Based on the design documented in `docs/design-docs/plat/ios/accessibility-service.md`, this service:

1. Runs as a native iOS app on simulator or device
2. Exposes accessibility tree via WebSocket (default port: 8080)
3. Supports commands for view hierarchy inspection and element lookup
4. Integrates with AXe automation layer for touch injection

## Building

```bash
# Build the package
swift build

# Run tests
swift test

# Build for iOS simulator
xcodebuild -scheme AccessibilityServiceApp -destination 'platform=iOS Simulator,name=iPhone 15'
```

## WebSocket Protocol

### Commands

**getViewHierarchy**
```json
{
  "command": "getViewHierarchy"
}
```

**findElement**
```json
{
  "command": "findElement",
  "params": {
    "id": "button-login"
  }
}
```

```json
{
  "command": "findElement",
  "params": {
    "text": "Submit"
  }
}
```

### Response Format

```json
{
  "id": "unique-element-id",
  "type": "UIButton",
  "text": "Submit",
  "bounds": {
    "x": 100,
    "y": 200,
    "width": 120,
    "height": 44
  },
  "isEnabled": true,
  "isFocused": false,
  "children": []
}
```

## Development Status

**MVP Scaffold** - This is a minimal viable product scaffold with:
- Basic Swift Package Manager structure
- Accessibility tree provider
- WebSocket server foundation
- Test scaffolding

**Next Steps:**
- Implement full WebSocket protocol
- Add view hierarchy change notifications
- Integrate with real iOS UI components
- Add comprehensive test coverage
- Add Xcode project for app deployment
