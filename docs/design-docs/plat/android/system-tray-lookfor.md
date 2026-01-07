# System tray lookFor (notifications)

## Goal

Enable agents to open the notification shade and wait for a matching
notification by text or resource ID.

## Proposed MCP tool

Option A (extend existing):

```
openSystemTray({
  lookFor?: { text?: string, resourceId?: string },
  timeoutMs?: number,
  pollIntervalMs?: number
})
```

Option B (new):

```
lookForNotification({
  text?: string,
  resourceId?: string,
  timeoutMs?: number
})
```

## Android implementation

Open/close the tray (preferred, emulator):

- `adb -s <device> shell cmd statusbar expand-notifications`
- `adb -s <device> shell cmd statusbar collapse`

Fallback (gesture):

- Swipe down from status bar if `cmd statusbar` is unavailable.

Finding notifications:

- Use AccessibilityService to read the System UI node tree.
- Search for a node with matching text or resource ID in
  `com.android.systemui`.
- Return bounding box + hierarchy path for use in follow-up taps.

## ADB validation (API 35)

Status:

- API 29 not validated yet (no local AVD available).

Confirmed commands:

- Expand/collapse notification shade:
  - `adb -s <device> shell cmd statusbar expand-notifications`
  - `adb -s <device> shell uiautomator dump /sdcard/notification_dump.xml`
  - `adb -s <device> shell cat /sdcard/notification_dump.xml`
  - `adb -s <device> shell cmd statusbar collapse`

Observed results:

- Notification shade expands and collapses on command.
- uiautomator dump contains notification text suitable for lookFor matching.

Notes:

- `adb shell cmd statusbar expand-settings` is also available to expand quick
  settings when needed.

## Plan

1. Add `lookFor` and timeout handling to tray open.
2. Use accessibility node search to match notifications.
3. Return structured match details for action chaining.

## Risks

- OEM System UI layouts vary; emulator support may be the reliable baseline.
- Requires AccessibilityService access to System UI nodes.
