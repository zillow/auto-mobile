# AutoMobile Scripts

Utility scripts for testing and managing the AutoMobile AccessibilityService.

## test-websocket-server.sh

Automated test script that verifies the WebSocket server in the AccessibilityService is running and accessible.

### What it checks:

1. **adb availability** - Ensures Android Debug Bridge is installed
2. **Device connection** - Verifies an Android device/emulator is connected
3. **App installation** - Checks if the AccessibilityService app is installed
4. **Service enabled** - Verifies the accessibility service is enabled
5. **Service running** - Confirms the service process is active
6. **Port forwarding** - Sets up adb port forwarding (localhost:8765 → device:8765)
7. **Health endpoint** - Tests HTTP health check endpoint
8. **WebSocket connection** - Verifies WebSocket handshake succeeds
9. **Server logs** - Shows recent WebSocket server activity

### Usage:

```bash
# From the android directory
./scripts/test-websocket-server.sh
```

### Output:

- ✓ Green checkmarks for passing tests
- ✗ Red X's for failing tests with helpful error messages
- Connection information and test commands at the end

### Example output:

```
═══════════════════════════════════════════════════════════
  AutoMobile WebSocket Server Test
═══════════════════════════════════════════════════════════

▶ Checking for adb...
✓ adb found: /path/to/adb
▶ Checking for connected devices...
✓ Device connected: emulator-5554
...
✓ All Tests Passed!

WebSocket Server:
  Health Check: http://localhost:8765/health
  WebSocket:    ws://localhost:8765/ws
```

### Requirements:

- Android SDK with `adb` in PATH
- Python 3 (for WebSocket handshake test)
- curl (for health endpoint test)

### Troubleshooting:

If the script fails, it will provide specific error messages and suggestions:

- **No device**: Start an emulator or connect a device
- **App not installed**: Run `./gradlew :accessibility-service:installDebug`
- **Service not enabled**: Enable in Settings → Accessibility
- **Connection failed**: Check service logs with `adb logcat -s AutoMobileAccessibilityService:*`

### Testing the connection manually:

```bash
# Health check
curl http://localhost:8765/health

# WebSocket (requires wscat)
npm install -g wscat
wscat -c ws://localhost:8765/ws

# View logs
adb logcat -s AutoMobileAccessibilityService:*
```
