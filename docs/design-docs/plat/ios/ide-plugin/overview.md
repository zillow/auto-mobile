# Xcode Integration

Xcode does not support the rich plugin APIs available in Android Studio. The closest
parity is a companion macOS app plus an Xcode Source Editor Extension (XcodeKit).
This approach provides UI parity with the Android IDE plugin while staying within
supported Apple tooling.

## Components

- **AutoMobile Xcode Companion** (macOS app)
  - Hosts all UI surfaces: navigation graph, performance views, feature flags,
    test recording, and plan execution.
  - Connects to MCP over HTTP/STDIO/daemon socket.
  - Provides a menu bar mode plus a docked window for persistent views.
- **Xcode Source Editor Extension**
  - Adds commands to insert plan templates, run plans, or open the companion app.
  - Keeps source edits inside Xcode without embedding a custom tool window.

## Transport selection

The companion app selects an MCP transport in this order:

1. Discovered MCP dev server over HTTP (health check on localhost).
2. `AUTOMOBILE_MCP_HTTP_URL` or `automobile.mcp.httpUrl`.
3. `AUTOMOBILE_MCP_STDIO_COMMAND` or `automobile.mcp.stdioCommand`.
4. Unix socket fallback at `/tmp/auto-mobile-daemon-<uid>.sock`.

## MCP dev server discovery

- Enumerate git worktrees via `git worktree list --porcelain`.
- Scan listening ports on localhost.
- Probe `/health` or `/auto-mobile/health` for AutoMobile servers.
- Match servers to worktrees by branch name.

## UX goals

- One-click attach to MCP server.
- Live navigation graph rendering.
- Feature flag toggles.
- Test recording and plan generation.
- Execution log view with errors and timing.
- Menu bar actions: Record Test, Stop Recording Test, feature flags submenu, and deep links to companion views.

## Recording flow

- The companion app uses the daemon Unix socket to request recording start/stop.
- The MCP server emits resource update notifications when a new recorded plan is available.
- The companion app listens for resource updates to load the latest recorded plan.

## Distribution and signing

- The companion app should be signed and notarized (non-App-Store distribution).
- If signing constraints block features, provide a fallback unsigned developer build.
- When iOS tooling is enabled but the app is missing, `doctor` should surface a download link.

## Notes

- The companion app provides the rich UI that Xcode does not allow.
- The Source Editor Extension is optional but improves developer workflow.

## See also

- [Test recording](test-recording.md)
- [iOS automation server](../accessibility-service.md)
