---
description: Navigate system UI - home screen, recent apps, hardware buttons
allowed-tools: mcp__auto-mobile__homeScreen, mcp__auto-mobile__recentApps, mcp__auto-mobile__pressButton, mcp__auto-mobile__pressKey, mcp__auto-mobile__rotate, mcp__auto-mobile__shake
---

Navigate system-level UI and control hardware functions.

## Home Screen

Use `homeScreen` to return to the device home screen:
```
homeScreen
```

Useful for:
- Resetting to a known state
- Exiting apps
- Starting fresh navigation

## Recent Apps

Use `recentApps` to open the app switcher:
```
recentApps
```

From here you can:
- Switch between running apps
- Close apps by swiping them away
- See app thumbnails

## Hardware Buttons

Use `pressButton` for hardware button presses:
```
pressButton with button: "back"
```

Available buttons:
- `home`: Go to home screen
- `back`: Navigate back
- `menu`: Open menu (Android)
- `power`: Power button
- `volume_up`: Increase volume
- `volume_down`: Decrease volume
- `recent`: Open recent apps

## Key Press

Use `pressKey` for specific key codes:
```
pressKey with key: "enter"
```

## Device Orientation

Use `rotate` to change screen orientation:
```
rotate with orientation: "landscape"
rotate with orientation: "portrait"
```

## Shake Device

Use `shake` to trigger shake gesture:
```
shake
```

Useful for:
- Triggering shake-to-undo
- Developer menu access
- Feedback dialogs

## Common Workflows

**Navigate back through screens:**
```
pressButton "back" → observe → pressButton "back" → observe
```

**Reset to known state:**
```
homeScreen → launchApp
```

**Test orientation changes:**
```
rotate "landscape" → observe → rotate "portrait" → observe
```
