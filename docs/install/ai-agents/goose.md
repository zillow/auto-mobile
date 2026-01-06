# Goose MCP Config

This is a simple sample of how to get AutoMobile running with Goose, for other options see the
[overview](index.md).

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

![goose-mcp-server-setup-prod.png](../../img/goose-mcp-server-setup-prod.png)

![goose-mcp-server-success.png](../../img/goose-mcp-server-success.png)
