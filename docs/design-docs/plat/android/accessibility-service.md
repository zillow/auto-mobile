# Android Accessibility Service

The Android Accessibility Service provides real-time access to view hierarchy data and user interface
elements without requiring device rooting or special permissions beyond accessibility service enablement.
This service acts as a bridge between the Android system's accessibility framework and AutoMobile's
automation capabilities. When enabled, the accessibility service continuously monitors UI changes and
provides detailed information about view hierarchies. It writes the latest hierarchy to app-private
storage and can stream updates over WebSocket for the MCP Server/Daemon to consume.

## Setup and Enablement

AutoMobile uses a **settings-based approach** to enable the accessibility service programmatically via ADB commands. This method is fast, reliable, and eliminates the need for UI-based navigation through Android Settings.

### Toggle Methods (Settings vs Manual UI)

AutoMobile has one automated toggle path and one manual fallback:

- **Settings-based (ADB secure settings)**: Default when the device allows programmatic changes.
- **Manual UI enablement**: Used only when settings-based commands are not supported or are denied.

AutoMobile does not automate the Settings UI. If the settings-based toggle fails or is unsupported, the setup flow returns an error and you must enable the service manually.

### Settings-Based Toggle

The accessibility service is enabled by modifying Android secure settings via ADB:

1. **Reading current services**: Query `enabled_accessibility_services` to preserve existing services
2. **Appending AutoMobile service**: Add the AutoMobile service component to the colon-separated list
3. **Enabling globally**: Set `accessibility_enabled` to `1`

This approach:
- Preserves other enabled accessibility services
- Works on emulators without special permissions
- Completes in milliseconds by avoiding Settings UI and animations
- Avoids flaky UI automation and Settings screen layout changes

### Manual UI Enablement (Fallback)

If settings-based toggling is unavailable or denied:

1. Open Settings > Accessibility
2. Select AutoMobile Accessibility Service
3. Toggle On and confirm prompts

This is the only fallback path; AutoMobile does not drive these UI steps programmatically.

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

### Physical Device Limitations

Most physical devices block `settings put secure` unless the device is rooted, configured as device owner, or grants special shell permissions. When those privileges are missing, settings-based toggling fails with permission errors and manual enablement is required.

### Error Handling

The setup process provides categorized error messages for common failure scenarios:

- **Permission errors**: Indicates the device requires root, device owner status, or special shell permissions
- **Connection errors**: Device is offline, not found, or ADB is unresponsive
- **Timeout errors**: Device is taking too long to respond
- **Network errors**: Unable to download the accessibility service APK
- **Installation errors**: APK installation failed
- **Unsupported device**: Settings-based toggle not available on this device

Each error category includes the original error details for debugging while providing user-friendly context about what went wrong and potential remediation steps.

## API Reference (TypeScript)

The settings-toggle API lives in `src/utils/AccessibilityServiceManager.ts` and is implemented by `AndroidAccessibilityServiceManager`.

### ToggleCapabilities

`ToggleCapabilities` describes whether programmatic toggling is supported:

```ts
export type ToggleCapabilities = {
  supportsSettingsToggle: boolean;
  deviceType: "emulator" | "physical";
  apiLevel: number | null;
  reason?: string;
};
```

### `canUseSettingsToggle(): Promise<boolean>`

Returns `true` when settings-based toggling is supported. Returns `false` when capability detection fails or the device does not allow secure settings updates. This method does not throw.

### `getToggleCapabilities(): Promise<ToggleCapabilities>`

Returns detailed capability information, including a human-readable `reason` when the toggle is unsupported. This method does not throw; detection errors are reflected in the returned payload.

### `enableViaSettings(): Promise<void>`

Enables the service via `settings put secure`. Throws `Error` with categorized messages for:

- Permission denied (root/device owner/shell permissions required)
- Device connection loss or offline device
- Timeouts
- Other ADB or device-state failures

### `disableViaSettings(): Promise<void>`

Disables the service via `settings put secure`. Throws the same error categories as `enableViaSettings()`. It preserves other enabled services and only clears `accessibility_enabled` when no services remain.

### `enable(): Promise<void>`

Alias for settings-based enablement. There is no UI automation fallback.

### Example

```ts
// Inside the AutoMobile codebase.
const manager = AndroidAccessibilityServiceManager.getInstance(device, adb);
const capabilities = await manager.getToggleCapabilities();

if (!capabilities.supportsSettingsToggle) {
  throw new Error(capabilities.reason ?? "Settings-based toggle not supported");
}

await manager.enableViaSettings();
```

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

When device setup uses `skipAccessibilityDownload`, AutoMobile still validates the installed service checksum.
If the version is incompatible, it surfaces a warning/error advising you to rerun without
`skipAccessibilityDownload` to upgrade or install the matching APK manually.

## Troubleshooting

- **Settings toggle fails with permission denied**: Physical devices often require root, device owner status, or special shell permissions. Enable the service manually in Settings if you cannot grant those permissions.
- **Settings toggle fails with connection errors**: Verify `adb devices` shows the device as online and retry.
- **Force UI-based toggle**: AutoMobile does not automate UI toggling. Use manual Settings enablement as described above.
- **Service appears enabled but not detected**: Confirm the service component appears in `adb shell settings get secure enabled_accessibility_services`.

## Environment Variables

- `AUTOMOBILE_ACCESSIBILITY_APK_PATH`: Override APK source with a local file path.
- `AUTOMOBILE_SKIP_ACCESSIBILITY_CHECKSUM`: Skip checksum validation (development mode).
- `AUTO_MOBILE_ACCESSIBILITY_SERVICE_SHA_SKIP_CHECK` (deprecated): Legacy alias for skipping checksum validation.
- `AUTOMOBILE_SKIP_ACCESSIBILITY_DOWNLOAD_IF_INSTALLED`: Skip version check if the service is already installed.
- `AUTOMOBILE_ACCESSIBILITY_TOGGLE_METHOD`: Not supported; settings-based toggling is the only automated path.

See [GitHub Issue #483](https://github.com/kaeawc/auto-mobile/issues/483) for ongoing work to standardize environment variable naming.
