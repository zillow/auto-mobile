# MCP Client Configuration Examples

This document provides example configurations for connecting MCP clients (like Claude Desktop) to the AutoMobile Docker container.

## Claude Desktop Configuration

### Using Docker Run (Recommended for MCP Clients)

Add this to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

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
        "--privileged",
        "--network", "host",
        "-v", "${HOME}/.android:/home/automobile/.android",
        "auto-mobile:latest"
      ],
      "env": {
        "ANDROID_HOME": "/opt/android-sdk",
        "ANDROID_SDK_ROOT": "/opt/android-sdk"
      }
    }
  }
}
```

### Using Pre-built Image from Docker Hub (Recommended)

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

To pin to a specific version for production:

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
        "--privileged",
        "--network", "host",
        "-v", "${HOME}/.android:/home/automobile/.android",
        "kaeawc/auto-mobile:0.0.6"
      ]
    }
  }
}
```

### Docker Compose (Not Recommended for MCP Clients)

Docker Compose is better for development/testing, not for MCP client integration. The `-i` interactive mode works differently with compose.

## Continue.dev Configuration

For Continue.dev IDE extension:

```json
{
  "mcpServers": {
    "auto-mobile": {
      "transport": "stdio",
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--init",
        "--privileged",
        "--network", "host",
        "-v", "${HOME}/.android:/home/automobile/.android",
        "auto-mobile:latest"
      ]
    }
  }
}
```

## Cline Configuration

For Cline (VS Code extension):

Add to `.cline/mcp_settings.json`:

```json
{
  "mcpServers": {
    "auto-mobile": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--privileged", "--network", "host",
        "-v", "${HOME}/.android:/home/automobile/.android",
        "auto-mobile:latest"
      ]
    }
  }
}
```

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
| `--privileged` | USB device access for ADB | Only if using physical devices |
| `--network host` | Share host network for ADB | Only if using physical devices |
| `-v ~/.android:...` | Share ADB keys | Only if using physical devices |

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

### Performance Issues

If the container starts slowly:

1. **Pre-pull the image**:
   ```bash
   docker pull auto-mobile:latest
   ```

2. **Keep containers running** (not recommended for MCP):
   Use a persistent container instead of `--rm`, but this complicates state management.

## Advanced Configuration

### Custom Environment Variables

```json
{
  "mcpServers": {
    "auto-mobile": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "--init", "auto-mobile:latest"],
      "env": {
        "ANDROID_HOME": "/opt/android-sdk",
        "LOG_LEVEL": "debug",
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Using Specific Version

```json
{
  "mcpServers": {
    "auto-mobile": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "auto-mobile:v0.0.6"
      ]
    }
  }
}
```

### Mounting Custom Scripts

```json
{
  "mcpServers": {
    "auto-mobile": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "-v", "${HOME}/my-scripts:/workspace/custom",
        "auto-mobile:latest"
      ]
    }
  }
}
```

## Platform-Specific Notes

### macOS

- Docker Desktop required
- USB device access limited - may need Docker Desktop 4.x+ and specific USB sharing configuration
- ADB over network (tcpip) recommended instead of USB

### Linux

- Full USB device access with `--privileged`
- May need to add user to `plugdev` group for USB permissions on host
- Best platform for full Docker + ADB functionality

### Windows (WSL2)

- Requires WSL2 with USB support (usbipd-win)
- See [WSL USB documentation](https://learn.microsoft.com/en-us/windows/wsl/connect-usb)
- Docker Desktop for Windows required

## See Also

- [Docker Documentation](docker.md) - Comprehensive Docker guide
- [MCP Server Documentation](mcp-server.md) - Server capabilities and usage
- [Getting Started](getting-started.md) - General AutoMobile setup
