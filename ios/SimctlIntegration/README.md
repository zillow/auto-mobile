# iOS Simctl Integration

TypeScript wrapper for iOS Simulator lifecycle and app management using `xcrun simctl`.

## Overview

The Simctl Integration provides a TypeScript interface to iOS Simulator operations, enabling:

- Simulator lifecycle management (boot, shutdown, erase)
- App lifecycle management (install, uninstall, launch, terminate)
- Device discovery and capability reporting
- Status bar configuration (demo mode)
- Screenshot and video recording
- File system operations

## Architecture

Based on the design documented in `docs/design-docs/plat/ios/simctl.md`, this component:

1. Wraps `xcrun simctl` command-line tool
2. Provides type-safe async APIs for all simulator operations
3. Integrates with the MCP server for device management
4. Supports parallel operations on multiple simulators

## Installation

```bash
cd ios/SimctlIntegration
bun install
bun run build
```

## Usage Example

```typescript
import { Simctl } from '@auto-mobile/simctl';

const simctl = new Simctl();

// List all simulators
const devices = await simctl.listDevices();
console.log(devices);

// Boot a simulator
const udid = 'YOUR-SIMULATOR-UDID';
await simctl.bootDevice(udid);

// Install an app
await simctl.installApp(udid, '/path/to/YourApp.app');

// Launch the app
await simctl.launchApp(udid, 'com.example.YourApp');

// Set status bar to demo mode
await simctl.setStatusBar(udid, {
  time: '9:41',
  batteryLevel: 100,
  batteryState: 'charged',
  wifiBars: 3,
  cellularBars: 4
});

// Take a screenshot
await simctl.screenshot(udid, '/tmp/screenshot.png');

// Terminate the app
await simctl.terminateApp(udid, 'com.example.YourApp');

// Shutdown simulator
await simctl.shutdownDevice(udid);
```

## API Reference

### Device Management

- `listDevices()`: List all available simulators
- `bootDevice(udid)`: Boot a simulator
- `shutdownDevice(udid)`: Shutdown a simulator
- `eraseDevice(udid)`: Erase all data from a simulator

### App Management

- `installApp(udid, appPath)`: Install an app
- `uninstallApp(udid, bundleId)`: Uninstall an app
- `launchApp(udid, bundleId, args?)`: Launch an app
- `terminateApp(udid, bundleId)`: Terminate an app
- `getAppStatus(udid, bundleId)`: Check if app is running

### Utilities

- `setStatusBar(udid, options)`: Configure status bar
- `clearStatusBar(udid)`: Clear status bar override
- `screenshot(udid, outputPath)`: Take a screenshot
- `recordVideo(udid, outputPath, options?)`: Record video
- `push(udid, sourcePath, destPath)`: Push file to simulator
- `openURL(udid, url)`: Open a URL

## System Requirements

- macOS 13.0 or later
- Xcode 15.0 or later
- Node.js 18+ or Bun 1.3.5+

## Development Status

**MVP Scaffold** - This is a minimal viable product scaffold with:
- Complete TypeScript implementation of simctl wrapper
- Type-safe interfaces for all operations
- Test scaffolding
- Build configuration

**Next Steps:**
- Add comprehensive test coverage
- Add error handling and retry logic
- Integrate with MCP server
- Add device capability detection
- Add parallel operation support
