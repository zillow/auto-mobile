# AutoMobile Xcode Source Editor Extension

Xcode Source Editor Extension for AutoMobile automation integration.

## Overview

The Xcode Extension provides editor commands for working with AutoMobile automation plans directly within Xcode:

- Generate YAML plan templates
- Execute plans from editor
- Open AutoMobile Companion app
- Start/stop test recording
- Quick access to automation features

## Architecture

Based on the design documented in `docs/design-docs/plat/ios/ide-plugin/overview.md`, this extension:

1. Runs as an Xcode Source Editor Extension
2. Provides menu commands in Xcode's Editor menu
3. Communicates with Companion app via distributed notifications
4. Supports plan template generation and execution
5. Integrates with recording workflow

## Commands

### Generate Plan Template
- **Command**: Generate AutoMobile Plan Template
- **Action**: Inserts a YAML plan template at cursor position
- **Usage**: Place cursor where you want the template, then invoke command

### Execute Plan
- **Command**: Execute AutoMobile Plan
- **Action**: Sends current file to Companion app for execution
- **Usage**: Open a YAML plan file, then invoke command

### Open Companion
- **Command**: Open AutoMobile Companion
- **Action**: Launches or activates the Companion app
- **Usage**: Quick access to Companion app from Xcode

### Start/Stop Recording
- **Commands**: Start/Stop AutoMobile Recording
- **Action**: Controls test recording via Companion app
- **Usage**: Start recording, perform actions in simulator, stop to generate plan

## Communication

The extension communicates with the Companion app using macOS distributed notifications:

- `com.automobile.execute-plan`: Execute a plan file
- `com.automobile.start-recording`: Start recording
- `com.automobile.stop-recording`: Stop recording

## Installation

1. Build the extension as part of the Companion app bundle
2. Enable the extension in System Preferences → Extensions → Xcode Source Editor
3. Restart Xcode to see the commands in Editor menu

## Building

```bash
# Build the extension
swift build

# Run tests
swift test
```

Note: The extension must be code-signed and bundled within a macOS app (the Companion app) to be used in Xcode.

## Usage in Xcode

1. Open Xcode
2. Navigate to Editor menu
3. Look for AutoMobile commands
4. Select desired command

Keyboard shortcuts can be configured in Xcode → Preferences → Key Bindings.

## Development Status

**MVP Scaffold** - This is a minimal viable product scaffold with:
- Complete Xcode extension structure
- Five editor commands implemented
- Communication with Companion app
- Plan template generation
- Test scaffolding

**Next Steps:**
- Bundle extension with Companion app
- Add code signing configuration
- Implement YAML syntax validation
- Add context-aware command availability
- Add keyboard shortcut defaults
- Add comprehensive test coverage
- Create Xcode project for extension distribution

## Requirements

- macOS 13.0 or later
- Xcode 15.0 or later
- AutoMobile Companion app installed
