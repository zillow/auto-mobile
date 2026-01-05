# CLI

## Basic Usage

```bash
auto-mobile --cli help
auto-mobile --cli <tool-name> [--param value ...]
auto-mobile --cli --session-uuid <uuid> <tool-name> [--param value ...]
```

Use `auto-mobile --cli help` to list available tools and `auto-mobile --cli help <tool-name>` to inspect the schema for
parameters.

Example tool invocations:

```bash
auto-mobile --cli observe --platform android
auto-mobile --cli tapOn --platform android --action tap --text "Submit"
```

## Daemon Mode

Start the background daemon to keep a warm MCP server across CLI invocations:

```bash
auto-mobile --daemon start
auto-mobile --daemon status
auto-mobile --daemon stop
auto-mobile --daemon restart
```

CLI tool execution always goes through the daemon. If the daemon is unavailable, AutoMobile will attempt to start it
automatically. The `doctor` command is the only CLI entry point that can fall back to direct execution when the daemon
isn't available.

## Implementation references

- [`src/cli/index.ts#L29-L215`](https://github.com/kaeawc/auto-mobile/blob/main/src/cli/index.ts#L29-L215) for CLI argument parsing, session UUID handling, daemon execution, and the doctor fallback path.
- [`src/daemon/manager.ts#L27-L170`](https://github.com/kaeawc/auto-mobile/blob/main/src/daemon/manager.ts#L27-L170) for daemon lifecycle commands (`start`, `stop`, `status`, `restart`).
