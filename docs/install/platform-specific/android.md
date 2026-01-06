# Android Setup

AutoMobile detects Android SDK components automatically but does **not** install them for you.

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

## Manual Configuration

If auto-detection fails:

```bash
export ANDROID_HOME=/path/to/android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

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
