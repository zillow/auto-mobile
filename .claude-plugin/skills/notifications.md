---
description: Interact with notifications and system tray
allowed-tools: mcp__auto-mobile__systemTray
---

Interact with the notification shade and system tray.

## Open Notification Shade

Pull down the notification shade:
```
systemTray with action: "open"
```

## Find Notification

Search for a specific notification:
```
systemTray with action: "find", notification: {title: "New message"}
systemTray with action: "find", notification: {body: "You have 3 new emails"}
systemTray with action: "find", notification: {appId: "com.example.app"}
```

Search criteria:
- `title`: Notification title text
- `body`: Notification body text
- `appId`: Source app package name

## Tap Notification

Tap on a notification or its action button:
```
systemTray with action: "tap", notification: {title: "New message"}
systemTray with action: "tap", notification: {title: "New message"}, tapActionLabel: "Reply"
```

## Dismiss Notification

Swipe away a notification:
```
systemTray with action: "dismiss", notification: {title: "New message"}
```

## Clear All Notifications

Remove all notifications:
```
systemTray with action: "clearAll"
```

## Common Workflows

**Check and act on notification:**
```
systemTray "open" → systemTray "find" → systemTray "tap"
```

**Clear notifications before test:**
```
systemTray "open" → systemTray "clearAll" → pressButton "back"
```

**Verify notification appeared:**
```
(trigger notification) → systemTray "open" → systemTray "find"
```

## Tips

- Always `open` the system tray before other actions
- Use `pressButton "back"` or `homeScreen` to close the shade
- Notifications may take a moment to appear after triggering
