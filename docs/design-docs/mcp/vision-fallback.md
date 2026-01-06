# Vision Fallback for Element Detection

## Overview

Vision fallback is an internal `tapOn` feature that uses Claude's vision API to help locate UI elements when traditional
element finding methods fail. It is not exposed via the MCP server or CLI by default; it requires constructing
`TapOnElement` with a custom vision configuration.

## How It Works

When element finding fails after all retries (5 attempts), `TapOnElement` will:

1. **Screenshot capture**: A screenshot is automatically taken
2. **Claude analysis**: The screenshot is analyzed using Claude's vision API
3. **Smart response**: Based on confidence level, Claude provides:
   - **High confidence**: Step-by-step navigation instructions
   - **Medium/Low confidence**: Alternative selectors or detailed error explanation

## Configuration

Vision fallback is **disabled by default** to avoid unexpected API costs. It is only configurable per
`TapOnElement` instance today.

### Default Configuration

```typescript
{
  enabled: false,              // Disabled by default
  provider: 'claude',          // Only Claude supported currently
  confidenceThreshold: 'high', // Reserved for future gating (not enforced yet)
  maxCostUsd: 1.0,            // Warning threshold (does not block calls)
  cacheResults: true,          // Cache results to avoid repeated calls
  cacheTtlMinutes: 60         // Cache for 60 minutes
}
```

### Enabling Vision Fallback (Internal API)

```typescript
const tapTool = new TapOnElement(
  device,
  adb,
  axe,
  webdriver,
  {
    ...DEFAULT_VISION_CONFIG,
    enabled: true  // Enable vision fallback
  }
);
```

Note: The MCP server constructs `TapOnElement` with the default config, so vision fallback is not available through MCP
tool calls unless you modify the server code.

## Example Scenarios

### Scenario 1: Element Text Changed

**Input**: `tapOn({ text: "Login" })`

**Traditional Error**:
```
Element not found with provided text 'Login'
```

**With Vision Fallback** (if enabled):
```
Element not found. AI suggests trying:
- text: "Sign In" (Text label changed from 'Login' to 'Sign In')

(Cost: $0.0234, Confidence: high)
```

### Scenario 2: Element Requires Navigation

**Input**: `tapOn({ text: "Advanced Settings" })`

**With Vision Fallback**:
```
Element not found, but AI suggests these steps:
1. Scroll down in the settings menu to reveal more options
2. Look for "Advanced Settings" in the newly visible section

(Cost: $0.0312, Confidence: high)
```

### Scenario 3: Element Doesn't Exist

**Input**: `tapOn({ text: "Nonexistent Button" })`

**With Vision Fallback**:
```
Element not found. The current screen shows a login form with
'Username', 'Password', and 'Sign In' elements. The requested
'Nonexistent Button' is not visible on this screen.

(Cost: $0.0198, Confidence: high)
```

## Cost Tracking

Vision fallback tracks and reports costs for each API call:

- **Input tokens**: Screenshot + view hierarchy + prompt (~5,000-10,000 tokens)
- **Output tokens**: Analysis response (~500-1,000 tokens)
- **Typical cost**: $0.02-0.05 per failed element search

## Performance

- **Screenshot capture**: ~100-200ms
- **Claude API call**: ~2-5 seconds
- **Total fallback time**: ~2-5 seconds (only when traditional methods fail)

## Caching

Results are cached to avoid repeated API calls for the same element search:

- **Cache key**: Screenshot path + search criteria (text/resourceId)
- **TTL**: 60 minutes (configurable)
- **Benefit**: Instant response for repeated failures

## Limitations

### Current Limitations

1. **tapOn only**: Currently only integrated into `tapOn` tool
   - Additional tools would need explicit integration.

2. **Android screenshots**: Works best with clear Android UI screenshots
   - iOS screenshot capture is not implemented yet (vision fallback will fail to read the image).

3. **No auto-retry**: Suggestions are informational only
   - User must manually retry with suggested selectors
   - Future: Auto-retry with suggested alternatives

### When Vision Fallback Won't Help

- Element truly doesn't exist on screen
- Screenshot quality is poor
- Custom/non-standard UI elements
- Dynamic content that changes rapidly

## API Key Setup

Vision fallback requires an Anthropic API key:

```bash
# Set API key
export ANTHROPIC_API_KEY=sk-ant-xxxxx

# Verify it's set
echo $ANTHROPIC_API_KEY
```

Get an API key at: https://console.anthropic.com/

## Monitoring Usage

### Check Cache Stats

```typescript
const visionFallback = new VisionFallback(config);
const stats = visionFallback.getCacheStats();

console.log(`Cache size: ${stats.size}`);
console.log(`Cached keys: ${stats.keys.join(', ')}`);
```

### Clear Cache

```typescript
visionFallback.clearCache();
```

## Advanced Configuration

### Adjust Confidence Threshold

```typescript
{
  enabled: true,
  confidenceThreshold: 'medium'  // More suggestions, possibly lower quality
}
```

- `'high'`: Only suggest when >90% confident
- `'medium'`: Suggest when >70% confident
- `'low'`: Suggest when >50% confident

### Increase Cost Limit

```typescript
{
  enabled: true,
  maxCostUsd: 5.0  // Allow up to $5 per call
}
```

**Warning**: A single call shouldn't exceed ~$0.10 under normal circumstances. Higher limits protect against edge cases.

## Troubleshooting

### "Vision fallback is not enabled"

Enable it in the configuration (see above).

### "ANTHROPIC_API_KEY not set"

```bash
export ANTHROPIC_API_KEY=your-key-here
```

### "Screenshot capture failed"

Ensure device is connected and accessible:
```bash
adb devices
```

### High costs

- Check if caching is enabled (`cacheResults: true`)
- Reduce `maxCostUsd` to set limits
- Monitor usage in Anthropic console

## Future Enhancements

Planned improvements (not yet implemented):

1. **Auto-retry**: Automatically retry with suggested selectors
2. **More tools**: Integrate into `swipeOn`, `scrollUntil`, etc.
3. **Local models**: Add Florence-2/PaddleOCR for faster, free fallback
4. **Set-of-Mark**: Enhanced spatial understanding with visual markers
5. **Learning**: Track corrections to improve suggestions over time
