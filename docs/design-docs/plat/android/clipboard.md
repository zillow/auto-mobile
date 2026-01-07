# Clipboard tool

## Goal

Provide clipboard copy/paste/clear/get for Android 29/35 emulators and
best-effort support on devices.

## Proposed MCP tool

```
clipboard({
  action: "copy" | "paste" | "clear" | "get",
  text?: string
})
```

## Android implementation

Primary path (API 29/35 if supported):

- `adb -s <device> shell cmd clipboard set "<text>"`
- `adb -s <device> shell cmd clipboard get`
- `adb -s <device> shell cmd clipboard clear`

Capability probe:

- `adb -s <device> shell cmd clipboard help`

Fallback path (helper APK):

- Helper app exposes a broadcast receiver or bound service to set/read
  the clipboard via `ClipboardManager`.
- AutoMobile reads results via file or socket for `get`.

Notes:

- Newer Android versions restrict clipboard reads for background apps.
  The helper should run in the foreground when possible.

## Plan

1. Implement adb `cmd clipboard` support with capability detection.
2. Add helper APK fallback for consistent behavior.

## Risks

- Clipboard reads may be blocked on physical devices without foreground UI.
- Service call clipboard APIs are unstable across OEMs.
