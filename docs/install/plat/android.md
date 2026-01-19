# Android

## Prerequisites

1. [Install Android SDK](https://developer.android.com/studio/install)

2. Add `ANDROID_HOME` to your `PATH`

## Docker Setup

For Docker-based MCP server setup, see [Docker Configuration](../docker.md).

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

### Additional Components

| Goal | Use these components |
| --- | --- |
| Drive the app from an AI agent (Claude, Cursor, etc.) | MCP server + agent |
| Record tests or view the navigation graph inside Android Studio | MCP server + [IntelliJ IDE Plugin](../../design-docs/plat/android/ide-plugin/overview.md) |
| Run AutoMobile tests in Gradle/CI | MCP server + [JUnitRunner](../../design-docs/plat/android/junitrunner.md) |
| Collect recomposition tracking data | MCP server + [Android SDK library](../../design-docs/plat/android/auto-mobile-sdk.md) |

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

### What's next

Learn [how to use AutoMobile for Android](../../using/ux-exploration.md)
