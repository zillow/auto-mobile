# Claude Code MCP Config

This is a simple sample of how to get AutoMobile running with Claude Code, for other options see the
[overview](index.md).

## Option 1: Using the CLI (Recommended)

Add AutoMobile via the terminal:

```bash
claude mcp add --type stdio auto-mobile \
  --command npx \
  --arg "-y" \
  --arg "@kaeawc/auto-mobile@latest" \
  --env ANDROID_HOME=/path/to/Android/sdk
```

Replace `/path/to/Android/sdk` with your actual Android SDK path (or use `ANDROID_SDK_ROOT`/`ANDROID_SDK_HOME` instead of `ANDROID_HOME`):
- **macOS**: Usually `~/Library/Android/sdk`
- **Linux**: Usually `~/Android/Sdk`
- **Windows**: Usually `C:\Users\YourName\AppData\Local\Android\Sdk`

## Option 2: Manual Configuration

Add the following to your Claude Code configuration file:

**macOS/Linux**: `~/.config/claude-code/config.json`
**Windows**: `%APPDATA%\claude-code\config.json`

```json
{
  "mcpServers": {
    "auto-mobile": {
      "command": "npx",
      "args": ["-y", "@kaeawc/auto-mobile@latest"],
      "env": {
        "ANDROID_HOME": "/path/to/Android/sdk"
      }
    }
  }
}
```

Replace `/path/to/Android/sdk` with your actual Android SDK path (or use `ANDROID_SDK_ROOT`/`ANDROID_SDK_HOME` instead of `ANDROID_HOME`):
- **macOS**: Usually `~/Library/Android/sdk`
- **Linux**: Usually `~/Android/Sdk`
- **Windows**: Usually `C:\Users\YourName\AppData\Local\Android\Sdk`

After saving the config, restart Claude Code and the AutoMobile server will start automatically.

## Implementation references

- [`src/utils/android-cmdline-tools/AdbClient.ts#L83-L124`](https://github.com/kaeawc/auto-mobile/blob/main/src/utils/android-cmdline-tools/AdbClient.ts#L83-L124) for Android SDK environment variable detection.
