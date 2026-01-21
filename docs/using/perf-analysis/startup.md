# Startup

Measure and optimize how quickly your app launches and becomes interactive.

??? example "See demo: Deep link startup"
    ![App startup via deep link demo](../../img/deeplink-startup.gif)

App startup performance affects user experience and app store ratings. AutoMobile helps measure startup through UI observation and idle detection.

## What is Measured

- **Time to First Frame**: How quickly the first screen renders
- **Time to Interactive**: When the UI becomes responsive

These metrics can be measured under different launch scenarios:

- **Cold Start**: Launch from terminated state (no process running)
- **Warm Start**: Launch when app is in background (process still alive)

## Example Workflow

Example prompt:

```
Launch the app and measure how long until the home screen is interactive
```

The agent will:
1. Terminate the app (cold start)
2. Launch the app
3. Wait for UI idle (stable frame metrics)
4. Report time to stability

## Best Practices

- **Baseline First**: Measure current performance before optimizing
- **Test Both Scenarios**: Cold starts matter for first-time users; warm starts may be more common for returning users
- **Real Devices**: Emulators don't reflect real performance
- **Consistent Conditions**: Same data state, same device, same network

## See Also

- [Frame Rate Analysis](scroll-framerate.md)
- [Screen Transitions](screen-transition.md)
- [Android Launch Time Guide](https://developer.android.com/topic/performance/vitals/launch-time)
