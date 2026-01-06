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

## Quick Start

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




# Docker MCP Server Configuration Examples

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

## Testing the Connection

### 1. Build the Image

```bash
docker build -t auto-mobile:latest .
```

### 2. Test Stdio Communication

```bash
# Test that the server responds to MCP protocol
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | docker run -i --rm --init auto-mobile:latest
```

You should see a JSON-RPC response with server capabilities.

### 3. Test with ADB

```bash
# Test ADB access inside container
docker run -i --rm --init --privileged --network host auto-mobile:latest adb devices
```

## Important Docker Flags

| Flag | Purpose | Required |
|------|---------|----------|
| `-i` | Keep stdin open for stdio communication | ✅ Yes |
| `--rm` | Remove container after exit | ✅ Recommended |
| `--init` | Use tini for proper signal handling | ✅ Yes |
| `--privileged` | USB device access for ADB | Required if using physical devices |
| `--network host` | Share host network for ADB | Required if using physical devices |
| `-v ~/.android:...` | Share ADB keys | Required if using physical devices |

## Troubleshooting

### Connection Fails

1. **Check Docker is running**:
   ```bash
   docker ps
   ```

2. **Verify image exists**:
   ```bash
   docker images | grep auto-mobile
   ```

3. **Test stdio manually**:
   ```bash
   docker run -i --rm --init auto-mobile:latest
   ```
   Then type a test JSON-RPC message.

### ADB Not Working

1. **Verify devices on host**:
   ```bash
   adb devices
   ```

2. **Check container has access**:
   ```bash
   docker run -i --rm --init --privileged --network host auto-mobile:latest adb devices
   ```

3. **Verify ADB keys mounted**:
   ```bash
   docker run -i --rm --init --privileged --network host \
     -v ~/.android:/home/automobile/.android \
     auto-mobile:latest ls -la /home/automobile/.android
   ```

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
