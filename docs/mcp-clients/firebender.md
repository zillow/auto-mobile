# Firebender MCP Config

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

![firebender-mcp-server-setup-prod.png](../img/firebender-mcp-server-setup-prod.png)

## Implementation references

- [`src/utils/android-cmdline-tools/AdbClient.ts#L83-L124`](https://github.com/kaeawc/auto-mobile/blob/main/src/utils/android-cmdline-tools/AdbClient.ts#L83-L124) for Android SDK environment variable detection.
