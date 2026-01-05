# Codex MCP Config

This is a simple sample of how to get AutoMobile running with Codex, for other options see the
[overview](index.md).

## Option 1: Using the CLI (Recommended)

Add AutoMobile via the terminal:

```bash
codex mcp add auto-mobile --env ANDROID_HOME=/Users/<username>/Library/Android/sdk -- npx -y @kaeawc/auto-mobile@latest
```

Replace `/Users/<username>/Library/Android/sdk` with your actual Android SDK path (or use `ANDROID_SDK_ROOT`/`ANDROID_SDK_HOME` instead of `ANDROID_HOME`):
- **macOS**: Usually `~/Library/Android/sdk`
- **Linux**: Usually `~/Android/Sdk`
- **Windows**: Usually `C:\Users\<username>\AppData\Local\Android\Sdk`

You can verify the server was added:

```bash
codex mcp list
```

## Option 2: Manual Configuration

Add the following to your Codex configuration file at `~/.codex/config.toml`:

```toml
[mcp_servers.auto-mobile]
command = "npx"
args = ["-y", "@kaeawc/auto-mobile@latest"]

[mcp_servers.auto-mobile.env]
ANDROID_HOME = "/Users/<username>/Library/Android/sdk"
```

Replace `/Users/<username>/Library/Android/sdk` with your actual Android SDK path (or use `ANDROID_SDK_ROOT`/`ANDROID_SDK_HOME` instead of `ANDROID_HOME`):
- **macOS**: Usually `~/Library/Android/sdk`
- **Linux**: Usually `~/Android/Sdk`
- **Windows**: Usually `C:\Users\<username>\AppData\Local\Android\Sdk`

## Configuration Notes

The Codex CLI and IDE extension share the same configuration file (`~/.codex/config.toml`), so you only need to configure AutoMobile once.

### Optional Settings

You can customize server behavior with additional options:

```toml
[mcp_servers.auto-mobile]
command = "npx"
args = ["-y", "@kaeawc/auto-mobile@latest"]
startup_timeout_sec = 30  # Default: 10
tool_timeout_sec = 120    # Default: 60
enabled = true            # Set to false to disable without removing

[mcp_servers.auto-mobile.env]
ANDROID_HOME = "/Users/<username>/Library/Android/sdk"
```

After saving the config, restart Codex and the AutoMobile server will start automatically.

## Implementation references

- [`src/utils/android-cmdline-tools/AdbClient.ts#L83-L124`](https://github.com/kaeawc/auto-mobile/blob/main/src/utils/android-cmdline-tools/AdbClient.ts#L83-L124) for Android SDK environment variable detection.
