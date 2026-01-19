# Feature Flags

Runtime configuration system for experimental features and performance tuning.
Feature flags allow:

- **Experimental Features** - Enable/disable features in development
- **Performance Tuning** - Toggle performance monitoring and debugging
- **Safe Rollouts** - Gradual feature deployment

## Available Flags

### Debug Flags

**`debug`** - Enable debug logging
```typescript
setFeatureFlag("debug", true)
```

**`debug-perf`** - Enable performance debug output
```typescript
setFeatureFlag("debug-perf", true)
```

### Performance Flags

**`ui-perf-mode`** - Enable UI performance monitoring
```typescript
setFeatureFlag("ui-perf-mode", true)
```

**`ui-perf-debug`** - Detailed performance logging
```typescript
setFeatureFlag("ui-perf-debug", true)
```

**`mem-perf-audit`** - Memory performance auditing
```typescript
setFeatureFlag("mem-perf-audit", true)
```

### Behavior Flags

**`accessibility-audit`** - Enable accessibility checks
```typescript
setFeatureFlag("accessibility-audit", true)
```

**`predictive-ui`** - AI-powered UI prediction
```typescript
setFeatureFlag("predictive-ui", true)
```

## MCP Tools

### 🚩 [`listFeatureFlags`](tools/index.md)
Lists all available feature flags and their current states.

### ⚙️ [`setFeatureFlag`](tools/index.md)
Enable or disable a feature flag:

```json
{
  "key": "ui-perf-mode",
  "enabled": true,
  "config": {
    "sampleRate": 0.1
  }
}
```

## Configuration

Some flags accept additional configuration:

```typescript
setFeatureFlag("ui-perf-mode", true, {
  sampleRate: 0.1,  // Sample 10% of frames
  outputFormat: "json"
})
```

## Best Practices

- **Use in development**: Test experimental features locally
- **Document dependencies**: Note which features require which flags
- **Clean up**: Remove flags when features are stable
- **Default to safe**: Flags should default to safe/stable behavior

## Implementation

Feature flags are stored in memory and can be persisted to configuration files for permanent settings.

See [tool reference](tools/index.md) for the full MCP tool list.
