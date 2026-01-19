# Docker Setup for AutoMobile

This guide covers how to use Docker to run AutoMobile MCP with a host control daemon to expose Android & iOS tools. We've taken this approach in order to seamlessly work with the most common mobile engineering setup where such tools are directly installed. The iOS tools will only work on MacOS hosts.

The Docker setup provides a complete environment with:

- **Bun 1.3.6** - JavaScript runtime for the MCP server
- **Azul Zulu JDK 21** - Required for Android tooling
- **Android SDK** - platform-tools, build-tools 35.0.0, platforms (API 36)
- **tini** - Proper signal handling for stdio MCP transport
- **ktfmt** - Kotlin formatter
- **ripgrep, shellcheck, git, jq** - Development utilities

## Platform Support

- **Linux** (x86_64, aarch64): Full support
- **macOS** (Intel, Apple Silicon): Partial support
  - Physical device access limited by Docker Desktop
  - Emulators not recommended
- **Windows** (WSL2): Partial support
  - Requires WSL2 with USB support
  - See [WSL USB documentation](https://learn.microsoft.com/en-us/windows/wsl/connect-usb)

## Host Control Daemon

The Docker container runs the MCP server, but Android tools like `adb` need access to devices connected to your host machine. The **Host Control Daemon** bridges this gap by running on your host and exposing device access to the containerized MCP server.

The daemon:

- Maintains a pool of available devices for test execution
- Allocates devices to test sessions on demand
- Tracks test execution history for automatic optimization
- Communicates via Unix socket at `/tmp/auto-mobile-daemon-<uid>.sock`

### Starting the Daemon

The daemon starts automatically when you run the MCP server. For manual control:

```bash
# Start daemon in background
npx @kaeawc/auto-mobile@latest --daemon

# Check daemon status
curl --unix-socket /tmp/auto-mobile-daemon-$(id -u).sock http://localhost/daemon/availableDevices
```

### Daemon API

| Endpoint | Description |
|----------|-------------|
| `daemon/availableDevices` | Query devices in the pool |
| `daemon/refreshDevices` | Rediscover connected devices |
| `daemon/sessionInfo` | Get active session details |
| `daemon/releaseSession` | Return device to pool |

See [Daemon Design Doc](../design-docs/mcp/daemon/index.md) for architecture details.

## Docker MCP Server Configuration Examples

Use the official published image for easier setup:

```json
{
  "mcpServers": {
    "auto-mobile": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--init",
        "--pull=always",
        "--privileged",
        "--network", "host",
        "-v", "${HOME}/.android:/home/automobile/.android",
        "kaeawc/auto-mobile:latest"
      ]
    }
  }
}
```

**Note**: The `--pull=always` flag ensures you get the latest version automatically.



## Platform-Specific Notes

### macOS

- Docker Desktop required to be installed and running

### Linux

- Full USB device access with `--privileged`
- May need to add user to `plugdev` group for USB permissions on host
- Best platform for full Docker + ADB functionality
- Note: this is untested. If you would like to try out this setup and confirm it works that would be very helpful.

### Windows (WSL2)

- Requires WSL2 with USB support (usbipd-win)
- See [WSL USB documentation](https://learn.microsoft.com/en-us/windows/wsl/connect-usb)
- Docker Desktop for Windows required
- Note: this is untested. If you would like to try out this setup and confirm it works that would be very helpful.
