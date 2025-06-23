# Plans - Syntax

## General Format

The main components are `name` and `steps`, where each item in `steps` is a tool call.
```yaml
---
name: launch-clock-app
description: Very simple test to launch Clock app
steps:
  - tool: launchApp
    appId: com.google.android.deskclock
    label: Launch Clock application

  - tool: stopApp
    appId: com.google.android.deskclock
```

## Full Syntax

Set up demo mode with 1pm time and 4G connectivity. This tends to make AutoMobile's view hierarchy cache highly efficient
as there are fewer changes between screenshots given the same screen. It is highly recommended to include this in every
AutoMobile plan.

TODO: Add gradle property to always set demo mode as well as a CLI flag on executePlan.

```yaml
  - tool: enableDemoMode
    time: "1300"
    mobileDataType: "4g"
    mobileSignalLevel: 4
    wifiLevel: 0
    batteryLevel: 85
    batteryPlugged: false
    label: Enable demo mode with 1pm time and 4G connectivity
```

Launch an app

```yaml
  - tool: launchApp
    appId: com.example.android.app
    label: Launch Zillow application
```

Input text (with unicode support)

```yaml
  - tool: inputText
    text: "My name is John Smith 🎉"
    label: Enter name with emoji
```

Navigate back

```yaml
  - tool: pressButton
    button: "back"
    label: Go back to main app
```

tapOn options

```yaml
  - tool: tapOn
    x: 442
    y: 219
    label: Open search field

  - tool: tapOn
    id: "com.example.android.app:id/search_close_btn"
    label: Tap this specific button

  - tool: tapOn
    text: "Search"
    label: Navigate to search section
```

Swipe/Scroll options

```yaml
  - tool: swipeOnElement
    elementId: "com.example.android.app:id/homes_map_drawer_bottom_sheet"
    direction: "up"
    duration: 1000
    label: Expand property listings

  - tool: swipeOnScreen
    direction: "left"
    duration: 1000
    includeSystemInsets: false
    label: Enter full-screen photo viewing mode

  - tool: scroll
    direction: "down"
    elementId: "com.example.android.app:id/content"
    lookFor:
      text: "New Jersey"
    duration: 1000
```

Observe

```yaml
  - tool: observe
    withViewHierarchy: true
    label: Final observation of home photo gallery
```
