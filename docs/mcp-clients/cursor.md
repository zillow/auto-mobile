# Cursor MCP Config

This is a simple sample of how to get AutoMobile running with Cursor, for other options see the
[overview](index.md).

You can either perform a [1-click install](cursor://anysphere.cursor-deeplink/mcp/install?name=auto-mobile&config=eyJfX3R5cGVuYW1lIjoiQ2F0YWxvZ0l0ZW1NY3BDb25maWdDb21tYW5kIiwiY29tbWFuZCI6Im5weCIsImFyZ3MiOlsiLXkiLCJAa2FlYXdjL2F1dG8tbW9iaWxlQGxhdGVzdCJdLCJlbnYiOm51bGx9),
or copy the following into your Cursor `mcp.json`:

```json
{
  "mcpServers": {
    "AutoMobile": {
      "command": "npx",
      "args": ["-y", "@kaeawc/auto-mobile@latest"]
    }
  }
}
```

If your Android SDK is not on `PATH`, add `ANDROID_HOME` (or `ANDROID_SDK_ROOT`/`ANDROID_SDK_HOME`) to the `env` map.

![cursor-mcp-server-success.png](../img/cursor-mcp-server-success.png)

## Implementation references

- [`src/utils/android-cmdline-tools/AdbClient.ts#L83-L124`](https://github.com/kaeawc/auto-mobile/blob/main/src/utils/android-cmdline-tools/AdbClient.ts#L83-L124) for Android SDK environment variable detection.
