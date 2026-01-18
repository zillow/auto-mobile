---
description: Explore and interact with mobile devices - tap, type, swipe, navigate, and more
allowed-tools: mcp__auto-mobile__observe, mcp__auto-mobile__tapOn, mcp__auto-mobile__swipeOn, mcp__auto-mobile__inputText, mcp__auto-mobile__clearText, mcp__auto-mobile__selectAllText, mcp__auto-mobile__pressButton, mcp__auto-mobile__pressKey, mcp__auto-mobile__dragAndDrop, mcp__auto-mobile__pinchOn, mcp__auto-mobile__keyboard, mcp__auto-mobile__imeAction, mcp__auto-mobile__homeScreen, mcp__auto-mobile__recentApps, mcp__auto-mobile__systemTray, mcp__auto-mobile__launchApp, mcp__auto-mobile__terminateApp, mcp__auto-mobile__openLink, mcp__auto-mobile__clipboard, mcp__auto-mobile__rotate, mcp__auto-mobile__shake, mcp__auto-mobile__deviceSnapshot
---

Explore and interact with connected mobile devices. This skill provides all the tools needed to navigate apps, perform gestures, and manipulate device state.

## Observation

Use `observe` to capture the current screen state:
- View hierarchy with all elements
- Interactive elements and their properties
- Current app and screen/activity name
- Screenshot of the display

## Navigation

### App Management
- `launchApp`: Start an app by package/bundle ID
- `terminateApp`: Stop a running app
- `openLink`: Open a URL in the browser

### System Navigation
- `homeScreen`: Go to the device home screen
- `recentApps`: Open the recent apps / app switcher
- `pressButton`: Hardware buttons (home, back, menu, power, volume)

### Notifications
Use `systemTray` to interact with notifications:
- `open`: Pull down the notification shade
- `find`: Search for a specific notification
- `tap`: Tap on a notification or its action button
- `dismiss`: Swipe away a notification
- `clearAll`: Clear all notifications

## Tap Actions

Use `tapOn` with different actions:
- **tap**: Single tap on element
- **doubleTap**: Double tap (zoom, select word)
- **longPress**: Long press (context menu, drag mode)
- **focus**: Focus input without opening keyboard

Target elements by:
- `text`: Visible text on the element
- `id`: Accessibility ID or resource ID
- `container`: Scope search within a parent element

## Text Input

- `inputText`: Type text into the focused field
- `clearText`: Clear the current input field
- `selectAllText`: Select all text in focused input
- `keyboard`: Open, close, or detect keyboard state
- `imeAction`: Trigger IME action (done, next, search, send, go)

## Gestures

### Scrolling & Swiping
Use `swipeOn` with:
- `direction`: up, down, left, right
- `gestureType`: scroll (content), swipe (page), fling (fast)
- `lookFor`: Keep scrolling until element found
- `container`: Scroll within specific list/view

### Advanced Gestures
- `dragAndDrop`: Move element from source to target
- `pinchOn`: Pinch to zoom in/out with optional rotation
- `shake`: Shake the device
- `rotate`: Change device orientation (portrait/landscape)

## Device State

- `clipboard`: Copy, paste, clear, or get clipboard content
- `deviceSnapshot`: Capture or restore device state for testing

## Workflow

1. **Observe**: Check current screen state with `observe`
2. **Navigate**: Use app/system navigation to reach target
3. **Interact**: Perform taps, swipes, text input
4. **Verify**: Observe again to confirm the result

## Examples

**Launch app and tap button:**
```
launchApp with packageName: "com.example.app"
observe
tapOn with text: "Get Started"
```

**Check notifications:**
```
systemTray with action: "open"
systemTray with action: "find", notification: {title: "New message"}
systemTray with action: "tap"
```

**Fill a form:**
```
tapOn with text: "Email" to focus
inputText with text: "user@example.com"
imeAction with action: "next"
inputText with text: "password123"
tapOn with text: "Submit"
```

**Scroll to find and tap:**
```
swipeOn with direction: "up", lookFor: {text: "Settings"}
tapOn with text: "Settings"
```

## Tips

- Always `observe` first if unsure of screen state
- Use `homeScreen` to reset to a known state
- Use `lookFor` with swipe to auto-scroll to off-screen elements
- Long press to reveal context menus
- Use `container` to scope searches in complex screens
