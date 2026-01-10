# Notification triggering

## Goal

Trigger notifications that appear as the app-under-test. Provide
rich content (title, body, big text, big image, actions).

## Proposed MCP tool

```
postNotification({
  title: string,
  body: string,
  imageType?: "normal" | "bigPicture",
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

**SDK requirement:** the app-under-test must include the AutoMobile SDK
in its debug build so the broadcast receiver is available to the MCP
server. Third-party apps without SDK integration cannot post
notifications that appear as the app-under-test.

Implementation notes:

- Use `NotificationManager` / `NotificationCompat` with a known channel ID.
- When `imageType == bigPicture`, load from `imagePath` on device storage
  (e.g., `/sdcard/Download/automobile/`). The MCP tool pushes a host file
  into this directory before invoking the SDK receiver.
- Actions should target a test-only activity or broadcast receiver.

## ADB validation (API 35)

Status:

- API 29 not validated yet (no local AVD available).

Verification commands (after posting via MCP tool):

- Inspect via system tray UI dump:
  - `adb -s <device> shell cmd statusbar expand-notifications`
  - `adb -s <device> shell uiautomator dump /sdcard/notification_dump.xml`
  - `adb -s <device> shell cat /sdcard/notification_dump.xml`
  - `adb -s <device> shell cmd statusbar collapse`

Observed results:

- Notifications appear with provided titles/bodies.
- The uiautomator dump includes the notification text for matching.
- Multi-word titles appear truncated in the grouped list view (first token),
  but full text is present in the dump.

## Plan

1. Implement SDK notification hook (debug-only).
2. Add MCP `postNotification` tool that targets SDK by default.

## Risks

- Requires app-under-test integration (not possible for third-party apps).
- Big picture style has size constraints and may fail with large images.
