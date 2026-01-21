# Scroll Framerate

Scroll performance is critical to user experience. Janky scrolling is one of the most noticeable performance issues - users immediately feel stuttering and frame drops when swiping through lists, feeds, or grids. AutoMobile measures scroll framerate using Android's `gfxinfo` to catch performance regressions before they reach production.

??? example "See demo: Scroll performance"
    ![Scroll performance demo](../../img/scroll-transition-perf.gif)

## What is Measured

AutoMobile collects frame rendering metrics during scroll interactions:

- **Frame Time Percentiles**: P50, P90, P95, P99 render times in milliseconds
- **Jank Counts**: `missedVsyncCount`, `slowUiThreadCount`, `frameDeadlineMissedCount`
- **FPS Calculation**: Average frames per second during scrolling
- **UI Stability**: Time until rendering stabilizes after scroll completes
- **Frame Drops**: Total count of dropped or janky frames during interaction

## Example Usage

Example prompt:

```
Scroll through the product list and measure the framerate
```

The agent will:
1. Navigate to the list
2. Perform scroll gestures
3. Measure FPS using `dumpsys gfxinfo`
4. Report performance metrics

## Performance Thresholds

Target metrics for smooth scrolling:

- **Average FPS**: > 55 FPS (ideally 60 FPS)
- **Frame Time P90**: < 16ms (maintains 60 FPS)
- **Frame Time P99**: < 20ms
- **Jank Counts**: 0 for smooth scrolling

## Best Practices

- **Establish baselines**: Measure current performance first
- **Test on real devices**: Emulators may not reflect real performance
- **Consistent conditions**: Same device, same data, same network
- **Monitor trends**: Track performance over time
