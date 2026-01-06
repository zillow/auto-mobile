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
