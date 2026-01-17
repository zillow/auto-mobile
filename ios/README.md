# iOS Platform Components

This directory contains all iOS-specific components for the AutoMobile automation platform.

## Overview

The iOS platform implementation provides native automation capabilities for iOS simulators and devices, featuring a hybrid architecture with WebSocket-based automation and macOS accessibility APIs for touch injection.

## Architecture

The iOS platform consists of the following components:

1. **Accessibility Service** - Native iOS automation server
2. **AXe Automation** - Touch injection layer for macOS
3. **Simctl Integration** - Simulator lifecycle management
4. **XCTest Runner** - Test execution framework
5. **Xcode Companion** - macOS companion app for IDE integration
6. **Xcode Extension** - Xcode source editor extension

For detailed architecture documentation, see `docs/design-docs/plat/ios/`.

## Components

### AccessibilityService

**Path**: `ios/AccessibilityService/`
**Type**: Swift Package (iOS app)
**Purpose**: Exposes accessibility tree over WebSocket

Native iOS application that runs on simulator or device, providing:
- WebSocket server for external automation clients
- Accessibility tree traversal and element lookup
- Element bounds for touch coordinate calculation
- View hierarchy updates on UI changes

```bash
cd ios/AccessibilityService
swift build
swift test
```

### AXeAutomation

**Path**: `ios/AXeAutomation/`
**Type**: Swift Package (macOS library)
**Purpose**: Touch injection and automation coordination

macOS library that bridges MCP commands to iOS simulator:
- WebSocket client for Accessibility Service
- Touch/key event injection via CGEvent APIs
- Coordinate translation from app space to simulator window
- Gesture simulation (tap, swipe, scroll)

```bash
cd ios/AXeAutomation
swift build
swift test
```

### SimctlIntegration

**Path**: `ios/SimctlIntegration/`
**Type**: TypeScript/Bun package
**Purpose**: iOS Simulator lifecycle and app management

TypeScript wrapper for `xcrun simctl`:
- Device discovery and capability reporting
- Simulator lifecycle (boot, shutdown, erase)
- App lifecycle (install, uninstall, launch, terminate)
- Status bar configuration and screenshot capture

```bash
cd ios/SimctlIntegration
bun install
bun run build
bun test
```

### XCTestRunner

**Path**: `ios/XCTestRunner/`
**Type**: Swift Package (iOS/macOS library)
**Purpose**: XCTest integration for plan execution

XCTest framework integration mirroring Android's JUnitRunner:
- `AutoMobileTestCase` base class for plan-based tests
- `AutoMobilePlanExecutor` with retry and cleanup logic
- XCTestObservation integration for timing data
- YAML plan parsing and MCP execution

```bash
cd ios/XCTestRunner
swift build
swift test
```

### XcodeCompanion

**Path**: `ios/XcodeCompanion/`
**Type**: Swift Package (macOS app)
**Purpose**: IDE companion application

Native macOS app providing:
- Device and simulator management UI
- Test recording workflow
- Plan execution with live logs
- Performance metrics and graphs
- Feature flags configuration
- Menu bar integration

```bash
cd ios/XcodeCompanion
swift build
swift run AutoMobileCompanion
```

### XcodeExtension

**Path**: `ios/XcodeExtension/`
**Type**: Swift Package (Xcode extension)
**Purpose**: Xcode source editor integration

Xcode Source Editor Extension providing:
- YAML plan template generation
- Plan execution from editor
- Recording controls
- Quick access to Companion app

```bash
cd ios/XcodeExtension
swift build
swift test
```

## System Requirements

- **macOS**: 13.0 (Ventura) or later
- **Xcode**: 15.0 or later
- **Swift**: 5.9 or later
- **Bun**: 1.3.5 or later
- **Node.js**: 18+ (alternative to Bun)

## Building All Components

### Quick Validation

```bash
# CI validation (suitable for CI/CD)
./scripts/ci/validate-ios.sh

# Local validation (includes tests and detailed output)
./scripts/local/validate-ios.sh
```

### Individual Components

```bash
# Build a specific component
./scripts/local/build-ios-component.sh AccessibilityService

# Test a specific component
./scripts/local/test-ios-component.sh AccessibilityService
```

### Manual Build

```bash
# Build all Swift components
for dir in ios/*/; do
  if [[ -f "$dir/Package.swift" ]]; then
    echo "Building $(basename $dir)..."
    (cd "$dir" && swift build)
  fi
done

# Build TypeScript components
cd ios/SimctlIntegration
bun install && bun run build
```

## Development Workflow

### 1. Local Development

```bash
# Validate all components build
./scripts/local/validate-ios.sh

# Work on specific component
cd ios/AccessibilityService
swift build
swift test

# Run companion app for UI testing
cd ios/XcodeCompanion
swift run AutoMobileCompanion
```

### 2. Integration Testing

```bash
# Start MCP server (in project root)
bun run dev

# Launch companion app
cd ios/XcodeCompanion
swift run AutoMobileCompanion

# Boot iOS simulator
xcrun simctl boot "iPhone 15 Pro"

# Install and launch AccessibilityService on simulator
# (requires Xcode project setup)
```

### 3. CI/CD Integration

The CI validation scripts are designed to run in GitHub Actions or other CI environments:

```yaml
# Example GitHub Actions step
- name: Validate iOS Components
  run: ./scripts/ci/validate-ios.sh
```

## Project Status

**Current Status**: MVP Scaffolds Complete

All components have been scaffolded with:
- ✅ Basic structure and architecture
- ✅ Core types and interfaces
- ✅ Build configuration (Package.swift, tsconfig.json)
- ✅ Test scaffolding
- ✅ README documentation
- ✅ CI/CD validation scripts

**Next Steps**:
1. Implement full WebSocket protocol in AccessibilityService
2. Add coordinate translation logic in AXeAutomation
3. Integrate YAML parsing in XCTestRunner
4. Connect MCP client in Companion and Runner
5. Create Xcode projects for app distribution
6. Add comprehensive test coverage
7. Add real iOS app integration examples

## Documentation

- **Design Docs**: `docs/design-docs/plat/ios/`
  - `index.md` - Architecture overview
  - `accessibility-service.md` - WebSocket automation server
  - `axe-automation.md` - Touch injection layer
  - `simctl.md` - Simulator lifecycle
  - `xctestrunner.md` - XCTest integration
  - `ide-plugin/overview.md` - Xcode companion and extension
  - `ide-plugin/test-recording.md` - Recording workflow

- **Installation**: `docs/install/plat/ios.md`

## Contributing

When contributing to iOS components:

1. Follow Swift style guidelines
2. Use SwiftUI for UI components
3. Keep TypeScript aligned with project standards
4. Add tests for new functionality
5. Update component README files
6. Run validation scripts before committing

## License

See the main project LICENSE file.
