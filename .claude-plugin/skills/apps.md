---
description: Launch, terminate, and manage apps
allowed-tools: mcp__auto-mobile__launchApp, mcp__auto-mobile__terminateApp, mcp__auto-mobile__openLink, mcp__auto-mobile__installApp, mcp__auto-mobile__clearAppData
---

Manage applications on the device - launch, terminate, install, and control app state.

## Launch App

Use `launchApp` to start an application:
```
launchApp with packageName: "com.example.app"
```

Parameters:
- `packageName`: App identifier (e.g., `com.android.settings`, `com.apple.Preferences`)
- `waitUntilLaunched`: Wait for app to be fully loaded (default: true)

## Terminate App

Use `terminateApp` to stop a running application:
```
terminateApp with packageName: "com.example.app"
```

This force-stops the app, clearing it from memory.

## Open Link

Use `openLink` to open a URL in the default browser or app:
```
openLink with url: "https://example.com"
```

Deep links are also supported:
```
openLink with url: "myapp://screen/settings"
```

## Install App

Use `installApp` to install an APK (Android) or IPA (iOS):
```
installApp with path: "/path/to/app.apk"
```

## Clear App Data

Use `clearAppData` to reset an app to fresh-install state:
```
clearAppData with packageName: "com.example.app"
```

This removes all app data, caches, and preferences.

## Common Workflows

**Fresh start testing:**
```
terminateApp → clearAppData → launchApp
```

**Switch between apps:**
```
terminateApp (current) → launchApp (new)
```

**Test deep links:**
```
openLink with deep link URL → observe to verify screen
```
