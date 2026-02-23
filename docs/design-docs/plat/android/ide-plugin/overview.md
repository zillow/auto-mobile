# Overview

<kbd>✅ Implemented</kbd> <kbd>🧪 Tested</kbd>

> **Current state:** The Android Studio/IntelliJ plugin is implemented in `android/ide-plugin/`. Supports MCP over STDIO and daemon socket, and device pool display. Sub-features (navigation graph render, test recording, feature flags UI) have varying completeness — see their individual docs. See the [Status Glossary](../../../status-glossary.md) for chip definitions.

The AutoMobile IntelliJ/Android Studio plugin attaches to a running MCP server to render navigation data and
manage development workflows. It connects via STDIO or the local daemon socket.

## Transport selection
The plugin resolves a transport when the user clicks "Attach to MCP":

1. `AUTOMOBILE_MCP_STDIO_COMMAND` / `-Dautomobile.mcp.stdioCommand` (stdio).
2. Unix socket fallback at `/tmp/auto-mobile-daemon-<uid>.sock`.

## Tool window UX
- The dropdown lists every git worktree and its associated daemon (if any).
- Worktrees without a running daemon are shown as "no server".
- "Rescan servers" re-runs discovery to pick up newly launched daemons.
