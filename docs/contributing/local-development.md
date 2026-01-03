# Running from Source

Whether you want to contribute to AutoMobile or just want to run the MCP directly from source, this guide will set you
up for the development environment maintainers use.

## Build from Source

If you're about to build AutoMobile from source for the very first time after cloning you should do the following:

```shell
bun install
bun run build
bun install -g
```

## Hot Reload Development

AutoMobile supports hot reload development via streamable HTTP transport. When you make code changes, the server
automatically restarts, allowing rapid iteration without manual restarts.

### Starting the Dev Server

```shell
# Start with hot reloading (bun --watch), streamable is the default
bun run dev

# Custom port (overrides auto-detection)
bun run dev:port 8080
```

### Automatic Port Detection (Worktree Isolation)

The dev server automatically detects the port from your git branch name, enabling multiple worktrees to run
simultaneously without port conflicts:

| Branch | Port |
|--------|------|
| `work/164-feature-name` | 9164 |
| `work/120-other-feature` | 9120 |
| `main` (no issue number) | 9000 |

**How it works:**
- Extracts the first number (1-999) from the branch name
- Adds it to base port 9000 (e.g., issue #164 → port 9164)
- Falls back to 9000 if no number is found

**Override options:**
```shell
# Environment variable (highest priority)
AUTO_MOBILE_PORT=8080 bun run dev

# Command line flag
bun run dev:port 8080
```

This allows you to run multiple worktrees simultaneously:
```shell
# Terminal 1 (work/164-feature)
cd ~/worktrees/auto-mobile/work-164-feature
bun run dev  # → port 9164

# Terminal 2 (work/120-other)
cd ~/worktrees/auto-mobile/work-120-other
bun run dev  # → port 9120
```

### Health Check Endpoint

Monitor server status and detect restarts using the health endpoint:

```shell
# Use the port for your worktree (e.g., 9164 for issue #164)
curl http://localhost:9164/health
```

Response:
```json
{
  "status": "ok",
  "server": "AutoMobile",
  "version": "0.0.6",
  "instanceId": "unique-server-instance-id",
  "port": 9164,
  "branch": "work/164-feature-name",
  "uptime": {
    "ms": 12345,
    "human": "12s"
  },
  "activeSessions": 1,
  "transport": "streamable"
}
```

- `instanceId` changes each time the server restarts (detect reconnection needs)
- `port` shows the auto-detected or configured port
- `branch` shows the current git branch

## MCP Client Configuration

### Option 1: Native HTTP (Recommended for Claude Code)

Claude Code and other modern MCP clients support direct HTTP connections without needing mcp-remote:

**Claude Code** (`~/.claude/claude_desktop_config.json` or project `.mcp.json`):
```json
{
  "mcpServers": {
    "AutoMobile-dev": {
      "type": "url",
      "url": "http://localhost:9000/auto-mobile/streamable"
    }
  }
}
```

### Option 2: Using mcp-remote

For MCP clients that only support stdio transport, use mcp-remote as a proxy:

```json
{
  "mcpServers": {
    "AutoMobile-dev": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:9000/auto-mobile/streamable"
      ]
    }
  }
}
```

![firebender-mcp-server-setup.png](../img/firebender-mcp-server-setup-dev.png)

## Troubleshooting

### Server Restarts and Session Loss

When the server restarts (due to code changes), active MCP sessions are lost. This is expected behavior.

**Symptoms:**
- Error: "Session not found"
- MCP client shows connection errors
- Tools stop responding

**Solutions:**
1. **Claude Code**: Restart the MCP server from Claude Code's interface or restart Claude Code
2. **Cursor/Other clients**: Reload the window or restart the client
3. **Check server is running**: `curl http://localhost:9000/health`

### Port Already in Use

If you see "EADDRINUSE" or the server won't start:

```shell
# Find and kill processes using port 9000
lsof -i :9000
kill -9 <PID>

# Or use a different port
bun run dev:port 9001
```

### Connection Refused

**Symptoms:**
- `curl: (7) Failed to connect to localhost port 9000`
- MCP client can't connect

**Solutions:**
1. Ensure the dev server is running: `bun run dev`
2. Check the correct port is being used
3. Look for errors in the server output

### mcp-remote Issues

If using mcp-remote and experiencing issues:

1. **Stale mcp-remote process**: Kill any lingering processes
   ```shell
   pkill -f mcp-remote
   ```

2. **Version mismatch**: Ensure mcp-remote is up to date
   ```shell
   npx -y mcp-remote@latest http://localhost:9000/auto-mobile/streamable
   ```

3. **Consider native HTTP**: If your MCP client supports it, use native HTTP instead of mcp-remote for better reliability

### Debug Mode

Enable debug logging for more visibility:

```shell
bun run dev --debug
```

Enable performance timing:

```shell
bun run dev --debug-perf
```

## Development Tips

### Verify Connection

Quick test to verify the server is working:

```shell
# Check health
curl http://localhost:9000/health

# Initialize a session
curl -X POST http://localhost:9000/auto-mobile/streamable \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

### Multiple Instances

To run multiple dev servers (e.g., for testing):

```shell
# Terminal 1
bun run dev:port 9000

# Terminal 2
bun run dev:port 9001
```

### Watching Logs

Server logs are written to stdout. For persistent logging, you can redirect:

```shell
bun run dev 2>&1 | tee dev-server.log
```
