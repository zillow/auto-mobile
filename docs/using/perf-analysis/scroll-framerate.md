# Scroll Performance


Scroll performance is critical to user experience. Janky scrolling is one of the most noticeable performance issues - users immediately feel stuttering and frame drops when swiping through lists, feeds, or grids.

AutoMobile measures scroll framerate using Android's `gfxinfo` to catch performance regressions before they reach production.

## What is Measured

AutoMobile collects frame rendering metrics during scroll interactions:

- **Frame Time Percentiles**: P50, P90, P95, P99 render times in milliseconds
- **Jank Indicators**: Missed vsync count, slow UI thread count, frame deadline misses
- **FPS Calculation**: Average frames per second during scrolling
- **UI Stability**: Time until rendering stabilizes after scroll completes
- **Frame Drops**: Total count of dropped or janky frames during interaction

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
