# Scroll Performance

## Overview

Scroll performance is critical to user experience. Janky scrolling is one of the most noticeable performance issues - users immediately feel stuttering and frame drops when swiping through lists, feeds, or grids.

AutoMobile measures scroll framerate using Android's `gfxinfo` to catch performance regressions before they reach production.

## Why Measure Scroll Performance

- **User Experience**: Smooth 60 FPS scrolling feels responsive; janky scrolling feels broken
- **App Store Rankings**: Performance issues lead to poor reviews and lower ratings
- **Catch Regressions**: Automated tests prevent performance degradation over time
- **Real User Conditions**: Test with actual data volumes and rendering complexity

### Example Usage

Enable UI performance auditing in the IntelliJ IDE Plugin [feature flags](../../design-docs/mcp/feature-flags.md).

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

Enable UI performance auditing in the IntelliJ IDE Plugin

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
