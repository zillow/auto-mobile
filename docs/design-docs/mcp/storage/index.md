# Overview

AutoMobile persists state across sessions using SQLite for metadata and the filesystem for larger payloads.

```mermaid
flowchart TB
    subgraph Runtime["Runtime Data"]
        NavGraph["🗺️ Navigation Graph"]
        Sessions["📱 Device Sessions"]
        Config["⚙️ Configuration"]
    end

    subgraph Storage["Persistent Storage"]
        SQLite["🗄️ SQLite<br/>~/.auto-mobile/auto-mobile.db"]
        Snapshots["📸 Snapshots<br/>~/.automobile/snapshots/"]
        Migrations["🔄 Migrations<br/>src/db/migrations/"]
    end

    NavGraph --> SQLite
    Sessions --> SQLite
    Config --> SQLite
    SQLite -.->|"schema updates"| Migrations
    SQLite -.->|"metadata"| Snapshots

    classDef runtime fill:#FF3300,stroke-width:0px,color:white;
    classDef storage fill:#525FE1,stroke-width:0px,color:white;

    class NavGraph,Sessions,Config runtime;
    class SQLite,Snapshots,Migrations storage;
```

## Storage Locations

| Path | Purpose |
|------|---------|
| `~/.auto-mobile/auto-mobile.db` | SQLite database for metadata |
| `~/.automobile/snapshots/` | Device state snapshot payloads |
| `~/.auto-mobile/*.sock` | Unix sockets for configuration |

## Topics

| Document | Description |
|----------|-------------|
| [Database Migrations](migrations.md) | Schema management with Kysely |
| [Device Snapshots](snapshots.md) | Capture and restore device state |

## Database Schema

The SQLite database stores:

- **Navigation graph** - Screens, edges, and fingerprints
- **Device sessions** - Active device connections
- **Snapshot metadata** - Index of captured snapshots
- **Configuration** - Feature flags and settings

## Migration System

Migrations run automatically on server startup:

```mermaid
flowchart LR
    Start["Server Start"] --> Check["Check Schema"];
    Check --> Run["Run Pending<br/>Migrations"];
    Run --> Ready["Ready"];

    classDef step fill:#525FE1,stroke-width:0px,color:white;
    class Start,Check,Run,Ready step;
```

See [Database Migrations](migrations.md) for details on adding new migrations.

## Snapshot Storage

Device snapshots use a hybrid approach:

| Snapshot Type | Metadata | Payload |
|---------------|----------|---------|
| VM Snapshot | SQLite | Emulator AVD directory |
| ADB Snapshot | SQLite | `~/.automobile/snapshots/` |

See [Device Snapshots](snapshots.md) for capture/restore workflows.
