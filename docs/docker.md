# Docker Setup for AutoMobile

This guide covers how to use Docker to run AutoMobile with all required Android development tools pre-installed.

## Overview

The Docker setup provides a complete Android development environment with:

- **Bun 1.3.5** - All-in-one JavaScript runtime and package manager
- **Java 21** - Required for Android build tools and ktfmt
- **Android SDK** - Latest SDK with platform tools and build tools
  - Platform Tools (includes ADB)
  - Build Tools 35.0.0
  - Android API 36 (compile and target SDK)
  - Android Emulator and system images
- **Development Tools**:
  - ripgrep - Fast code search
  - ktfmt - Kotlin code formatter
  - lychee - Link checker
  - shellcheck - Shell script validator
  - xmlstarlet - XML processing

### Pre-built Images

Official images are published to Docker Hub for linux/amd64. The Dockerfile is x86_64-only; ARM64 is not supported.

```bash
# Pull the latest version
docker pull kaeawc/auto-mobile:latest

# Pull a specific version
docker pull kaeawc/auto-mobile:v0.0.7
```

**Available on Docker Hub**: https://hub.docker.com/r/kaeawc/auto-mobile

For setup and publishing details, see the [Docker Hub Setup Guide](docker-hub-setup.md).

## Quick Start

> **Note**: If you're setting up AutoMobile for use with MCP clients (Claude Desktop, Continue.dev, Cline, etc.), see the [MCP Client Configuration Guide](mcp-docker-config.md) for specific setup instructions.

### Build the Docker Image

```bash
docker build -t auto-mobile:latest .
```

Or using docker-compose:

```bash
docker-compose build
```

### Run the Container

#### Using Docker Compose (Recommended)

For production mode:
```bash
docker-compose up auto-mobile
```

For development mode with auto-reload:
```bash
docker-compose up auto-mobile-dev
```

**Note**: The checked-in `docker-compose.yml` uses `npm` commands, but the image is Bun-based. If you're using the
provided compose file, update the service commands to `bun` (or override them) to match the runtime.

#### Using Docker Directly

```bash
docker run -it --rm \
  --privileged \
  --network host \
  -v ~/.android:/home/automobile/.android \
  -v ~/.auto-mobile:/home/automobile/.auto-mobile \
  -v $(pwd)/scratch:/workspace/scratch \
  auto-mobile:latest
```

## Container Configuration

### Privileged Mode

`--privileged` is the simplest option for USB ADB access, but you can also grant narrower access by mounting
`/dev/bus/usb` and adding `MKNOD` capabilities (as shown in `docker-compose.yml`).

### Network Mode

Using `network_mode: host` allows the container to access ADB devices on the host machine without complex port mapping.

### Volume Mounts

The docker-compose configuration includes several volume mounts:

1. **Source Code** (`./:/workspace`)
   - Enables live code changes during development
   - Comment out for production builds

2. **Android SDK** (`android-sdk:/opt/android-sdk`)
   - Persists Android SDK between container restarts
   - Avoids re-downloading SDK components

3. **Node Modules** (`node-modules:/workspace/node_modules`)
   - Speeds up container startup
   - Prevents conflicts between host and container binaries

4. **ADB Keys** (`~/.android:/home/automobile/.android`)
   - Shares ADB authorization keys with host
   - Devices authorized on host work in container

5. **AutoMobile DB** (`~/.auto-mobile:/home/automobile/.auto-mobile`)
   - Persists the SQLite database used for navigation graphs and audits

6. **Scratch Directory** (`./scratch:/workspace/scratch`)
   - Outputs and temporary files accessible from host

## Using ADB with Docker

### Connecting to Physical Devices

1. Connect your Android device via USB to the host machine
2. Ensure ADB is running on the host: `adb devices`
3. The container will have access to the device through host networking

### Verifying Device Connection

Inside the container:
```bash
docker-compose exec auto-mobile adb devices
```

Or if running directly:
```bash
docker exec -it auto-mobile adb devices
```

### Starting an Emulator

The Docker image includes Android emulator support:

```bash
# List available system images
docker-compose exec auto-mobile avdmanager list

# Create an AVD
docker-compose exec auto-mobile avdmanager create avd \
  -n test_device \
  -k "system-images;android-36;google_apis;x86_64"

# Start the emulator (requires X11 forwarding for GUI)
docker-compose exec auto-mobile emulator -avd test_device -no-window -no-audio
```

## Development Workflow

### Interactive Shell

Access the container shell for debugging:

```bash
docker-compose exec auto-mobile bash
```

### Running Tests

```bash
# Run all tests
docker-compose exec auto-mobile bun test

# Run specific test
docker-compose exec auto-mobile bun run test -- --grep "test name"

# Run tests with coverage
docker-compose exec auto-mobile bun run test:coverage
```

### Linting and Validation

```bash
# Run linter
docker-compose exec auto-mobile bun run lint

# Run build
docker-compose exec auto-mobile bun run build

# Validate shell scripts
docker-compose exec auto-mobile scripts/shellcheck/validate_shell_scripts.sh

# Validate Kotlin formatting
docker-compose exec auto-mobile scripts/ktfmt/validate_ktfmt.sh
```

## Building Android Components

The container includes full Gradle support for building Android components:

```bash
# Build accessibility service
docker-compose exec auto-mobile bash -c "cd android && ./gradlew :accessibility-service:assembleDebug"

# Build playground app
docker-compose exec auto-mobile bash -c "cd android && ./gradlew :playground:app:assembleDebug"

# Run Android unit tests
docker-compose exec auto-mobile bash -c "cd android && ./gradlew :junit-runner:test"
```

## Troubleshooting

### ADB Connection Issues

If ADB cannot see devices:

1. **Check host ADB server**:
   ```bash
   adb devices
   ```

2. **Restart ADB on host**:
   ```bash
   adb kill-server
   adb start-server
   ```

3. **Verify privileged mode**: Ensure the container runs with `--privileged`

4. **Check USB permissions**: The host user must have USB device access

### Build Failures

If builds fail with permission errors:

1. **Reset ownership** (if mounted volumes have wrong permissions):
   ```bash
   docker-compose exec -u root auto-mobile chown -R automobile:automobile /workspace
   ```

2. **Clear caches**:
   ```bash
   docker-compose exec auto-mobile bun run clean
   docker-compose exec auto-mobile rm -rf node_modules
   docker-compose up --build
   ```

## Implementation References

- Dockerfile (tooling + SDK versions, x86_64-only): https://github.com/kaeawc/auto-mobile/blob/main/Dockerfile#L1-L220
- docker-compose services and mounts: https://github.com/kaeawc/auto-mobile/blob/main/docker-compose.yml#L1-L90
- Docker validation script: https://github.com/kaeawc/auto-mobile/blob/main/scripts/docker/validate_dockerfile.sh#L1-L71
- Docker CI build/test workflow: https://github.com/kaeawc/auto-mobile/blob/main/.github/workflows/pull_request.yml#L328-L420
- Docker publish workflow: https://github.com/kaeawc/auto-mobile/blob/main/.github/workflows/merge.yml#L389-L453

### Large Image Size

The Docker image is large (~3-4 GB) due to the Android SDK. To minimize size:

1. Use multi-stage builds (advanced)
2. Remove unnecessary SDK components
3. Use `.dockerignore` to exclude build artifacts

## Production Deployment

For production deployments:

1. **Build optimized image**:
   ```bash
   docker build --target production -t auto-mobile:prod .
   ```

2. **Remove development mounts**:
   Edit `docker-compose.yml` and comment out source code volume mount

3. **Use specific version tags**:
   ```bash
   docker build -t auto-mobile:v0.0.7 .
   ```

4. **Security considerations**:
   - Run as non-root user (already configured)
   - Limit privileged mode to only when ADB access needed
   - Use read-only file systems where possible

## Environment Variables

Customize container behavior with environment variables:

```yaml
environment:
  - ANDROID_HOME=/opt/android-sdk
  - ANDROID_SDK_ROOT=/opt/android-sdk
  - NODE_ENV=production
  - ADB_VENDOR_KEY=/home/automobile/.android/adbkey
```

## Advanced Configuration

### Custom Android SDK Components

To install additional SDK components:

```bash
docker-compose exec auto-mobile sdkmanager "platforms;android-35"
docker-compose exec auto-mobile sdkmanager "build-tools;34.0.0"
```

### Persisting Additional Data

Add more volumes to `docker-compose.yml`:

```yaml
volumes:
  - ./custom-scripts:/workspace/custom-scripts
  - gradle-cache:/home/automobile/.gradle
```

## Platform Support

### Current Support

- **Linux** (x86_64, aarch64): Full support
- **macOS** (Intel, Apple Silicon): Partial support
  - Physical device access limited by Docker Desktop
  - Emulators not recommended
- **Windows** (WSL2): Partial support
  - Requires WSL2 with USB support
  - See [WSL USB documentation](https://learn.microsoft.com/en-us/windows/wsl/connect-usb)

### iOS Support

iOS development is **not supported** in Docker because:
- Xcode and iOS Simulator require macOS
- Apple hardware is required for iOS development
- No viable containerization solution exists

For iOS automation, run AutoMobile natively on macOS.

## CI/CD Integration

### GitHub Actions

Example workflow using the Docker image:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: docker build -t auto-mobile:test .

      - name: Run tests
        run: docker run --rm auto-mobile:test bun test
```

### GitLab CI

```yaml
test:
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t auto-mobile:test .
    - docker run --rm auto-mobile:test bun test
```

## Validation and Testing

### Dockerfile Validation

Validate the Dockerfile using hadolint:

```bash
./scripts/docker/validate_dockerfile.sh
```

This checks for:
- Best practices violations
- Security issues
- Performance problems
- Maintainability concerns

### Container Structure Tests

Run comprehensive container tests:

```bash
# Build the image first
docker build -t auto-mobile:latest .

# Run tests
./scripts/docker/test_container.sh
```

Tests include:
- Image existence and startup
- Bun and Java versions
- Android SDK components
- Development tools availability
- MCP stdio protocol communication
- User configuration
- Init system (tini) presence

### MCP stdio Protocol Testing

Test the MCP server's stdio communication:

```bash
# Send an initialize request
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | docker run -i --rm --init auto-mobile:latest
```

Expected response should be a JSON-RPC message with server capabilities.

### CI/CD Testing

The project includes GitHub Actions workflows in `.github/workflows/pull_request.yml` and `.github/workflows/merge.yml`
that lint/build/test Docker images and publish to Docker Hub.

## Next Steps

- [MCP Client Configuration](mcp-docker-config.md) - Configure MCP clients to use Docker
- [Installation Guide](installation.md) - Native installation
- [Documentation Home](index.md) - Using AutoMobile
- [MCP Server Documentation](features/mcp-server/index.md) - Server capabilities
