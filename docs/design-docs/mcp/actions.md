# Features - MCP Server - Actions

#### Observe

In cases where the agent needs to determine what to do next, the [observe](observation.md) capability is exposed as the
`observe` tool.

#### Interactions

- 👆 `tapOn` supports tap, double-tap, long press, and long-press drag actions.
- 👉 `swipeOn` handles directional swipes and scrolling within container bounds.
- ↔️ `dragAndDrop` for element-to-element moves.
- 🔍 `pinchOn` for zoom in/out gestures.
- 📳 `shake` for accelerometer simulation.

#### tapOn Response Metadata

Successful `tapOn` calls include `selectedElement` metadata describing which match was chosen.

```json
{
  "success": true,
  "action": "tap",
  "selectedElement": {
    "text": "Sarah's Channel",
    "resourceId": "com.example:id/channel_item",
    "bounds": {
      "left": 50,
      "top": 200,
      "right": 350,
      "bottom": 280,
      "centerX": 200,
      "centerY": 240
    },
    "indexInMatches": 3,
    "totalMatches": 10,
    "selectionStrategy": "random"
  }
}
```

#### App Management

- 📱 `listApps` enumerates installed apps (deprecated; use the `automobile:apps` resource with query filters).
- 🚀 `launchApp` starts apps by package name (with optional clear-app-data support).
- ❌ `terminateApp` force-stops an app by package name.
- 📦 `installApp` installs an APK.
- 🔗 `getDeepLinks` reads registered deep links/intent filters for an Android package.

#### Input Methods

- ⌨️ `inputText` and `imeAction` for typing and IME actions.
- 🗑️ `clearText` and `selectAllText` act on the focused field.
- 🔘 `pressButton` or `pressKey` for back/home/recent/power/volume.

#### Device Configuration

- 🔄 `rotate` sets portrait or landscape.
- 🌐 `openLink` launches URLs or deep links.
- 🧰 `systemTray`, `homeScreen`, and `recentApps` control system surfaces.
- 🔔 `postNotification` posts notifications from the app-under-test when SDK hooks are installed.
- 🌍 `changeLocalization` sets locale, time zone, text direction, and time format in one call.

#### Navigation & Exploration

- 🗺️ `navigateTo` navigates to a specific screen using learned paths from the navigation graph.
- 🔍 `explore` automatically explores the app and builds the navigation graph by intelligently selecting and interacting with UI elements.
- 📊 `getNavigationGraph` retrieves the current navigation graph for debugging and analysis.

#### Advanced Device Management

- 📋 Device inventory and pool status are exposed via the `automobile:devices/booted` resource.
- 🚀 `startDevice` starts a device with the specified device image.
- ❌ `killDevice` terminates a running device.
- 🔧 `setActiveDevice` sets the active device for subsequent operations.

#### Testing & Debugging

- 🧪 `executePlan` (daemon mode only) executes a series of tool calls from a YAML plan content, stopping if any step fails.
- 🔒 `criticalSection` (daemon mode only) coordinates multiple devices at a synchronization barrier for serialized steps.
- 🩺 `doctor` runs diagnostic checks to verify AutoMobile setup and environment configuration.
- 🐛 `bugReport` generates a comprehensive bug report including screen state, view hierarchy, logcat, and screenshot.
- 🔍 `debugSearch` debugs element search operations to understand why elements aren't found or wrong elements are selected.
- 📸 `rawViewHierarchy` gets raw view hierarchy data (XML/JSON) without parsing for debugging.
- 🖍️ `highlight` draws visual overlays to highlight areas of the screen during debugging (Android only).
- 🔗 `identifyInteractions` suggests likely interactions with ready-to-use tool calls (debug-only; enable the debug feature flag).

#### Performance & Monitoring

- 🚩 `listFeatureFlags` lists all available feature flags and their current states.
- ⚙️ `setFeatureFlag` enables/disables feature flags for experimental features and performance tuning.
- 🎬 `demoMode` enables or disables demo mode with consistent status bar indicators for screenshots (`action: "enable" | "disable"`).

#### Daemon & Session Management

- 📋 Device pool status is exposed via the `automobile:devices/booted` resource.
- Daemon management operations are exposed via the unix socket API (not MCP tools).
