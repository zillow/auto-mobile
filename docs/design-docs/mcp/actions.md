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

TODO: Add explore, navigateTo, doctor etc