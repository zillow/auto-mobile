# Android IDE Plugin

## Overview
The AutoMobile IntelliJ/Android Studio plugin attaches to a running MCP server to render navigation data and
manage development workflows. It supports MCP over HTTP (streamable) and STDIO, and falls back to the
local daemon socket when needed.

## Transport selection
The plugin resolves a transport when the user clicks "Attach to MCP":

1. MCP dev server discovered via HTTP health checks on localhost.
2. `AUTO_MOBILE_MCP_HTTP_URL` / `-Dautomobile.mcp.httpUrl` (streamable HTTP).
3. `AUTO_MOBILE_MCP_STDIO_COMMAND` / `-Dautomobile.mcp.stdioCommand` (stdio).
4. Unix socket fallback at `/tmp/auto-mobile-daemon-<uid>.sock`.

## MCP dev server discovery
Discovery focuses on hot-reload dev servers (bun `--watch`) and supports multiple worktrees.

1. **Worktree enumeration**: the plugin runs `git worktree list --porcelain` using `ProcessBuilder` and coroutines.
   - Each worktree record includes a filesystem path and optional branch name.
2. **Port scan**: the plugin scans local listening ports (via `lsof`, `ss`, or `netstat` depending on OS).
3. **Health probing**: each listening port is queried at `/health` (falling back to `/auto-mobile/health`).
   - Responses with `server: "AutoMobile"` are treated as MCP servers.
4. **Mapping**: discovered servers are matched to worktrees using the `branch` value from the health payload.

The health response also includes `instanceId`, `port`, and `activeSessions` so the plugin can detect restarts
and show server status.

## Tool window UX
- The dropdown lists every git worktree and its associated MCP server (if any).
- Worktrees without a running server are shown as "no server".
- Unmatched MCP servers are shown as standalone entries.
- "Rescan servers" re-runs discovery to pick up cold restarts or newly launched dev servers.

## Notes
- Streamable HTTP endpoints are assumed to live at `http://localhost:<port>/auto-mobile/streamable`.
- MCP stdio and daemon transports are still available for non-dev workflows.

## Implementation References

- Transport selection order and env/system properties: https://github.com/kaeawc/auto-mobile/blob/main/android/ide-plugin/src/main/kotlin/com/automobile/ide/daemon/McpClientFactory.kt#L1-L80
- Worktree discovery + health probing: https://github.com/kaeawc/auto-mobile/blob/main/android/ide-plugin/src/main/kotlin/com/automobile/ide/daemon/McpDiscovery.kt#L1-L190
- Port scanning (lsof/ss/netstat): https://github.com/kaeawc/auto-mobile/blob/main/android/ide-plugin/src/main/kotlin/com/automobile/ide/daemon/McpDiscovery.kt#L237-L320
- Health endpoint fields used by the plugin: https://github.com/kaeawc/auto-mobile/blob/main/src/index.ts#L244-L270
