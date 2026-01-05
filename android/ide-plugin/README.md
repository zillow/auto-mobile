# AutoMobile IDE Plugin

IntelliJ/Android Studio plugin scaffold for AutoMobile.

## Goals
- Attach to a running AutoMobile MCP server or MCP daemon.
- Render and import/export navigation graphs.
- Toggle feature flags without restarting the MCP server.

## MCP transport selection
The plugin selects the MCP transport in this order:
1. `AUTO_MOBILE_MCP_HTTP_URL` (or `-Dautomobile.mcp.httpUrl`) for Streamable HTTP.
2. `AUTO_MOBILE_MCP_STDIO_COMMAND` (or `-Dautomobile.mcp.stdioCommand`) for stdio.
3. Unix socket fallback at `/tmp/auto-mobile-daemon-<uid>.sock`.

## Local development
Use the Android Gradle wrapper from the repository root:

```bash
cd android
./gradlew -p ide-plugin build
./gradlew -p ide-plugin runIde
```

## UI stack
The tool window uses Compose with JetBrains Jewel for rendering.

## References
- Slack Foundry repository (Skate IntelliJ plugin) for Gradle/plugin best practices: https://github.com/slackhq/foundry
