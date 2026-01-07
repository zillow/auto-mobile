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

#### App Management

- 📱 `listApps` enumerates installed apps.
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
- 🧰 `openSystemTray`, `homeScreen`, and `recentApps` control system surfaces.
- 🌍 `setLocale` changes app/system locale (e.g., "ar-SA", "ja-JP").
- 🕒 `setTimeZone` changes device time zone.
- ⬅️ `setTextDirection` enables/disables RTL layout.
- 🕐 `set24HourFormat` toggles 24-hour time format.

#### Navigation & Exploration

- 🗺️ `navigateTo` navigates to a specific screen using learned paths from the navigation graph.
- 🔍 `explore` automatically explores the app and builds the navigation graph by intelligently selecting and interacting with UI elements.
- 📊 `getNavigationGraph` retrieves the current navigation graph for debugging and analysis.
- 🔗 `identifyInteractions` analyzes the current screen and suggests likely interactions with ready-to-use tool calls.

#### Advanced Device Management

- 📱 `listDevices` lists all connected devices (physical and emulators).
- 🚀 `startDevice` starts a device with the specified device image.
- ❌ `killDevice` terminates a running device.
- 🔧 `setActiveDevice` sets the active device for subsequent operations.

#### Testing & Debugging

- 🧪 `executePlan` executes a series of tool calls from a YAML plan content, stopping if any step fails.
- ⏱️ `getTestTimings` retrieves aggregated historical test execution timing statistics.
- 🩺 `doctor` runs diagnostic checks to verify AutoMobile setup and environment configuration.
- 🐛 `bugReport` generates a comprehensive bug report including screen state, view hierarchy, logcat, and screenshot.
- 🔍 `debugSearch` debugs element search operations to understand why elements aren't found or wrong elements are selected.
- 📸 `rawViewHierarchy` gets raw view hierarchy data (XML/JSON) without parsing for debugging.

#### Performance & Monitoring

- 🚩 `listFeatureFlags` lists all available feature flags and their current states.
- ⚙️ `setFeatureFlag` enables/disables feature flags for experimental features and performance tuning.
- 📊 `listPerformanceAuditResults` lists UI performance audit results from the local database.
- 🎬 `enableDemoMode` enables demo mode with consistent status bar indicators for screenshots.
- 🎬 `disableDemoMode` disables demo mode and returns to normal status bar behavior.

#### Daemon & Session Management

- 🔢 `daemon_available_devices` queries number of available devices in daemon pool.
- 📋 `daemon_session_info` gets information about an existing session.
- 🔓 `daemon_release_session` releases a session and frees its device.