# System tray lookFor

<kbd>✅ Implemented</kbd> <kbd>🧪 Tested</kbd>

> **Current state:** `systemTray` MCP tool is fully implemented with open/find/tap/dismiss/clearAll actions. See the [Status Glossary](../../status-glossary.md) for chip definitions.

## Goal

Enable agents to open the notification shade and wait for a matching
notification by text.

## MCP tool

```typescript
systemTray({
  action: "open" | "find" | "tap" | "dismiss" | "clearAll",
  notification?: {
    title?: string,
    body?: string,
    appId?: string,
    tapActionLabel?: string
  },
  awaitTimeout?: number
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

1. Add `systemTray` with open/find/tap/dismiss/clearAll actions.
2. Use accessibility node search to match notification text.
3. Return structured match details for action chaining.

## Risks

- OEM System UI layouts vary; emulator support may be the reliable baseline.
- Requires AccessibilityService access to System UI nodes.
