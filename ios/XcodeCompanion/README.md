# AutoMobile Xcode Companion

macOS companion app for AutoMobile IDE integration with Xcode.

## Overview

The Xcode Companion is a native macOS application that provides a rich UI for iOS automation development:

- Device and simulator management
- Test plan recording workflow
- Plan execution with live logs
- Performance metrics and graphs
- Feature flags configuration
- Menu bar quick actions
- MCP transport management

## Architecture

Based on the design documented in `docs/design-docs/plat/ios/ide-plugin/overview.md`, this app:

1. Runs as a standalone macOS application
2. Provides SwiftUI-based UI for all automation features
3. Manages MCP connection via multiple transport options
4. Integrates with Xcode Source Editor Extension
5. Supports test recording and YAML plan generation

## Features

### Device Management
- List iOS simulators and devices
- View device status and runtime information
- Boot/shutdown simulators

### Test Recording
- Start/stop recording workflow
- Capture taps, swipes, and input events
- Generate executable YAML plans
- Export plans to files

### Plan Execution
- Execute YAML plans via MCP
- View live execution logs
- Track step-by-step progress

### Performance Monitoring
- Visualize test performance metrics
- Track timing history
- Identify bottlenecks

### MCP Transport
Transport priority order:
1. `AUTOMOBILE_MCP_STDIO_COMMAND` environment variable (stdio)
2. Unix socket fallback at `/tmp/auto-mobile-daemon-<uid>.sock`

## Building

```bash
# Build the application
swift build

# Run tests
swift test

# Build for macOS
xcodebuild -scheme AutoMobileCompanion -destination 'platform=macOS'
```

## Running

```bash
# Run the app
swift run AutoMobileCompanion

# Or build and run via Xcode
open XcodeCompanion.xcodeproj
```

## Configuration

Settings are available via macOS Settings panel:

- **MCP Endpoint**: Configure MCP server URL
- **Auto-connect**: Connect to MCP on launch
- **Recording Options**: Configure recording behavior
- **Execution Options**: Configure execution logging

## Menu Bar Integration

The app includes a menu bar icon for quick access:

- Show/hide companion window
- Start/stop recording
- Quick actions
- Quit application

## Development Status

**MVP Scaffold** - This is a minimal viable product scaffold with:
- Complete SwiftUI application structure
- Navigation and tab-based UI
- Device management view
- Recording view with event capture
- Execution view with logs
- Performance view placeholder
- Feature flags view placeholder
- Settings panel
- Menu bar integration
- MCP connection manager
- Test scaffolding

**Next Steps:**
- Implement MCP client integration
- Add real device listing via simctl
- Implement recording capture logic
- Add YAML plan generation
- Implement plan execution
- Add performance graph rendering
- Add comprehensive test coverage
- Create Xcode project for app distribution
