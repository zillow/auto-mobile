# Running from Source

Whether you want to contribute to AutoMobile or just want to run the MCP directly from source, this guide will set you
up for the development environment maintainers use.

## Build from Source

If you're about to build AutoMobile from source for the very first time after cloning you should do the following:

```shell
pnpm install
pnpm run build
pnpm install -g
```

## Hot Reload

AutoMobile supports multiple transport modes but the only supported use case right now is streamable transport over the
`mcp-remote` npm package. This allows decoupling of the MCP server process from the STDIO interface to continually
recompile code as changes are made. 

### Options

**Streamable HTTP (Recommended)** - Modern MCP transport with full streaming support:
```shell
# Start with hot reloading (ts-node-dev), streamable is the default
pnpm run dev
pnpm run dev:streamable

# Custom port
pnpm run dev:port 8080
```

Configuration for your favorite MCP client:

```json
{
  "mcpServers": {
    "AutoMobile": {
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
