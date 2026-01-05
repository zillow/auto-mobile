# Daemon CLI Notes

AutoMobile's CLI routes tool execution through the daemon by default (the `doctor` command can fall back to direct
execution if the daemon is unavailable). Use the `--daemon` subcommands to manage the background process.

## Common Commands

```bash
auto-mobile --daemon start
auto-mobile --daemon status
auto-mobile --daemon health
auto-mobile --daemon restart
auto-mobile --daemon stop
```

CLI tool calls will start the daemon automatically if needed:

```bash
auto-mobile --cli listDevices
```

## Implementation References

- CLI daemon routing and doctor fallback: https://github.com/kaeawc/auto-mobile/blob/main/src/cli/index.ts#L80-L320
- Daemon lifecycle commands: https://github.com/kaeawc/auto-mobile/blob/main/src/daemon/manager.ts#L27-L519
- Daemon socket path + PID file: https://github.com/kaeawc/auto-mobile/blob/main/src/daemon/constants.ts#L1-L50
