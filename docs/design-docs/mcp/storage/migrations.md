# Migrations

AutoMobile uses SQLite migrations to keep the MCP server schema up to date across releases.
Migrations run on server startup and are managed with Kysely's `Migrator` + `FileMigrationProvider`.

## Layout

- Source migrations live in `src/db/migrations` as TypeScript files.
- Build output copies them to `dist/src/db/migrations` so the runtime can load them from disk.

## Resolution rules

The migration directory is resolved in this order:

```mermaid
flowchart LR
    A["Resolve migrations directory"] --> B{"AUTOMOBILE_MIGRATIONS_DIR set?"};
    B -->|"yes"| C["Use AUTOMOBILE_MIGRATIONS_DIR path"];
    B -->|"no"| D{"dist/src/db/migrations exists?"};
    D -->|"yes"| E["Use dist/src/db/migrations<br/>(bundled server)"];
    D -->|"no"| F{"src/db/migrations exists?"};
    F -->|"yes"| G["Use src/db/migrations<br/>(running from source)"];
    F -->|"no"| H["Throw error with checked paths"];
    classDef decision fill:#FF3300,stroke-width:0px,color:white;
    classDef logic fill:#525FE1,stroke-width:0px,color:white;
    classDef result stroke-width:0px;
    class A,H result;
    class B,D,F decision;
    class C,E,G logic;
```

If no folder is found, the server throws an error describing the checked paths.

## Docker notes

The Docker image runs the bundled server from `dist/src/index.js`, so migrations must be present
in `dist/src/db/migrations`. The build pipeline copies migrations into `dist` to satisfy this.

## Related code

- `src/db/migrator.ts` resolves the migration folder and runs migrations.
- `build.ts` copies migrations into `dist` during `bun run build`.
