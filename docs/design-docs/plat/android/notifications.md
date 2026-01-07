# Notification triggering

## Goal

Trigger notifications that appear as the app-under-test. Provide
rich content (title, body, big text, big image, actions).

## Proposed MCP tool

```
postNotification({
  title: string,
  body: string,
  style?: "default" | "bigText" | "bigPicture",
  imagePath?: string,
  actions?: Array<{ label: string, actionId: string }>,
  channelId?: string
})
```

## Preferred path: AutoMobile SDK hook (app-under-test)

Add a debug-only SDK component that accepts a broadcast or bound-service
request and posts a notification from the target app process.

Suggested SDK entrypoint (app side):

```
AutoMobileNotifications.post(
  title,
  body,
  style,
  imagePath,
  actions
)
```

Implementation notes:

- Use `NotificationManager` / `NotificationCompat` with a known channel ID.
- When `style == bigPicture`, load from `imagePath` on device storage
  (e.g., `/sdcard/Download/automobile/`) or decode base64 payload.
- Actions should target a test-only activity or broadcast receiver.

## Fallback path (emulator only)

Use `cmd notification` for basic text notifications when SDK hooks are
not available (does not look like app-under-test).

- `adb -s <device> shell cmd notification post -S bigtext -t "Title" <tag> "Body"`
- Validate command support with `adb -s <device> shell cmd notification help`

This path should be flagged as `supported: partial` and discouraged
in tool descriptions.

## ADB validation (API 35)

Status:

- API 29 not validated yet (no local AVD available).

Confirmed commands:

- Post basic notification:
  - `adb -s <device> shell cmd notification post -t "Test Title" automobiledoc "Test Body"`
- Post big text notification:
  - `adb -s <device> shell cmd notification post -S bigtext -t "Big Title" automobiledoc "Big Body"`
- Inspect via system tray UI dump:
  - `adb -s <device> shell cmd statusbar expand-notifications`
  - `adb -s <device> shell uiautomator dump /sdcard/notification_dump.xml`
  - `adb -s <device> shell cat /sdcard/notification_dump.xml`
  - `adb -s <device> shell cmd statusbar collapse`

Observed results:

- Notifications appear with provided titles/bodies.
- Big text style renders expanded content in the shade.
- The uiautomator dump includes the notification text for matching.
- Multi-word titles appear truncated in the grouped list view (first token),
  but full text is present in the dump.

## Plan

1. Implement SDK notification hook (debug-only).
2. Add MCP `postNotification` tool that targets SDK by default.
3. Provide emulator-only fallback using `cmd notification`.

## Risks

- Requires app-under-test integration (not possible for third-party apps).
- Big picture style has size constraints and may fail with large images.
