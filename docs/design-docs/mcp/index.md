# MCP Server

The MCP server exposes AutoMobile's capabilities as tool calls, resources, and real-time observations.

AutoMobile's MCP makes its various [actions](tools.md) available as tool calls and automatically performs
[observations](observe/index.md) within an [interaction loop](interaction-loop.md).

```mermaid
flowchart TB
    subgraph Clients
        Agent["🤖 AI Agent"]
        IDE["💻 IDE Plugin"]
        CLI["⌨️ CLI"]
    end

    subgraph MCP["MCP Server"]
        Transport["Transport Layer<br/>(STDIO / HTTP)"]
        Registry["Tool & Resource<br/>Registry"]

        subgraph Features["Feature Composition"]
            Actions["Actions<br/>(tap, swipe, input)"]
            Observe["Observation<br/>(hierarchy, screenshot)"]
            AppMgmt["App Management<br/>(launch, terminate)"]
            DeviceMgmt["Device Management<br/>(list, start, kill)"]
        end
    end

    subgraph External["External Interfaces"]
        WS["📡 WebSocket<br/>Clients"]
        Socket["🔌 Unix Socket<br/>Commands"]
        CLITools["🛠️ CLI Tools<br/>(adb, xcrun)"]
    end

    subgraph Devices["Devices"]
        Android["📱 Android"]
        iOS["📱 iOS"]
    end

    Agent --> Transport
    IDE --> Transport
    CLI --> Transport
    Transport --> Registry
    Registry --> Features

    Actions --> WS
    Observe --> WS
    AppMgmt --> CLITools
    DeviceMgmt --> CLITools
    DeviceMgmt --> Socket

    WS --> Android
    WS --> iOS
    CLITools --> Android
    CLITools --> iOS

    classDef client fill:#FF3300,stroke-width:0px,color:white;
    classDef mcp fill:#525FE1,stroke-width:0px,color:white;
    classDef external fill:#00AA55,stroke-width:0px,color:white;
    classDef device fill:#666666,stroke-width:0px,color:white;

    class Agent,IDE,CLI client;
    class Transport,Registry,Actions,Observe,AppMgmt,DeviceMgmt mcp;
    class WS,Socket,CLITools external;
    class Android,iOS device;
```

## Core Capabilities

| Area | Documentation |
|------|---------------|
| **Actions** | [Tool calls](tools.md) for taps, swipes, input, app management |
| **Observation** | [Real-time UI capture](observe/index.md) with view hierarchy |
| **Interaction Loop** | [Observe-act-observe](interaction-loop.md) cycle with idle detection |
| **Resources** | [Device state](resources.md) exposed via MCP resources |

## Additional Features

| Feature | Description |
|---------|-------------|
| [Video Recording](observe/video-recording.md) | Low-overhead capture for CI artifacts |
| [Visual Highlighting](observe/visual-highlighting.md) | Debug overlays for element targeting |
| [Navigation Graph](nav/index.md) | Automatic screen flow mapping |
| [Feature Flags](feature-flags.md) | Runtime configuration |
| [Migrations](storage/migrations.md) | Database schema management |

## Quick Start

```bash
npx -y @kaeawc/auto-mobile@latest
```

For MCP client configuration:

```json
{
  "mcpServers": {
    "auto-mobile": {
      "command": "npx",
      "args": ["-y", "@kaeawc/auto-mobile@latest"]
    }
  }
}
```

## Transport Modes

| Mode | Use Case |
|------|----------|
| **STDIO** (default) | Workstations, CI automation |
| **Streamable HTTP** | Hot reload development, HTTP-only clients |

See [installation](../../install/overview.md) for detailed configuration options.
