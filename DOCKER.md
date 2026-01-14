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

**macOS (host emulator, container connects via ADB):**

```bash
docker run --platform=linux/amd64 -it --rm --name auto-mobile \
  -e ANDROID_HOME=/opt/android-sdk \
  -e ANDROID_SDK_ROOT=/opt/android-sdk \
  -e AUTOMOBILE_EMULATOR_EXTERNAL=true \
  -e AUTOMOBILE_EMULATOR_HEADLESS=true \
  -v "$HOME/.android:/home/automobile/.android" \
  -v "$HOME/.auto-mobile:/home/automobile/.auto-mobile" \
  auto-mobile:latest
```

Do not mount the macOS SDK into `/opt/android-sdk` (mac binaries will not run in the Linux container).

Then connect ADB inside the container to the host emulator:
```bash
docker exec -it auto-mobile adb connect host.docker.internal:5555
```

Use `AUTOMOBILE_EMULATOR_HEADLESS=true` for headless starts, or `AUTOMOBILE_EMULATOR_ARGS` for extra flags.

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
