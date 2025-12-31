# UI Performance Audit Mode

Automated UI performance testing that detects jank, poor FPS, and other rendering issues during device automation.

## Overview

The UI Performance Audit mode monitors Android app performance during `observe` tool calls and reports violations when performance metrics exceed device-specific thresholds. This enables automated detection of UI responsiveness issues that would otherwise require manual testing.

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

5. **Touch Latency** (Planned)
   - Inject touch events on non-clickable areas
   - Measure response time

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
      "touchLatencyMs": null,
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

### Integration Point

Performance audits run during `ObserveScreen.execute()`:
1. All screen data collected
2. If audit enabled and Android device:
   - Detect device capabilities
   - Get/create thresholds
   - Run audit
   - Attach results to observation
   - Update threshold weights

## Future Enhancements

### Planned for Issue #67
- Global configuration management
- UI/API for threshold customization
- Enable/disable per device via config

### Touch Latency Testing
- Identify non-clickable screen areas
- Inject periodic touch events
- Measure time to UI response
- Report latency violations

### Enhanced Diagnostics
- Memory pressure detection
- GPU utilization tracking
- Battery impact analysis
- Thermal throttling detection

## Performance Considerations

- Audit adds ~200-500ms to observe calls
- CPU/ANR checks run in parallel with gfxinfo
- Touch latency testing (when implemented) adds interaction time
- Database queries cached per session
- Threshold calculation only on first session access

## Limitations

- Android only (iOS support planned)
- Requires `dumpsys` access
- System/launcher apps use simplified checks
- No audit if no active app window
- Touch latency not yet implemented

## Related Issues

- #36: Initial implementation
- #67: Global configuration system
