# MCP Daemon

Background daemon service for device pooling and parallel test execution.


The AutoMobile daemon provides:

- **Device Pool Management** - Manages available Android/iOS devices
- **Session Isolation** - Multiple parallel test sessions
- **Test Timing History** - Aggregated execution metrics
- **Resource Sharing** - Efficient device allocation

## Architecture

The daemon runs as a background process that:
1. Maintains a pool of available devices
2. Allocates devices to test sessions on demand
3. Tracks test execution history and performance
4. Provides session management APIs

## Device Pooling

### Session Acquisition

Tests request a device from the pool:

```typescript
const session = await daemon.acquireSession({
  platform: "android",
  requirements: {
    minSdkVersion: 28,
    deviceType: "phone"
  }
})
```

### Session Release

When tests complete, devices are returned to the pool:

```typescript
await daemon.releaseSession(sessionId)
```

## Test Timing History

The daemon tracks test execution metrics:

- Average duration per test
- Device-specific performance
- Historical trends
- Failure rates

This data helps:

- Optimize CI test distribution
- Identify slow tests
- Predict execution times
- Detect performance regressions

## Socket Communication

The daemon listens on a Unix socket at:
```
/tmp/auto-mobile-daemon-<uid>.sock
```

## MCP Tools

### `daemon_available_devices`
Query available devices in the pool.

### `daemon_session_info`
Get information about an active session.

### `daemon_release_session`
Release a session and return device to pool.

## Implementation

The daemon is implemented in the main AutoMobile MCP server and can run:

- **Standalone** - As a background service
- **Embedded** - Within the MCP server process
- **CI Mode** - Temporary pools for CI environments

See [MCP Server](index.md) for integration details.
