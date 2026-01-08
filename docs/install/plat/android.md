# Android Setup

AutoMobile detects Android SDK components automatically but does **not** install them for you by default. If you want a
guided setup, the interactive installer can optionally download command line tools and platform-tools, install the
Accessibility Service APK, install the IDE plugin, and start the MCP daemon.

## Interactive Installer (macOS/Linux)

```bash
./scripts/install/interactive.sh
```

The installer will prompt before installing anything and will highlight the SDK path it uses.

## Prerequisites

1. **Install Android SDK**
   Follow the [official Android installation guide](https://developer.android.com/studio/install)

2. **Ensure ADB is available**
   AutoMobile detects ADB from:
   - `ANDROID_HOME` / `ANDROID_SDK_ROOT` environment variables
   - Common SDK paths (macOS/Linux/Windows)
   - Homebrew installation (macOS: `/opt/homebrew/bin/adb`)
   - System `PATH`

3. **Enable USB Debugging** (for physical devices)
   See [Enable USB debugging](https://developer.android.com/studio/debug/dev-options#enable)

## Docker Setup

For Docker-based MCP server setup, see [Android Docker Configuration](../../design-docs/plat/android/docker.md).

Quick example:

```json
{
  "mcpServers": {
    "auto-mobile": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init", "--pull=always",
        "--privileged", "--network", "host",
        "-v", "${HOME}/.android:/home/automobile/.android",
        "kaeawc/auto-mobile:latest"
      ]
    }
  }
}
```

## Decision guide

AutoMobile always needs the MCP server (configured in the overview). Everything below is optional and only needed for
specific workflows.

### Component summary

- **Accessibility Service** - Required on test devices for AutoMobile to access the view hierarchy and UI signals.
- **IntelliJ IDE Plugin** - Attach to a running MCP server to toggle feature flags, record tests, visualize the
  real-time navigation graph, and inspect app performance.
- **JUnitRunner** - Test framework dependency (not the SDK library) to run AutoMobile tests from JUnit/Gradle or CI.
  Enables device pooling and timing-based ordering, and can use AI self-healing when model provider keys are configured.
- **Android SDK library** - Add to app modules when you want app-side instrumentation like recomposition tracking.

### Comparison table

| Goal | Use these components |
| --- | --- |
| Drive the app from an AI agent (Claude, Cursor, etc.) | MCP server + agent |
| Record tests or view the navigation graph inside Android Studio | MCP server + [IntelliJ IDE Plugin](../../design-docs/plat/android/ide-plugin/overview.md) |
| Run AutoMobile tests in Gradle/CI | MCP server + [JUnitRunner](../../design-docs/plat/android/junitrunner.md) |
| Collect recomposition tracking data | MCP server + [Android SDK library](../../design-docs/plat/android/auto-mobile-sdk.md) |
| Access the real-time view hierarchy | Enable the [Accessibility Service](../../design-docs/plat/android/accessibility-service.md) |

### Scenarios

- **Exploratory automation** - MCP server + agent only, plus the Accessibility Service on devices. Add the IDE plugin if
  you want the navigation graph while you explore.
- **CI or local JUnit execution** - Add JUnitRunner (plus model provider keys if you want AI self-healing).
- **App instrumentation focus** - Add the Android SDK library for recomposition tracking.

## Troubleshooting

**ADB not found:**

1. Verify installation: `which adb` or `where adb` (Windows)
2. Check environment variables are set
3. Restart terminal after setting `PATH`

**Devices not showing:**

1. Run `adb devices` to verify connection
2. Accept USB debugging prompt on device
3. Try `adb kill-server && adb start-server`

For more issues, see [GitHub Issues](https://github.com/kaeawc/auto-mobile/issues).
