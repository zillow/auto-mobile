# Screen Transition Performance

Screen transitions should be smooth and responsive. Janky transitions hurt user experience and make your app feel slow.

## What is Measured

- **Navigation Duration**: Time from tap to next screen stable
- **Animation Smoothness**: Frame drops during transition
- **Touch Responsiveness**: Delay between tap and visual feedback

## Example Usage

Prerequisites: [UI auditing prerequisites](../ui-auditing-prereqs.md).

Example prompt:

```
Tap the settings button and measure how long the transition takes
```

The agent will:
1. Tap the navigation element
2. Wait for UI to stabilize (idle detection)
3. Collect frame metrics during transition
4. Report performance data

## Analyzing Results

Key metrics from AutoMobile:

- **stabilityWaitMs**: Time until UI became stable after interaction
- **Frame Percentiles**: P50/P90/P99 frame times during transition
- **Jank Counts**: missedVsyncCount, frameDeadlineMissedCount
- **Touch Latency**: Time from touch to first frame response

Example from observe result:

```json
{
  "gfxMetrics": {
    "percentile90thMs": 12.5,
    "percentile99thMs": 18.3,
    "missedVsyncCount": 2,
    "stabilityWaitMs": 450,
    "isStable": true
  }
}
```

## Performance Thresholds

Target metrics:

- **Transition Time**: < 300ms for simple navigation
- **Frame Time P90**: < 16ms (60 FPS)
- **Frame Time P99**: < 20ms
- **Missed Frames**: 0 for smooth transitions

## Android Profiling Tools

For detailed transition analysis, use Android's native tools:

- **Perfetto**: System-wide tracing with GPU/CPU timelines
  - See [Perfetto UI](https://ui.perfetto.dev/)

- **Jetpack Compose**: Built-in composition tracing
  - See [Compose Performance](https://developer.android.com/jetpack/compose/performance)

- **Systrace**: View rendering pipeline details
  - See [Systrace Guide](https://developer.android.com/topic/performance/tracing/command-line)

## Best Practices

- **Measure Actual Transitions**: Test common user flows
- **Test on Low-End Devices**: Performance issues show up more clearly
- **Monitor Continuously**: Regressions can creep in over time
- **Set Baselines**: Track metrics in CI to catch regressions

## See Also

- [Frame Rate Analysis](scroll-framerate.md)
- [Startup Performance](startup.md)
- [Android Performance Guide](https://developer.android.com/topic/performance)
