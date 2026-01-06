# App Startup Performance

Measure and optimize how quickly your app launches and becomes interactive.

## Overview

App startup performance affects user experience and app store ratings. AutoMobile helps measure startup through UI observation and idle detection.

## What is Measured

Startup performance includes:
- **Time to First Frame**: How quickly the first screen renders
- **Time to Interactive**: When the UI becomes responsive
- **Cold Start**: Launch from terminated state
- **Warm Start**: Launch from background state

## Using AutoMobile

AutoMobile tracks startup performance through:

1. **Launch + Idle Detection**: Measure time until UI stabilizes
2. **Frame Metrics**: Monitor rendering during startup using gfxinfo
3. **ANR Detection**: Catch Application Not Responding issues

### Example Workflow

Ask your AI agent:

```
Launch the app and measure how long until the home screen is interactive
```

The agent will:
1. Terminate the app (cold start)
2. Launch the app
3. Wait for UI idle (stable frame metrics)
4. Report time to stability

## Android's Built-in Metrics

For more detailed startup analysis, use Android's native tools:

- **Logcat Displayed Time**: Activity launch metrics in logcat
  ```bash
  adb logcat | grep "Displayed"
  ```

- **Perfetto**: System-wide tracing for detailed startup analysis
  - See [Android Startup Profiling](https://developer.android.com/topic/performance/vitals/launch-time)

- **Macrobenchmark**: Jetpack library for automated startup testing
  - See [Macrobenchmark Guide](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview)

## Best Practices

- **Baseline First**: Measure current performance before optimizing
- **Test Cold Starts**: Most representative of user experience
- **Real Devices**: Emulators don't reflect real performance
- **Consistent Conditions**: Same data state, same device, same network

## Limitations

AutoMobile currently doesn't extract Android's native "Displayed" time metrics from logcat. For precise startup time analysis, combine AutoMobile's idle detection with Android's built-in profiling tools.

## See Also

- [Frame Rate Analysis](scroll-framerate.md)
- [Screen Transitions](screen-transition.md)
- [Android Launch Time Guide](https://developer.android.com/topic/performance/vitals/launch-time)
