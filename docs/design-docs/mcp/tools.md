# Features - MCP Server - Actions

#### Observe

Almost all other tool calls have built-in observation via the [interaction loop](interaction-loop.md), but we also have a standalone [observe](observe/index.md) tool that specifically performs just that action to get the AI agent up to speed.

#### Interactions

- 👆 `tapOn` supports tap, double-tap, long press, and long-press drag actions.
- 👉 `swipeOn` handles directional swipes and scrolling within container bounds.
- ↔️ `dragAndDrop` for element-to-element moves.
- 🔍 `pinchOn` for zoom in/out gestures.
- 📳 `shake` for accelerometer simulation.

#### App Management

- 📱 Installed apps are exposed via the `automobile:apps` resource with query filters.
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
- 🔍 [`explore`](nav/explore.md) automatically explores the app and builds the navigation graph by intelligently selecting and interacting with UI elements.
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
- 🐛 `bugReport` generates a comprehensive bug report including screen state, view hierarchy, logcat, screenshot, and optional highlight metadata.
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
