# Android Accessibility Service

The Android Accessibility Service provides real-time access to view hierarchy data and user interface
elements without requiring device rooting or special permissions beyond accessibility service enablement.
This service acts as a bridge between the Android system's accessibility framework and AutoMobile's
automation capabilities. When enabled, the accessibility service continuously monitors UI changes and
provides detailed information about view hierarchies. It writes the latest hierarchy to app-private
storage and can stream updates over WebSocket for the MCP Server/Daemon to consume.

## Setup and Enablement

AutoMobile uses a **settings-based approach** to enable the accessibility service programmatically via ADB commands. This method is fast, reliable, and eliminates the need for UI-based navigation through Android Settings.

### Settings-Based Toggle

The accessibility service is enabled by modifying Android secure settings via ADB:

1. **Reading current services**: Query `enabled_accessibility_services` to preserve existing services
2. **Appending AutoMobile service**: Add the AutoMobile service component to the colon-separated list
3. **Enabling globally**: Set `accessibility_enabled` to `1`

This approach:
- Preserves other enabled accessibility services
- Works on emulators without special permissions
- Completes in milliseconds vs. seconds for UI-based approaches
- Provides consistent, reliable enablement

### Capability Detection

AutoMobile automatically detects whether settings-based toggling is supported on a device:

**Supported devices:**
- Android emulators (API 16+)
- Physical devices with root access
- Physical devices configured as device owner
- Devices with appropriate shell permissions

**Unsupported devices:**
- Standard physical devices without special permissions
- Devices below API level 16

The capability detection caches results during the session to avoid redundant device queries.

### Error Handling

The setup process provides categorized error messages for common failure scenarios:

- **Permission errors**: Indicates the device requires root, device owner status, or special shell permissions
- **Connection errors**: Device is offline, not found, or ADB is unresponsive
- **Timeout errors**: Device is taking too long to respond
- **Network errors**: Unable to download the accessibility service APK
- **Installation errors**: APK installation failed
- **Unsupported device**: Settings-based toggle not available on this device

Each error category includes the original error details for debugging while providing user-friendly context about what went wrong and potential remediation steps.

## Architecture

The accessibility service runs as a standard Android accessibility service that:

1. Monitors UI hierarchy changes in real-time
2. Extracts view properties and accessibility metadata
3. Writes hierarchy data to app-private storage for fast local access
4. Optionally streams updates via WebSocket for real-time observation
5. Provides accessibility identifiers and semantic information for reliable element targeting

## Version Management

AutoMobile manages accessibility service versions automatically:

- Compares installed APK checksum against expected release version
- Upgrades when version mismatch detected
- Falls back to reinstallation if upgrade fails
- Validates downloaded APKs via SHA256 checksum
- Supports local APK overrides for development

## Environment Variables

- `AUTOMOBILE_ACCESSIBILITY_APK_PATH`: Override APK source with local file path
- `AUTOMOBILE_SKIP_ACCESSIBILITY_CHECKSUM`: Skip checksum validation (development mode)
- `AUTOMOBILE_SKIP_ACCESSIBILITY_DOWNLOAD_IF_INSTALLED`: Skip version check if service is installed

See [GitHub Issue #483](https://github.com/kaeawc/auto-mobile/issues/483) for ongoing work to standardize environment variable naming.
