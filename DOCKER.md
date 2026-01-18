# Docker Quick Start

This project includes Docker support for running AutoMobile in a containerized environment with all required Android development tools.

## For MCP Clients (Claude Desktop, Continue.dev, etc.)

To use this Docker image with MCP clients, see the [MCP Client Configuration Guide](docs/mcp-docker-config.md) for complete setup instructions.

**Quick example for Claude Desktop**:
```json
{
  "mcpServers": {
    "auto-mobile": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "--init", "--privileged", "--network", "host", "auto-mobile:latest"]
    }
  }
}
```

## For Development & Testing

```bash
# Build the image
docker-compose build

# Run in production mode
docker-compose up auto-mobile

# Run in development mode (with auto-reload)
docker-compose up auto-mobile-dev
```

## Pre-built Images

Published images are available on Docker Hub: [kaeawc/auto-mobile](https://hub.docker.com/r/kaeawc/auto-mobile)

```bash
# Pull latest version
docker pull kaeawc/auto-mobile:latest

# Pull specific version
docker pull kaeawc/auto-mobile:0.0.7

# Pull major.minor version (recommended for stability)
docker pull kaeawc/auto-mobile:0.0

# Pull specific commit
docker pull kaeawc/auto-mobile:main-abc1234
```

**For maintainers**: See [Docker Hub Setup Guide](docs/docker-hub-setup.md) for publishing credentials and workflow configuration.

## What's Included

The Docker image contains:
- Bun 1.3.x
- Java 21
- Android SDK (API 36, Build Tools 35.0.0)
- Platform Tools (ADB)
- All required development tools (ripgrep, ktfmt, lychee, shellcheck, xmlstarlet)

To include Android emulator/system images, build with:
```bash
docker build --platform=linux/amd64 --build-arg ANDROID_INSTALL_EMULATOR=true -t auto-mobile:latest .
```

## Common Commands

```bash
# Interactive shell
docker-compose exec auto-mobile bash

# Run tests
docker-compose exec auto-mobile npm test

# Run linter
docker-compose exec auto-mobile npm run lint

# Check connected devices
docker-compose exec auto-mobile adb devices

# Build Android components
docker-compose exec auto-mobile bash -c "cd android && ./gradlew build"
```

## Requirements

- Docker Engine 20.10+
- Docker Compose v2.0+
- For ADB device access: Privileged mode and host networking (already configured)
- For slim images without emulator: Host Android SDK + AVDs mounted into the container

## Documentation

For complete documentation, see [docs/docker.md](docs/docker.md)

## Platform Notes

- **Linux**: Full support
- **macOS**: Limited ADB device access (Docker Desktop limitation). Use `--platform=linux/amd64` on Apple Silicon.
- **Windows**: Requires WSL2 with USB passthrough
- **iOS**: Not supported (requires macOS and Apple hardware)

## Troubleshooting

### Using host emulators with the slim image

When the image is built without the emulator (`ANDROID_INSTALL_EMULATOR=false`), use the host emulator setup for
your OS so the container can access your installed AVDs and running emulators.

**Linux (host SDK + emulator inside container):**

```bash
docker run --platform=linux/amd64 -it --rm --name auto-mobile \
  --network host \
  -e ANDROID_HOME=/opt/android-sdk \
  -e ANDROID_SDK_ROOT=/opt/android-sdk \
  -e AUTOMOBILE_EMULATOR_HEADLESS=true \
  -v "$HOME/Android/Sdk:/opt/android-sdk" \
  -v "$HOME/.android:/home/automobile/.android" \
  -v "$HOME/.auto-mobile:/home/automobile/.auto-mobile" \
  auto-mobile:latest
```

**macOS (host emulator, container auto-connects via ADB):**

```bash
docker run --platform=linux/amd64 -it --rm --name auto-mobile \
  -e ANDROID_HOME=/opt/android-sdk \
  -e ANDROID_SDK_ROOT=/opt/android-sdk \
  -e AUTOMOBILE_EMULATOR_EXTERNAL=true \
  -v "$HOME/.android:/home/automobile/.android" \
  -v "$HOME/.auto-mobile:/home/automobile/.auto-mobile" \
  auto-mobile:latest
```

With `AUTOMOBILE_EMULATOR_EXTERNAL=true`, the container **automatically connects** to host emulators running on
`host.docker.internal:5555-5585`. The auto-connect service scans for emulators every 10 seconds and reconnects
when emulators restart. No manual `adb connect` required.

Do not mount the macOS SDK into `/opt/android-sdk` (macOS binaries will not run in the Linux container).

**Environment variables for auto-connect:**

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTOMOBILE_EMULATOR_EXTERNAL` | `false` | Enable external/host emulator mode with auto-connect |
| `AUTOMOBILE_HOST_GATEWAY` | `host.docker.internal` | Hostname to connect to host emulators |
| `AUTOMOBILE_EMULATOR_SCAN_INTERVAL_MS` | `10000` | How often to scan for new emulators (ms) |
| `AUTOMOBILE_EMULATOR_PORT_START` | `5555` | First emulator ADB port to scan |
| `AUTOMOBILE_EMULATOR_PORT_END` | `5585` | Last emulator ADB port to scan |

### Advanced: ADB Server Tunnel Mode

For full ADB command support (including `adb emu kill` and other console commands), you can connect the container to the host's ADB server instead of individual device ports:

```bash
# On the host, ensure ADB server is running
adb start-server

# Run container with ADB server tunnel
docker run --platform=linux/amd64 -it --rm --name auto-mobile \
  -e ANDROID_HOME=/opt/android-sdk \
  -e ANDROID_SDK_ROOT=/opt/android-sdk \
  -e AUTOMOBILE_EMULATOR_EXTERNAL=true \
  -e AUTOMOBILE_ADB_SERVER_HOST=host.docker.internal \
  -e AUTOMOBILE_ADB_SERVER_PORT=5037 \
  -v "$HOME/.android:/home/automobile/.android" \
  -v "$HOME/.auto-mobile:/home/automobile/.auto-mobile" \
  auto-mobile:latest
```

**Benefits of ADB Server Tunnel:**
- All devices (emulators and physical) visible automatically
- Full ADB command support including console commands (`emu kill`, etc.)
- Single connection point instead of per-device port scanning

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTOMOBILE_ADB_SERVER_HOST` | (none) | Host's ADB server address (enables tunnel mode when set) |
| `AUTOMOBILE_ADB_SERVER_PORT` | `5037` | Host's ADB server port |

### Advanced: Host Control Daemon

For starting/stopping emulators and running SDK commands from within the container, run the host control daemon on your macOS host:

```bash
# Start the host control daemon (runs on port 15037)
node scripts/docker/host-control-daemon.js

# Or with custom settings
node scripts/docker/host-control-daemon.js --port 15037 --host 0.0.0.0
```

The daemon provides a JSON-RPC interface for:
- `list-avds` - List available AVDs
- `start-emulator` - Start an emulator by AVD name
- `stop-emulator` - Stop an emulator
- `list-running` - List running emulators
- `avdmanager` - Run avdmanager commands
- `sdkmanager` - Run sdkmanager commands

Run the container with host control:

```bash
docker run --platform=linux/amd64 -it --rm --name auto-mobile \
  -e AUTOMOBILE_EMULATOR_EXTERNAL=true \
  -e AUTOMOBILE_HOST_CONTROL_HOST=host.docker.internal \
  -e AUTOMOBILE_HOST_CONTROL_PORT=15037 \
  -v "$HOME/.android:/home/automobile/.android" \
  -v "$HOME/.auto-mobile:/home/automobile/.auto-mobile" \
  auto-mobile:latest
```

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTOMOBILE_HOST_CONTROL_HOST` | `host.docker.internal` | Host control daemon address |
| `AUTOMOBILE_HOST_CONTROL_PORT` | `15037` | Host control daemon port |
| `AUTOMOBILE_HOST_CONTROL_ENABLED` | `true` | Set to `false` to disable host control integration |

### ADB not seeing devices?
1. Ensure device is connected to host: `adb devices`
2. Restart ADB server: `adb kill-server && adb start-server`
3. Verify container runs with `--privileged` flag

### Build failing?
```bash
# Clean and rebuild
docker-compose down -v
docker-compose build --no-cache
docker-compose up
```

## Testing

### Validate Dockerfile
```bash
# Lint Dockerfile
./scripts/docker/validate_dockerfile.sh

# Run container structure tests
./scripts/docker/test_container.sh

# Test host emulator access from the slim image (auto-starts host emulator if needed)
./scripts/docker/test_host_emulator_mcp.sh
```

### Test MCP stdio Protocol
```bash
# Build image
docker build --platform=linux/amd64 -t auto-mobile:latest .

# Test stdio communication
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | docker run --platform=linux/amd64 -i --rm --init auto-mobile:latest
```

For more help, see the [full Docker documentation](docs/docker.md) and [MCP configuration guide](docs/mcp-docker-config.md).
