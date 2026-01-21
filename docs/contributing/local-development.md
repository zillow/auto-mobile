# Local Development

| Platform | Script |
|----------|--------|
| Android | `./scripts/local-dev/android-hot-reload.sh` |
| iOS | `./scripts/local-dev/ios-hot-reload.sh` |

Options:
- `--device <id>` - Target specific device (ADB device ID or simulator UDID)
- `--skip-ai` - Run without AI agent prompt
- `--once` - Build once and exit

Both scripts write logs to `scratch/`, auto-detect ports based on your git branch, and automatically enable debug flags (`AUTOMOBILE_DEBUG`, `AUTOMOBILE_DEBUG_PERF`).

## Verifying Setup

In Claude Code, run `/mcp` to check the connection status. A successful setup looks like:

```
╭─────────────────────────────────────────────────────────────────────╮
│ Auto-mobile MCP Server                                              │
│                                                                     │
│ Status: ✔ connected                                                 │
│ Auth: ✔ authenticated                                               │
│ URL: http://localhost:9000/auto-mobile/streamable                   │
│ Config location: /path/to/your/worktree/.mcp.json                   │
│ Capabilities: tools · resources                                     │
│ Tools: 44 tools                                                     │
╰─────────────────────────────────────────────────────────────────────╯
```
