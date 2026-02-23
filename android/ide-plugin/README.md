# AutoMobile IDE Plugin

IntelliJ/Android Studio plugin scaffold for AutoMobile.

## Goals
- Attach to a running AutoMobile MCP server or MCP daemon.
- Render and import/export navigation graphs.
- Toggle feature flags without restarting the MCP server.

## MCP transport selection
The plugin selects the MCP transport in this order:
1. `AUTOMOBILE_MCP_STDIO_COMMAND` (or `-Dautomobile.mcp.stdioCommand`) for stdio.
2. Unix socket fallback at `/tmp/auto-mobile-daemon-<uid>.sock`.

The tool window lists git worktrees and any matching MCP dev servers. Use the dropdown to pick which worktree/server
to attach before connecting.

## Local development
Use the Android Gradle wrapper from the repository root:

```bash
cd android
./gradlew -p ide-plugin build
./gradlew -p ide-plugin runIde
```

## UI stack
The tool window and settings pages use Compose with JetBrains Jewel for rendering.

## Non-Compose surfaces
- The IntelliJ settings dialog and tool window containers are Swing provided by the IDE; plugin UI is embedded via ComposePanel.

## References
- Slack Foundry repository (Skate IntelliJ plugin) for Gradle/plugin best practices: https://github.com/slackhq/foundry
