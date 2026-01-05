# Features - MCP Server - Actions

#### Observe

In case of instances where the agent needs to make an observation to determine what interactions it should attempt we 
expose the [observe](observation.md) ability as a tool call.

#### Interactions

- 👆 **Tap**: Intelligent text-based or resource-id tapping with fuzzy search and view hierarchy analysis. See
  [tapOn details](tap-on.md) for container scoping and precedence.
- 👉 **Swipe**: Directional swiping within element bounds with configurable release timing.
- ⏰ **Long Press**: Extended touch gestures for context menus and advanced interactions.
- 📜 **Scroll**: Intelligent scrolling until target text becomes visible.
- 📳 **Shake**: Accelerometer simulation of shaking the device.

#### App Management

- 📱 **List Apps**: Enumerate all installed applications including system apps.
- 🚀 **Launch App**: Start applications by package name.
- ❌ **Terminate App**: Force-stop the specified application if its running.
- 🗑️ **Clear App Data**: Reset application state and storage.
- 📦 **Install App**: Deploy an app to the device
- 🔗 **Query Deep Links**: Query the application for its registered deep links

#### Input Methods

- ⌨️ **Send Keys**: Keyboard input, optionally using ADBKeyboard for unicode as needed on Android.
- 🗑️ **Clear Text**: Deletes all text from a specified element, or the currently focused text field.
- 🔘 **Press Button**: Hardware button simulation (home, back, menu, power, volume)

#### Device Configuration

- 🔄 **Change Orientation**: Toggle between portrait and landscape modes
- 🌐 **Open URL**: Launch URLs or deep links in default browser
