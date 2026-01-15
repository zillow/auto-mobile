# App Startup Performance

Measure and optimize how quickly your app launches and becomes interactive.


App startup performance affects user experience and app store ratings. AutoMobile helps measure startup through UI observation and idle detection.

## What is Measured

- **Time to First Frame**: How quickly the first screen renders
- **Time to Interactive**: When the UI becomes responsive
- **Cold Start**: Launch from terminated state
- **Warm Start**: Launch from background state

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
- **Test Cold Starts**: Most representative of user experience
- **Real Devices**: Emulators don't reflect real performance
- **Consistent Conditions**: Same data state, same device, same network

## See Also

- [Frame Rate Analysis](scroll-framerate.md)
- [Screen Transitions](screen-transition.md)
- [Android Launch Time Guide](https://developer.android.com/topic/performance/vitals/launch-time)
