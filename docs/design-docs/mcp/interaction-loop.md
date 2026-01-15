# Interaction Loop

![Interaction loop demo - setting an alarm](../../img/clock-app-demo.gif)

This interaction loop is supported by comprehensive [observation](observe/index.md) of UI state and UI stability checks
(Android uses `dumpsys gfxinfo`-based idle detection) before and after action execution. Together, that allows for
accurate and precise exploration with the [action tool calls](tools.md).

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant MCP as MCP Server
    participant Device as Device

    Agent->>MCP: 🤖 Interaction Request
    MCP->>Device: 👀 Observe
    Device-->>MCP: 📱 UI State/Data (Cached)

    MCP->>Device: ⚡ Execute Actions
    Device-->>MCP: ✅ Result

    MCP->>Device: 👀 Observe
    Device-->>MCP: 📱 UI State/Data
    MCP-->>Agent: 🔄 Interaction Response with UI State
```