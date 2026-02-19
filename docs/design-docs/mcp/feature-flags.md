# Feature Flags

<kbd>✅ Implemented</kbd>

> **Current state:** Feature flags are implemented as CLI args (e.g., `--debug`, `--accessibility-audit`, `--ui-perf-mode`). IDE integration for runtime flag toggling is described in linked docs but is `<kbd>🚧 Design Only</kbd>` for Android Studio and Xcode. See the [Status Glossary](../status-glossary.md) for chip definitions.

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
