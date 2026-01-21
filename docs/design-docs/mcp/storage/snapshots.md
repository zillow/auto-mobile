# Device State Snapshots

## Overview

The snapshot feature provides deterministic device state management for mobile testing. It supports Android device/emulator snapshots and iOS simulator app container backups to enable reproducible test environments and efficient parallel testing.

## Features

- **VM Snapshots for Emulators**: Instant snapshot/restore using Android emulator's built-in snapshot feature
- **ADB-based Snapshots**: Portable snapshots for both emulators and physical devices
- **iOS App Container Backups**: Portable app-scoped snapshots for iOS simulators
- **Auto-generated Naming**: Automatic timestamp-based snapshot names with optional custom naming
- **Comprehensive State Capture**: Includes app data, system settings, package list, and foreground app state
- **Host-based Storage**: Snapshots stored in `~/.automobile/snapshots/` for fast access and easy management

## MCP Tool

### deviceSnapshot

Capture or restore device snapshots.

**Parameters:**
- `action` (required): `"capture"` or `"restore"`
- `snapshotName` (capture: optional, restore: required): Name for the snapshot
- `includeAppData` (capture only): Include app data directories in snapshot
- `includeSettings` (capture only): Include system settings (global/secure/system)
- `useVmSnapshot` (capture/restore): Use emulator VM snapshot if available (faster for emulators)
- `vmSnapshotTimeoutMs` (capture/restore): Timeout in milliseconds for emulator VM snapshot commands
- `strictBackupMode` (capture only): If true, fail entire snapshot if app data backup fails or times out
- `backupTimeoutMs` (capture only): Timeout in milliseconds for adb backup user confirmation
- `userApps` (capture only): Which apps to backup - `"current"` (foreground app only) or `"all"` (all user-installed apps)
- `appBundleIds` (capture only): iOS bundle IDs to include in app container backups
- `sessionUuid` (optional): Session UUID for multi-device targeting
- `device` (optional): Device label for multi-device control

**Capture response:**
```json
{
  "message": "Snapshot 'Pixel_5_2026-01-08_12-30-45' captured successfully",
  "snapshotName": "Pixel_5_2026-01-08_12-30-45",
  "snapshotType": "vm",
  "timestamp": "2026-01-08T12:30:45.123Z",
  "deviceId": "emulator-5554",
  "deviceName": "Pixel_5",
  "manifest": { ... },
  "evictedSnapshotNames": ["older-snapshot"]
}
```

**Restore response:**
```json
{
  "message": "Snapshot 'clean-state-before-login-test' restored successfully",
  "snapshotName": "clean-state-before-login-test",
  "snapshotType": "vm",
  "restoredAt": "2026-01-08T12:35:00.456Z",
  "deviceId": "emulator-5554",
  "deviceName": "Pixel_5"
}
```

**Examples:**
```javascript
// Capture with auto-generated name
await deviceSnapshot({ action: "capture" });

// Capture with custom name
await deviceSnapshot({
  action: "capture",
  snapshotName: "clean-state-before-login-test"
});

// Restore a snapshot
await deviceSnapshot({
  action: "restore",
  snapshotName: "clean-state-before-login-test"
});
```

## MCP Resources

### automobile:deviceSnapshots/archive

List archived device snapshots.

**Returns:**
```json
{
  "snapshots": [
    {
      "snapshotName": "Pixel_5_2026-01-08_12-30-45",
      "deviceId": "emulator-5554",
      "deviceName": "Pixel_5",
      "platform": "android",
      "snapshotType": "vm",
      "includeAppData": true,
      "includeSettings": true,
      "createdAt": "2026-01-08T12:30:45.123Z",
      "lastAccessedAt": "2026-01-08T12:30:45.123Z",
      "sizeBytes": 47448064,
      "sizeLabel": "45.23 MB"
    }
  ],
  "count": 1,
  "totalSizeBytes": 47448064,
  "maxArchiveSizeMb": 100
}
```bash

## Configuration

Device snapshot defaults can be read or updated via the Unix socket at `~/.auto-mobile/device-snapshot.sock`.

**Defaults:**
- `includeAppData`: `true`
- `includeSettings`: `true`
- `useVmSnapshot`: `true`
- `strictBackupMode`: `false`
- `backupTimeoutMs`: `30000`
- `userApps`: `"current"`
- `vmSnapshotTimeoutMs`: `30000`
- `maxArchiveSizeMb`: `100`

## Snapshot Types

### VM Snapshots (Emulators Only)

**Pros:**
- Instant snapshot capture and restoration
- Complete system state including RAM
- No need to clear app data individually

**Cons:**
- Only works with Android emulators
- Requires emulator console access

**Technical Details:**
- Uses `adb emu avd snapshot save/load` commands
- Emulator replies with `OK` or `KO: <reason>` (missing `OK` is treated as failure)
- Commands time out after 30000ms by default (configurable via `vmSnapshotTimeoutMs`)
- Snapshots stored in emulator's AVD directory (typically `~/.android/avd/<avd>.avd/snapshots/`)
- Metadata stored in `~/.automobile/snapshots/` for management

### ADB Snapshots (All Devices)

**Pros:**
- Works with both emulators and physical devices
- Portable across device types
- Fine-grained control over what gets captured

**Cons:**
- Slower than VM snapshots
- Requires clearing app data individually
- App data backup requires root access or user confirmation

**What Gets Captured:**
- Package list (`pm list packages`)
- System settings (global/secure/system via `settings list`)
- Foreground app state
- App data via `adb backup`:
  - Only user-installed apps (system apps excluded)
  - Only apps that allow backup (`android:allowBackup="true"`)
  - Defaults to current foreground app only (`userApps: "current"`)
  - Can backup all user apps with `userApps: "all"`
  - Requires user confirmation on device (30s timeout by default)
  - Apps with `android:allowBackup="false"` are automatically skipped

**What Gets Restored:**
- Clears app data for all packages via `pm clear`
- Restores system settings via `settings put`
- Restores app data via `adb restore` (if backup was successful)
  - Requires user confirmation on device (30s timeout by default)
  - Only restores apps that were successfully backed up
- Relaunches foreground app

### iOS App Container Backups (Current)

**Pros:**
- Portable between dev machines
- Captures only the target app's container for focused reproduction

**Cons:**
- Does not include system settings, keychain, or other app state
- Requires explicit bundle IDs for the target app(s)

**Technical Details:**
- Uses `xcrun simctl get_app_container <udid> <bundleId> data`
- Copies `Documents/`, `Library/`, and `tmp/` for each bundle ID
- Snapshot type is `app_data`
- Simulator-wide `simctl snapshot` is intentionally not used for portability

## Storage Location

Snapshot payloads are stored in `~/.automobile/snapshots/` (ADB snapshots), and metadata is tracked in SQLite at `~/.auto-mobile/auto-mobile.db`:

```text
~/.automobile/snapshots/
├── Pixel_5_2026-01-08_12-30-45/
│   ├── settings.json          # Device settings (ADB snapshots only)
│   └── app_data/              # App data directory (ADB snapshots only)
│       ├── packages.txt       # List of installed packages
│       └── backup.ab          # ADB backup file (if backup succeeded)
└── another-snapshot/
    └── ...
```

VM snapshots themselves are stored in the emulator AVD directory and persist across emulator restarts. Automatic cleanup removes AutoMobile metadata and host snapshot payloads, but does not delete the emulator's VM snapshot.

iOS app container backups are stored per simulator device ID:

```text
~/.automobile/snapshots/ios/
└── <device-udid>/
    └── <snapshot-name>/
        ├── metadata.json
        └── app-data/
            └── <bundle-id>/
                ├── Documents/
                ├── Library/
                └── tmp/
```

## Use Cases

### 1. Deterministic Testing

Eliminate state pollution between test runs by starting each test from an identical snapshot:

```javascript
// Setup: Capture clean state
await deviceSnapshot({ action: "capture", snapshotName: "clean-base-state" });

// Before each test
await deviceSnapshot({ action: "restore", snapshotName: "clean-base-state" });

// Run test...
```

### 2. Parallel Testing

Run multiple tests in parallel with each starting from the same snapshot:

```javascript
// Create base snapshot once
await deviceSnapshot({ action: "capture", snapshotName: "test-base" });

// In parallel test runners
await Promise.all([
  runTest1(() => deviceSnapshot({ action: "restore", snapshotName: "test-base" })),
  runTest2(() => deviceSnapshot({ action: "restore", snapshotName: "test-base" })),
  runTest3(() => deviceSnapshot({ action: "restore", snapshotName: "test-base" }))
]);
```

### 3. Debugging

Save device state before a failure occurs, then restore and debug:

```javascript
try {
  // Test code that might fail
  await runComplexTest();
} catch (error) {
  // Capture state at failure point
  await deviceSnapshot({ action: "capture", snapshotName: "failure-state" });
  throw error;
}

// Later, restore and debug
await deviceSnapshot({ action: "restore", snapshotName: "failure-state" });
```

### 4. Regression Detection

Compare snapshots across app versions to detect unintended changes:

```javascript
// Version 1.0
await deviceSnapshot({ action: "capture", snapshotName: "v1.0-baseline" });

// Version 1.1
await deviceSnapshot({ action: "capture", snapshotName: "v1.1-baseline" });

// Compare manifests programmatically
const v1 = await loadManifest("v1.0-baseline");
const v2 = await loadManifest("v1.1-baseline");
```bash

## App Data Backup Details

### How It Works

The ADB snapshot feature uses Android's native `adb backup` and `adb restore` commands to capture and restore app data:

1. **Filtering**: Only user-installed apps are backed up (system apps are excluded)
2. **Backup Eligibility**: Apps must have `android:allowBackup="true"` in their manifest
3. **Scope**: By default, only the current foreground app is backed up (`userApps: "current"`)
4. **User Confirmation**: The device will prompt the user to confirm the backup/restore operation
5. **Timeout**: If the user doesn't confirm within 30 seconds (configurable), the backup continues without app data

### Backup Metadata

The snapshot manifest includes detailed backup information:

```json
{
  "appDataBackup": {
    "backupFile": "backup.ab",
    "backupMethod": "adb_backup",
    "totalPackages": 150,
    "backedUpPackages": ["com.example.app"],
    "skippedPackages": ["com.example.nobackup"],
    "failedPackages": [],
    "backupTimedOut": false
  }
}
```

### Backup Modes

**Current App Only (default)**:
```javascript
await deviceSnapshot({
  action: "capture",
  userApps: "current",  // Only backup foreground app
  includeAppData: true
});
```

**All User Apps**:
```javascript
await deviceSnapshot({
  action: "capture",
  userApps: "all",  // Backup all user-installed apps
  includeAppData: true
});
```

**Strict Mode** (fail if backup times out):
```javascript
await deviceSnapshot({
  action: "capture",
  strictBackupMode: true,  // Fail entire snapshot if backup fails
  backupTimeoutMs: 60000   // Wait 60 seconds for user confirmation
});
```

### Limitations

- **User Confirmation Required**: Cannot automate without user interaction
- **allowBackup Flag**: Apps with `android:allowBackup="false"` cannot be backed up
- **APKs Not Included**: Only app data is backed up, not the APK files themselves
- **Timeout**: If user doesn't confirm, snapshot continues without app data (unless strictBackupMode is enabled)

## Limitations

- **Android + iOS Simulator Only**: iOS snapshots are app container backups for simulators
- **App Data Backup**: Requires user confirmation on device for each backup/restore operation
- **VM Snapshots**: Only available for emulators, not physical devices
- **Storage Space**: Snapshots can be large (especially VM snapshots), manage storage accordingly
- **Backup Scope**: By default, only current app is backed up (set `userApps: "all"` for all apps)
- **iOS Simulator Snapshot**: `simctl snapshot` is intentionally not used; app container backups are the current choice

## Performance

- **VM Snapshot Capture**: ~2-5 seconds
- **VM Snapshot Restore**: ~3-8 seconds (includes emulator stabilization)
- **ADB Snapshot Capture**: ~10-30 seconds (depends on number of apps and settings)
- **ADB Snapshot Restore**: ~15-45 seconds (depends on number of apps to clear)
- **iOS App Container Backup**: Varies with app data size

## Best Practices

1. **Use VM Snapshots for Emulators**: Significantly faster than ADB snapshots
2. **Manage Archive Size**: Automatic cleanup enforces `maxArchiveSizeMb` (adjust via the device snapshot socket config)
3. **Descriptive Names**: Use meaningful snapshot names for easier management
4. **Base Snapshots**: Create a "golden" base snapshot and restore from it
5. **Device Matching**: Ensure snapshots are restored to compatible devices (same platform)

## Troubleshooting

### Snapshot Capture Fails

- Verify device is connected and responsive
- For VM snapshots, ensure emulator console is accessible
- If VM snapshot commands time out, increase `vmSnapshotTimeoutMs` or restart the emulator
- If the emulator reports an unknown command, update the emulator to a version that supports snapshots
- Check available disk space in `~/.automobile/snapshots/`

### Snapshot Restore Fails

- Verify snapshot exists using the `automobile:deviceSnapshots/archive` resource
- Check platform compatibility (snapshot vs device)
- For VM snapshots, ensure emulator is running
- If the emulator reports device offline, reconnect or restart the emulator

### Snapshot Too Large

- Disable `includeAppData` for smaller snapshots
- Use ADB snapshots instead of VM snapshots
- Adjust `maxArchiveSizeMb` to control archive size
