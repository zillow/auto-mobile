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

### Manual sandbox validation checklist

Run `./gradlew -p ide-plugin runIde` and verify the following in the sandbox IDE:

- [ ] AutoMobile tool window appears in the right panel (look for the AutoMobile icon in the stripe)
- [ ] Tool window renders without blank content or exceptions in the IDE log
- [ ] "Connect" / MCP attachment button is visible in the tool window header
- [ ] With the MCP daemon running (`bun dist/src/index.js --daemon-mode`), clicking attach populates the resource list
- [ ] Navigation graph tab renders nodes and edges after a graph resource is loaded
- [ ] Settings page is accessible via File > Settings > AutoMobile

Compose UI and Jewel rendering can only be verified this way; there is no headless substitute.

## UI stack
The tool window and settings pages use Compose with JetBrains Jewel for rendering.

## Non-Compose surfaces
- The IntelliJ settings dialog and tool window containers are Swing provided by the IDE; plugin UI is embedded via ComposePanel.

## References
- Slack Foundry repository (Skate IntelliJ plugin) for Gradle/plugin best practices: https://github.com/slackhq/foundry
