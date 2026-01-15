# Resources

AutoMobile exposes resources through the Model Context Protocol for AI agents to access.


MCP Resources provide read-only access to:

- Navigation graph data
- Test execution history
- Performance metrics
- Device information

## Available Resources

### Navigation Graph

**URI**: `automobile:navigation/graph`

Returns the current navigation graph showing:

- Known screens and their IDs
- Screen transitions and triggers
- UI elements that cause navigation

See [Navigation Graph](nav/index.md) for details.

### Booted Devices

**URI**: `automobile:devices/booted`

Returns booted device inventory across Android and iOS, including:

- Total, per-platform, virtual, and physical device counts
- Optional daemon pool status (idle/assigned/error) when the daemon is active
- Per-device pool assignment (status + session UUID) when available

**URI Template**: `automobile:devices/booted/{platform}`

This resource replaces the removed `listDevices` and `daemon_available_devices` tools.

### Installed Apps

**URI**: `automobile:apps`

Returns installed apps for booted devices. `deviceId` is required. Supports query parameters for filtering:

- `platform` (`android` or `ios`)
- `search` (case-insensitive partial match on package name or display name when available)
- `type` (`user` or `system`)
- `profile` (Android user ID, e.g. `0` or `10`)
- `deviceId` (booted device ID, required)

Example URIs:

- `automobile:apps?deviceId=emulator-5554&platform=android&search=slack&type=user`
- `automobile:apps?deviceId=YOUR_IOS_DEVICE_ID&platform=ios&search=calendar`

Clients can subscribe to specific `automobile:apps?deviceId=...` URIs for change notifications and re-read filtered URIs after updates.

### Test Timing History

**URI**: `
automobile:test-timings`

Returns historical test execution data:

- Test class and method names
- Average execution duration
- Success/failure rates
- Device information
- Supports query parameters for filtering and sorting (e.g., lookbackDays, limit, minSamples, orderBy, sessionUuid).

See [Daemon](daemon/index.md) for test timing aggregation.

### Performance Results

**URI**: `
automobile:performance-results`

Returns recent UI performance audit results:

- Scroll framerate measurements
- Frame drop counts
- Render time statistics

### Localization Settings

**URI**: `automobile:devices/{deviceId}/localization`

Returns current localization settings for a device:

- Locale tag
- Time zone
- Text direction
- Time format
- Calendar system

## Using Resources

AI agents can request resources via MCP:

```json
{
  "method": "resources/read",
  "params": {
    "uri": "automobile:navigation/graph"
  }
}
```

The agent receives structured data that it can analyze and use to inform decisions.

## Implementation

See [MCP Server](index.md) for technical implementation details of resource providers.
