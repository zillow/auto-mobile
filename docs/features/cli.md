# CLI

## Basic Usage

```bash
auto-mobile --cli help
```

```shell
AutoMobile CLI - Android Device Automation

Usage:
auto-mobile --cli <tool-name> [--param value ...]
auto-mobile --cli help [tool-name]

Examples:
auto-mobile --cli listDevices
auto-mobile --cli observe
auto-mobile --cli tapOn --text "Submit"
auto-mobile --cli startDevice --avdName "pixel_7_api_34"

Options:
help [tool-name]    Show help for a specific tool

Parameters:
Parameters are passed as --key value pairs
Values are parsed as JSON if possible, otherwise as strings
Boolean values: --flag true or --flag false
Numbers: --count 5
Objects: --options '{"key": "value"}'


Available Tools:
================

Observation:
observe                   - Take a screenshot and get the view hierarchy of what is displayed on screen

App Management:
listApps                  - List all apps installed on the device
stopApp                   - Stop a running app (Maestro equivalent of terminateApp)
launchApp                 - Launch an app by package name
terminateApp              - Terminate an app by package name
clearAppData              - Clear data for an app by package name
installApp                - Install an APK file on the device

Interactions:
clearText                 - Clear text from the currently focused input field
selectAllText             - Select all text in the currently focused input field using long press + tap on 'Select All'
pressButton               - Press a hardware button on the device
swipeOnElement            - Swipe on a specific element
swipeOnScreen             - Swipe on screen in a specific direction
pullToRefresh             - Perform a pull-to-refresh gesture on a list
openSystemTray            - Open the system notification tray by swiping down from the status bar
pressKey                  - Press a hardware key on the device (Maestro equivalent of pressButton)
clearState                - Clear app state and data (Maestro equivalent of clearAppData)
inputText                 - Input text to the device (Maestro equivalent of sendText)
openLink                  - Open a URL in the default browser (Maestro equivalent of openUrl)
tapOn                     - Unified tap command supporting coordinates, text, and selectors
doubleTapOn               - Unified double tap command supporting coordinates, text, and selectors
longPressOn               - Unified long press command supporting coordinates, text, and selectors
scroll                    - Scroll in a direction on a scrollable container, optionally to find an element (supports text and selectors)
swipe                     - Unified scroll command supporting direction and speed (no index support due to reliability)
openUrl                   - Open a URL in the default browser
changeOrientation         - Change the device orientation

Emulator Management:
setActiveDevice           - Set the active device ID for subsequent operations
enableDemoMode            - Enable demo mode with consistent status bar indicators for screenshots
disableDemoMode           - Disable demo mode and return to normal status bar behavior
listDevices               - List all connected devices (both physical devices and emulators)
listDeviceImages          - List all available device images
checkRunningDevices       - Check which devices are currently running
startDevice               - Start a device with the specified device image
killEmulator              - Kill a running device

Source Mapping:
addAppConfig              - Add Android app source configuration for indexing activities and fragments
setAndroidAppSource       - Configure Android app source directory for code analysis when user provides app package ID and source path with explicit permission to read the source directory. Use this when user wants to analyze or find source files for a specific Android app they have access to.
getAppConfigs             - Get all configured Android app source directories
getSourceIndex            - Get or create source index for an Android app (activities and fragments)
findActivitySource        - Find source file information for an activity by class name
findFragmentSource        - Find source file information for a fragment by class name

Plan Management:
exportPlan                - Export a repeatable YAML plan based on logged tool calls. Omits emulator and most observe calls, keeping only the last observe call. Plans are automatically saved to /tmp/auto-mobile/plans directory when no outputPath is specified.
executePlan               - Execute a series of tool calls from a YAML plan content. Stops execution if any step fails (success: false). Optionally can resume execution from a specific step index.

Assertions:
assertVisible             - Assert that an element is visible on the screen
assertNotVisible          - Assert that an element is not visible on the screen

Total: 43 tools available

Use 'auto-mobile --cli help <tool-name>' for detailed information about a specific tool.
```
