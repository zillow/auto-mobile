# Firebender MCP Config

This is a simple sample of how to get AutoMobile running with Cursor, for other options see the
[overview](overview.md).

You can either perform a [1-click install](cursor://anysphere.cursor-deeplink/mcp/install?name=auto-mobile&config=eyJfX3R5cGVuYW1lIjoiQ2F0YWxvZ0l0ZW1NY3BDb25maWdDb21tYW5kIiwiY29tbWFuZCI6Im5weCIsImFyZ3MiOlsiLXkiLCJhdXRvLW1vYmlsZUBsYXRlc3QiXSwiZW52IjpudWxsfQ==),
or copy the following into your Cursor `mcp.json`:

```json
{
  "mcpServers": {
    "AutoMobile": {
      "command": "npx",
      "args": ["-y", "auto-mobile@latest"]
    }
  }
}
```
<img src="../img/cursor-mcp-server-success.png" width="400" alt="cursor-mcp-server-success.png">
