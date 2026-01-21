# Performance Analysis

AutoMobile's performance analysis capabilties can be turned on via [feature flags](../../design-docs/mcp/feature-flags.md).

#### What is Measured

- Touch Latency: Time from touch to first frame response
- Time to First Frame: How quickly the first screen renders
- Time to Interactive: When the UI becomes responsive
- Jank: How many missed frames and therefore UI stuttering a user would observe during app startup. This is represented by `missedVsyncCount`, `frameDeadlineMissedCount`
- FPS: Time series of frames per second during app startup

#### Performance Thresholds

- Touch Latency: < 100ms to stay within human perception of "instant" response
- Transition Time: < 300ms for simple navigation
- Frame Time P90: < 16ms (60 FPS)
- Frame Time P99: < 20ms
- Missed Frames: 0 for smooth transitions

#### Best Practices

- Measure current performance before optimizing.
- Device snapshots can make reproducing or finding issues with microbenchmarks easier.
- Varying device resources (memory, network, etc) can help identify bottlenecks.
- Emulators & simulators don't reflect real device performance, recommend also baselining and iterating on physical devices as well.
- Test common user flows.
- Performance issues show up more clearly on low-end devices.
- Regressions most often creep in over time, its important to setup baselines and compare against them regularly.

#### Example Uses

- [Startup](startup.md)
- [Screen transition](screen-transition.md)
- [Scroll framerate](scroll-framerate.md)
