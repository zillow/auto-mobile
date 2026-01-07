# Features - MCP Server

AutoMobile's MCP makes its various [actions](actions.md) available as tool calls, exposes device state through
[resources](resources.md), and automatically performs [observations](observation.md) within an
[interaction loop](interaction-loop.md). This is a simple overview diagram, for more detail see the
[full MCP server system design](system-design.md).

```mermaid
stateDiagram-v2
  Agent: Agent
  RequestHandler: Request Handler
  DeviceSessionManager: Device Session Manager
  InteractionLoop: Interaction Loop

  Agent --> RequestHandler
  RequestHandler --> Agent
  RequestHandler --> DeviceSessionManager
  InteractionLoop --> RequestHandler: 🖼️ Processed Results
  DeviceSessionManager --> InteractionLoop: 📱
```

## Additional features

- [Video recording](video-recording.md) for low-overhead capture and CI artifacts.
- [Database migrations](migrations.md) for MCP server persistence.

## Configuration

AutoMobile MCP defaults to STDIO mode (good for workstations and CI automation). Streamable HTTP is available for
clients that need HTTP transports and to support hot reloading local development.

```shell
npx -y @kaeawc/auto-mobile@latest
```

If you have a private npm registry you can instead do the following

```shell
npx --registry https://your.awesome.private.registry.net/path/to/npm/proxy -y @kaeawc/auto-mobile@latest
```

A lot of MCP clients configure MCP servers through JSON, this sample will work with most

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

Configuration is provided via CLI flags and environment variables, and runtime feature flags can be toggled through MCP
tools when needed.
