# UI Performance Audit Mode

Automated UI performance testing that detects jank, poor FPS, and other rendering issues during device automation.

## Overview

The UI Performance Audit mode monitors Android app performance during observations (including `observe` tool calls and
action-triggered observations) and reports violations when performance metrics exceed device-specific thresholds. This
enables automated detection of UI responsiveness issues that would otherwise require manual testing.

## Features

### Metrics Collected

1. **Frame Timing Percentiles**
   - p50, p90, p95, p99 frame times
   - Sourced from `dumpsys gfxinfo`

2. **Jank Detection**
   - Missed VSync count
   - Slow UI thread frames
   - Frame deadline misses
   - Total jank frame count

3. **CPU Usage**
   - Per-process CPU percentage
   - Thread count enumeration
   - Via `/proc/{pid}/stat`

4. **ANR Detection**
   - Pending Application Not Responding states
   - Via `dumpsys activity processes`

5. **Touch Latency** (--ui-perf-mode only)
   - Inject synthetic touch events on non-clickable areas (status bar)
   - Measure time until frame activity detected via gfxinfo
   - Uses median of 3 samples for accuracy
   - Detects UI responsiveness issues

### Automatic Threshold Detection

Thresholds are automatically calculated based on device capabilities:

- **Refresh Rate Detection**: Detects 60Hz, 90Hz, 120Hz displays
- **Frame Time Targets**: 16.67ms (60Hz), 11.11ms (90Hz), 8.33ms (120Hz)
- **Adaptive Thresholds**: Percentile thresholds scale with refresh rate

Example thresholds for 60Hz display:
- p50 < 15ms (90% of frame time)
- p90 < 16.67ms (100% of frame time)
- p95 < 20ms (120% of frame time)
- p99 < 25ms (150% of frame time)
- Jank count < 5 frames
- CPU usage < 80%
- Touch latency < 33ms (2 frames)

### Weighted Threshold Tracking

Thresholds are stored in SQLite with:
- **TTL**: 24-hour expiration by default
- **Session tracking**: One session per day
- **Weighted averaging**: More reliable thresholds get higher weight
- **Auto-adjustment**: Weights increase on pass (up to 2.0), decrease on fail (down to 0.1)

## Usage

### Enable Performance Audit

Start the MCP server with the `--ui-perf-mode` flag:

```bash
npx @kaeawc/auto-mobile --ui-perf-mode
```

### Observe Results

When enabled, `observe` tool calls will include a `performanceAudit` field:

```json
{
  "screenSize": { "width": 1080, "height": 2400 },
  "activeWindow": { "appId": "com.example.app" },
  "performanceAudit": {
    "passed": false,
    "metrics": {
      "p50Ms": 18.5,
      "p90Ms": 28.3,
      "p95Ms": 35.7,
      "p99Ms": 52.1,
      "jankCount": 12,
      "missedVsyncCount": 8,
      "slowUiThreadCount": 4,
      "frameDeadlineMissedCount": 0,
      "cpuUsagePercent": 65.2,
      "touchLatencyMs": 28.5,
      "anrDetected": false
    },
    "violations": [
      {
        "metric": "jankCount",
        "threshold": 5,
        "actual": 12,
        "severity": "critical",
        "contributionWeight": 0.9
      },
      {
        "metric": "p95",
        "threshold": 20,
        "actual": 35.7,
        "severity": "critical",
        "contributionWeight": 0.8
      }
    ],
    "diagnostics": "Performance issues detected:\n\nTop contributors:\n- jankCount: 12.00 (threshold: 5.00) [critical]\n- p95: 35.70 (threshold: 20.00) [critical]\n\n--- GFXINFO DUMP ---\n...",
    "deviceCapabilities": {
      "refreshRate": 60,
      "frameTimeMs": 16.666666666666668
    }
  }
}
```

### Query Performance History

Use the `listPerformanceAuditResults` tool to fetch recent audit history from the local SQLite database.
Results are paginated and can be filtered by timestamp range.

Example request:

```json
{
  "name": "listPerformanceAuditResults",
  "arguments": {
    "startTime": "2026-01-05T12:00:00Z",
    "endTime": "2026-01-05T12:05:00Z",
    "limit": 20,
    "offset": 0
  }
}
```

Example response:

```json
{
  "results": [
    {
      "id": 42,
      "deviceId": "emulator-5554",
      "sessionId": "2026-01-05",
      "packageName": "com.example.app",
      "timestamp": "2026-01-05T12:02:01.123Z",
      "passed": false,
      "metrics": {
        "p50Ms": 18.5,
        "p90Ms": 28.3,
        "p95Ms": 35.7,
        "p99Ms": 52.1,
        "jankCount": 12,
        "missedVsyncCount": 8,
        "slowUiThreadCount": 4,
        "frameDeadlineMissedCount": 0,
        "cpuUsagePercent": 65.2,
        "touchLatencyMs": 28.5
      },
      "diagnostics": "Performance issues detected..."
    }
  ],
  "toolCalls": ["tapOn", "swipeOn", "observe"],
  "hasMore": false,
  "nextOffset": null,
  "range": {
    "startTime": "2026-01-05T12:02:01.123Z",
    "endTime": "2026-01-05T12:02:01.123Z"
  }
}
```

`toolCalls` lists the unique tool names executed during the time span covered by the current page of results.

### Interpreting Results

#### Passed Audits
- `passed: true`
- No violations array
- App performs within acceptable parameters

#### Failed Audits
- `passed: false`
- `violations` array lists exceeded thresholds
- `diagnostics` provides weighted analysis:
  - Top contributors (weight > 0.5) listed first
  - Raw dumps included based on violation type
  - gfxinfo dump for frame timing issues
  - CPU stats for high CPU usage
  - ANR details if detected

## Architecture

### Database Schema

**performance_thresholds**
- Device-specific threshold values
- Session tracking with TTL
- Weight for averaging multiple sessions

**performance_audit_results**
- Historical audit outcomes
- Full metrics and diagnostics
- Timestamp-indexed for analysis

### Components

**DeviceCapabilitiesDetector** (src/utils/DeviceCapabilities.ts)
- Detects refresh rate via dumpsys
- Calculates device-appropriate thresholds

**PerformanceAudit** (src/features/performance/PerformanceAudit.ts)
- Collects all metrics in parallel
- Validates against thresholds
- Generates weighted diagnostics

**ThresholdManager** (src/features/performance/ThresholdManager.ts)
- Manages threshold storage and retrieval
- Implements TTL cleanup
- Calculates weighted averages
- Updates weights based on outcomes

**TouchLatencyTracker** (src/features/performance/TouchLatencyTracker.ts)
- Injects synthetic touches on safe screen areas
- Monitors gfxinfo for frame activity changes
- Calculates median latency from multiple samples
- Only runs when --ui-perf-mode is enabled

### Integration Point

Performance audits run during `ObserveScreen.execute()`:
1. All screen data collected
2. If audit enabled and Android device:
   - Detect device capabilities
   - Get/create thresholds
   - Run audit (includes touch latency if --ui-perf-mode enabled)
   - Attach results to observation
   - Update threshold weights

## Future Enhancements

### Planned for Issue #67
- Global configuration management
- UI/API for threshold customization
- Enable/disable per device via config

### Enhanced Diagnostics
- Memory pressure detection
- GPU utilization tracking
- Battery impact analysis
- Thermal throttling detection

## Performance Considerations

- Audit adds ~200-500ms to observe calls
- CPU/ANR checks run in parallel with gfxinfo
- Touch latency testing adds ~500-800ms (3 samples × ~200ms each, only when --ui-perf-mode enabled)
- Database queries cached per session
- Threshold calculation only on first session access

## Limitations

- Android only (iOS support planned)
- Requires `dumpsys` access
- System/launcher apps use simplified checks
- No audit if no active app window
- Touch latency requires --ui-perf-mode flag and adds overhead

## How Touch Latency Works

When --ui-perf-mode is enabled, touch latency is measured by:

1. **Safe Touch Location Selection**: Selects top-right corner of status bar (95% width, 2% height) to avoid triggering UI interactions
2. **Baseline Capture**: Resets gfxinfo and captures baseline frame stats
3. **Touch Injection**: Injects synthetic touch event via `adb shell input tap`
4. **Response Detection**: Polls gfxinfo every 10ms, watching for frame activity:
   - Increased missed vsync count
   - Increased slow UI thread count
   - Increased frame deadline missed count
5. **Multiple Samples**: Takes 3 samples and calculates median for accuracy
6. **Result**: Reports median latency in milliseconds

## Related Issues

- #36: Initial implementation
- #67: Global configuration system
- #85: Touch latency testing implementation

## Implementation references

- [`src/features/observe/ObserveScreen.ts#L640-L700`](https://github.com/kaeawc/auto-mobile/blob/main/src/features/observe/ObserveScreen.ts#L640-L700) for performance audit integration during observations.
- [`src/features/performance/PerformanceAudit.ts#L10-L200`](https://github.com/kaeawc/auto-mobile/blob/main/src/features/performance/PerformanceAudit.ts#L10-L200) for metric collection and validation.
- [`src/features/performance/TouchLatencyTracker.ts#L32-L200`](https://github.com/kaeawc/auto-mobile/blob/main/src/features/performance/TouchLatencyTracker.ts#L32-L200) for touch latency measurement behavior.
- [`src/features/performance/ThresholdManager.ts#L8-L262`](https://github.com/kaeawc/auto-mobile/blob/main/src/features/performance/ThresholdManager.ts#L8-L262) for threshold storage, TTL, and weighted averaging.
- [`src/index.ts#L111-L118`](https://github.com/kaeawc/auto-mobile/blob/main/src/index.ts#L111-L118) and [`src/features/featureFlags/FeatureFlagApplier.ts#L24-L48`](https://github.com/kaeawc/auto-mobile/blob/main/src/features/featureFlags/FeatureFlagApplier.ts#L24-L48) for the `--ui-perf-mode` flag wiring.
