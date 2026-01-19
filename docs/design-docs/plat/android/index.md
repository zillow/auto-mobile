# Overview

AutoMobile's Android stack spans the MCP server, daemon, IDE plugin, JUnitRunner, and device-side services.

```mermaid
flowchart TB
    subgraph "AI Agents"
        Agent[AI Agent<br/>Claude, GPT, etc.]
    end

    subgraph "AutoMobile Platform"
        MCP[MCP Server<br/>Bun + TypeScript]
        Daemon[Daemon<br/>Device Pool & Session Mgmt]
        IDE[IDE Plugin<br/>Android Studio]
    end

    subgraph "Test Execution"
        JUnit[JUnitRunner<br/>AI Self-Healing Tests]
    end

    subgraph "Android Devices"
        Device1[Physical Device]
        Device2[Emulator]
        AccessService[Accessibility Service<br/>View Hierarchy]
    end

    Agent -->|MCP Protocol| MCP
    IDE -->|HTTP/STDIO/Socket| MCP
    MCP -->|Manages| Daemon
    MCP -->|ADB Commands| Device1
    MCP -->|ADB Commands| Device2
    JUnit -->|MCP tools| MCP
    Daemon -->|Allocates| Device1
    Daemon -->|Allocates| Device2
    Device1 -->|WebSocket/File| AccessService
    Device2 -->|WebSocket/File| AccessService
    AccessService -->|UI State| MCP

    style MCP fill:#4A90E2,color:#fff
    style Agent fill:#50E3C2,color:#000
    style IDE fill:#F5A623,color:#000
    style JUnit fill:#BD10E0,color:#fff
    style Daemon fill:#7ED321,color:#000
```

## MCP Server

The [MCP server](../../mcp/index.md) implements the [Model Context Protocol](https://modelcontextprotocol.io/introduction).
It has [observation](../../mcp/observe/index.md) built into its [interaction loop](../../mcp/interaction-loop.md)
with UI stability checks (gfxinfo-based on Android). Together, that enables fast, precise exploration.

## Test Execution

The Android JUnitRunner executes AutoMobile tests on devices and emulators. It extends the standard
Android testing framework with richer reporting and tighter MCP integration, with a long-term goal of
self-healing test flows.

## Pooled Device Management

Multi-device support includes emulator control and app lifecycle management. As long as you have available ADB
connections, AutoMobile tracks which device is used for each execution plan or MCP session. CI still needs available
device connections, but AutoMobile handles selection and readiness checks. During STDIO MCP sessions,
🔧 [`setActiveDevice`](../../mcp/tools/index.md) is set once and reused for the session.

## Android Accessibility Service

The Android Accessibility Service provides real-time access to view hierarchy data and UI elements without
rooting or special permissions beyond accessibility enablement. When enabled, it monitors UI changes,
stores the latest hierarchy in app-private storage, and streams updates over WebSocket.

## Batteries Included

AutoMobile includes tooling to minimize setup for required platform dependencies.
