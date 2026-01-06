# Performance Analysis with AutoMobile

Analyze your app's performance metrics including startup time, screen transitions, and scroll framerate.

## Overview

AutoMobile can measure:
- **Startup Performance**: App launch time and initial render
- **Screen Transitions**: Navigation and animation smoothness
- **Scroll Framerate**: FPS during list/grid scrolling
- **UI Responsiveness**: Frame drops and jank detection

## Measuring Scroll Performance

AutoMobile uses Android's `gfxinfo` to measure scroll performance in real-time.

### Example Usage

Ask your AI agent:

```
Scroll through the product list and measure the framerate
```

The agent will:
1. Navigate to the list
2. Perform scroll gestures
3. Measure FPS using dumpsys gfxinfo
4. Report performance metrics

## Performance Metrics

AutoMobile tracks:
- **Average FPS**: Frames per second during scrolling
- **Frame Drops**: Number of dropped/janky frames
- **Render Times**: P50, P90, P99 frame render times
- **UI Idle Detection**: When UI becomes stable

## Performance Audit

Enable performance auditing via feature flags:

```typescript
// Enable UI performance monitoring
setFeatureFlag("ui-perf-mode", true)
```

See [Feature Flags](../../design-docs/mcp/feature-flags.md) for more details.

## CI Integration

Performance tests can run in CI to catch regressions:

```bash
# Run performance tests
./gradlew connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.example.PerformanceTests
```

## Best Practices

- **Establish baselines**: Measure current performance first
- **Test on real devices**: Emulators may not reflect real performance
- **Consistent conditions**: Same device, same data, same network
- **Monitor trends**: Track performance over time
