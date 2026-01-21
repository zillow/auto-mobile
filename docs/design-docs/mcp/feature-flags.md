# Feature Flags

Runtime configuration system for experimental features, performance tuning, and debugging AutoMobile. At
present these flags can only be set on MCP startup as CLI args. The plan is to have them configurable via IDE integrations for
[Android Studio](../plat/android/ide-plugin/feature-flags.md) & [XCode](../plat/ios/ide-plugin/feature-flags.md)

### Debug Flags

**`--debug`** - Enable debug logging

**`--debug-perf`** - Enable performance debug output

### Performance Flags

**`--ui-perf-mode`** - Enable UI performance monitoring

**`--ui-perf-debug`** - Detailed performance logging

**`--mem-perf-audit`** - Memory performance auditing

### Behavior Flags

**`--accessibility-audit`** - Enable accessibility checks

**`--predictive-ui`** - AI-powered UI prediction
