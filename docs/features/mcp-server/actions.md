# Features - MCP Server - Actions

#### Observe

In cases where the agent needs to determine what to do next, the [observe](observation.md) capability is exposed as the
`observe` tool.

#### Interactions

- 👆 **Tap/long-press/drag**: `tapOn` supports tap, double-tap, long press, and long-press drag actions. See
  [tapOn details](tap-on.md) for container scoping and precedence.
- 👉 **Swipe/scroll**: `swipeOn` handles directional swipes and scrolling within container bounds.
- ↔️ **Drag + drop**: `dragAndDrop` for element-to-element moves.
- 🔍 **Pinch**: `pinchOn` for zoom in/out gestures.
- 📳 **Shake**: `shake` for accelerometer simulation.

#### App Management

- 📱 **List Apps**: `listApps` enumerates installed apps (Android returns profiles + system app coverage).
- 🚀 **Launch App**: `launchApp` starts apps by package name (with optional clear-app-data support).
- ❌ **Terminate App**: `terminateApp` force-stops an app by package name.
- 📦 **Install App**: `installApp` installs an APK.
- 🔗 **Query Deep Links**: `getDeepLinks` reads registered deep links/intent filters for an Android package.

#### Input Methods

- ⌨️ **Text Entry**: `inputText` and `imeAction` for typing and IME actions.
- 🗑️ **Clear/Select Text**: `clearText` and `selectAllText` act on the focused field.
- 🔘 **Hardware Buttons**: `pressButton` or `pressKey` for back/home/recent/power/volume.

#### Device Configuration

- 🔄 **Change Orientation**: `rotate` sets portrait or landscape.
- 🌐 **Open URL**: `openLink` launches URLs or deep links.
- 🧰 **System UI**: `openSystemTray`, `homeScreen`, and `recentApps` control system surfaces.

## Implementation references

- [`src/server/observeTools.ts#L16-L148`](https://github.com/kaeawc/auto-mobile/blob/main/src/server/observeTools.ts#L16-L148) for observation tools like `observe` and `listApps`.
- [`src/server/interactionTools.ts#L150-L960`](https://github.com/kaeawc/auto-mobile/blob/main/src/server/interactionTools.ts#L150-L960) for interaction, input, and device UI tools (`tapOn`, `swipeOn`, `inputText`, `rotate`, etc.).
- [`src/server/appTools.ts#L11-L126`](https://github.com/kaeawc/auto-mobile/blob/main/src/server/appTools.ts#L11-L126) for app management tools (`launchApp`, `terminateApp`, `installApp`).
- [`src/server/deepLinkTools.ts#L1-L60`](https://github.com/kaeawc/auto-mobile/blob/main/src/server/deepLinkTools.ts#L1-L60) for `getDeepLinks`.
