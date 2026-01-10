# Device State Snapshot & Restore

## Overview

The snapshot feature provides deterministic device state management for mobile testing. It allows you to capture the complete state of an Android device or emulator and restore it later, enabling reproducible test environments and efficient parallel testing.

## Features

- **VM Snapshots for Emulators**: Instant snapshot/restore using Android emulator's built-in snapshot feature
- **ADB-based Snapshots**: Portable snapshots for both emulators and physical devices
- **Auto-generated Naming**: Automatic timestamp-based snapshot names with optional custom naming
- **Comprehensive State Capture**: Includes app data, system settings, package list, and foreground app state
- **Host-based Storage**: Snapshots stored in `~/.automobile/snapshots/` for fast access and easy management

## MCP Tools

### captureDeviceSnapshot

Capture the current device state as a snapshot.

**Parameters:**
- `snapshotName` (optional): Custom name for the snapshot (auto-generated if not provided)
- `includeAppData` (optional, default: true): Include app data directories in snapshot
- `includeSettings` (optional, default: true): Include system settings (global/secure/system)
- `useVmSnapshot` (optional, default: true): Use emulator VM snapshot if available (faster for emulators)
- `vmSnapshotTimeoutMs` (optional, default: 30000): Timeout in milliseconds for emulator VM snapshot commands
- `strictBackupMode` (optional, default: false): If true, fail entire snapshot if app data backup fails or times out
- `backupTimeout` (optional, default: 30000): Timeout in milliseconds for adb backup user confirmation
- `userApps` (optional, default: "current"): Which apps to backup - "current" (foreground app only) or "all" (all user-installed apps)
- `sessionUuid` (optional): Session UUID for multi-device targeting
- `device` (optional): Device label for multi-device control

**Returns:**
```json
{
  "message": "Snapshot 'Pixel_5_2026-01-08_12-30-45' captured successfully",
  "snapshotName": "Pixel_5_2026-01-08_12-30-45",
  "snapshotType": "vm",
  "timestamp": "2026-01-08T12:30:45.123Z",
  "deviceId": "emulator-5554",
  "deviceName": "Pixel_5",
  "manifest": { ... }
}
```

**Example:**
```javascript
// Capture with auto-generated name
await captureDeviceSnapshot({});

// Capture with custom name
await captureDeviceSnapshot({
  snapshotName: "clean-state-before-login-test"
});

// Capture with ADB method (for physical devices or when VM snapshot not desired)
await captureDeviceSnapshot({
  snapshotName: "physical-device-state",
  useVmSnapshot: false
});
```

### restoreDeviceSnapshot

Restore device to a previously captured snapshot state.

**Parameters:**
- `snapshotName` (required): Name of the snapshot to restore
- `useVmSnapshot` (optional, default: true): Use emulator VM snapshot if available
- `vmSnapshotTimeoutMs` (optional, default: 30000): Timeout in milliseconds for emulator VM snapshot commands
- `sessionUuid` (optional): Session UUID for multi-device targeting
- `device` (optional): Device label for multi-device control

**Returns:**
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

**Example:**
```javascript
// Restore a snapshot
await restoreDeviceSnapshot({
  snapshotName: "clean-state-before-login-test"
});
```

### listSnapshots

List all available snapshots, optionally filtered by device ID.

**Parameters:**
- `deviceId` (optional): Filter snapshots by device ID
- `sessionUuid` (optional): Session UUID for multi-device targeting
- `device` (optional): Device label for multi-device control

**Returns:**
```json
{
  "message": "Found 3 snapshot(s)",
  "snapshots": [
    {
      "snapshotName": "Pixel_5_2026-01-08_12-30-45",
      "timestamp": "2026-01-08T12:30:45.123Z",
      "deviceId": "emulator-5554",
      "deviceName": "Pixel_5",
      "snapshotType": "vm",
      "size": "45.23 MB"
    },
    ...
  ],
  "count": 3,
  "deviceId": "emulator-5554"
}
```

**Example:**
```javascript
// List all snapshots
await listSnapshots({});

// List snapshots for specific device
await listSnapshots({
  deviceId: "emulator-5554"
});
```

### deleteSnapshot

Delete a snapshot permanently.

**Parameters:**
- `snapshotName` (required): Name of the snapshot to delete
- `sessionUuid` (optional): Session UUID for multi-device targeting
- `device` (optional): Device label for multi-device control

**Returns:**
```json
{
  "message": "Snapshot 'old-snapshot' deleted successfully",
  "snapshotName": "old-snapshot"
}
```

**Example:**
```javascript
await deleteSnapshot({
  snapshotName: "old-snapshot"
});
```

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

## Storage Location

Snapshots are stored in `~/.automobile/snapshots/` with the following structure:

```
~/.automobile/snapshots/
├── Pixel_5_2026-01-08_12-30-45/
│   ├── manifest.json          # Snapshot metadata (includes backup status)
│   ├── settings.json          # Device settings (ADB snapshots only)
│   └── app_data/              # App data directory (ADB snapshots only)
│       ├── packages.txt       # List of installed packages
│       └── backup.ab          # ADB backup file (if backup succeeded)
└── another-snapshot/
    └── ...
```

VM snapshots themselves are stored in the emulator AVD directory and persist across emulator restarts. Deleting a snapshot via `deleteSnapshot` removes AutoMobile metadata but does not delete the emulator's VM snapshot.

## Use Cases

### 1. Deterministic Testing

Eliminate state pollution between test runs by starting each test from an identical snapshot:

```javascript
// Setup: Capture clean state
await captureDeviceSnapshot({ snapshotName: "clean-base-state" });

// Before each test
await restoreDeviceSnapshot({ snapshotName: "clean-base-state" });

// Run test...
```

### 2. Parallel Testing

Run multiple tests in parallel with each starting from the same snapshot:

```javascript
// Create base snapshot once
await captureDeviceSnapshot({ snapshotName: "test-base" });

// In parallel test runners
await Promise.all([
  runTest1(() => restoreDeviceSnapshot({ snapshotName: "test-base" })),
  runTest2(() => restoreDeviceSnapshot({ snapshotName: "test-base" })),
  runTest3(() => restoreDeviceSnapshot({ snapshotName: "test-base" }))
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
  await captureDeviceSnapshot({ snapshotName: "failure-state" });
  throw error;
}

// Later, restore and debug
await restoreDeviceSnapshot({ snapshotName: "failure-state" });
```

### 4. Regression Detection

Compare snapshots across app versions to detect unintended changes:

```javascript
// Version 1.0
await captureDeviceSnapshot({ snapshotName: "v1.0-baseline" });

// Version 1.1
await captureDeviceSnapshot({ snapshotName: "v1.1-baseline" });

// Compare manifests programmatically
const v1 = await loadManifest("v1.0-baseline");
const v2 = await loadManifest("v1.1-baseline");
```

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
await captureDeviceSnapshot({
  userApps: "current",  // Only backup foreground app
  includeAppData: true
});
```

**All User Apps**:
```javascript
await captureDeviceSnapshot({
  userApps: "all",  // Backup all user-installed apps
  includeAppData: true
});
```

**Strict Mode** (fail if backup times out):
```javascript
await captureDeviceSnapshot({
  strictBackupMode: true,  // Fail entire snapshot if backup fails
  backupTimeout: 60000     // Wait 60 seconds for user confirmation
});
```

### Limitations

- **User Confirmation Required**: Cannot automate without user interaction
- **allowBackup Flag**: Apps with `android:allowBackup="false"` cannot be backed up
- **APKs Not Included**: Only app data is backed up, not the APK files themselves
- **Timeout**: If user doesn't confirm, snapshot continues without app data (unless strictBackupMode is enabled)

## Limitations

- **Android Only**: Currently only supports Android devices
- **App Data Backup**: Requires user confirmation on device for each backup/restore operation
- **VM Snapshots**: Only available for emulators, not physical devices
- **Storage Space**: Snapshots can be large (especially VM snapshots), manage storage accordingly
- **Backup Scope**: By default, only current app is backed up (set `userApps: "all"` for all apps)

## Performance

- **VM Snapshot Capture**: ~2-5 seconds
- **VM Snapshot Restore**: ~3-8 seconds (includes emulator stabilization)
- **ADB Snapshot Capture**: ~10-30 seconds (depends on number of apps and settings)
- **ADB Snapshot Restore**: ~15-45 seconds (depends on number of apps to clear)

## Best Practices

1. **Use VM Snapshots for Emulators**: Significantly faster than ADB snapshots
2. **Clean Up Old Snapshots**: Use `deleteSnapshot` to remove unused snapshots
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

- Verify snapshot exists using `listSnapshots`
- Check platform compatibility (snapshot vs device)
- For VM snapshots, ensure emulator is running
- If the emulator reports device offline, reconnect or restart the emulator

### Snapshot Too Large

- Disable `includeAppData` for smaller snapshots
- Use ADB snapshots instead of VM snapshots
- Regularly clean up old snapshots
