# Features - MCP Server - Resources

AutoMobile exposes MCP resources that provide direct access to the current device state for automation and debugging workflows.

## Available Resources

### Latest Observation

**URI:** `automobile://observation/latest`

**Type:** JSON (text)

**Description:** The most recent screen observation including view hierarchy, elements, and metadata. Updated automatically after each `observe()` tool call.

**Contents:**
- `updatedAt`: Timestamp of the observation
- `screenSize`: Current screen dimensions (rotation-aware)
- `systemInsets`: UI insets for all screen edges (status bar, navigation bar, etc.)
- `rotation`: Current device rotation value (0-3)
- `activeWindow`: Current app and activity information
- `viewHierarchy`: Complete UI hierarchy
- `elements`: Categorized UI elements (clickable, scrollable, text)
- `focusedElement`: Currently focused UI element (if any)
- `intentChooserDetected`: Whether a system intent chooser is visible
- `wakefulness`: Device wake state ("Awake", "Asleep", "Dozing")
- `userId`: Android user profile ID (0=personal, 10+=work profile)
- `backStack`: Activity back stack information
- `performanceAudit`: UI performance metrics (if enabled)
- `accessibilityAudit`: WCAG accessibility audit results (if enabled)

**Example Usage:**

```typescript
// Read latest observation
const response = await client.request({
  method: "resources/read",
  params: {
    uri: "automobile://observation/latest"
  }
});

const observation = JSON.parse(response.contents[0].text);
console.log("Current screen:", observation.activeWindow);
console.log("Clickable elements:", observation.elements.clickable);
```

### Latest Screenshot

**URI:** `automobile://observation/latest/screenshot`

**Type:** Image (PNG or WebP as base64 blob)

**Description:** The most recent screen capture. Updated automatically after each `observe()` tool call.

**Example Usage:**

```typescript
// Read latest screenshot
const response = await client.request({
  method: "resources/read",
  params: {
    uri: "automobile://observation/latest/screenshot"
  }
});

const screenshot = response.contents[0];
console.log("Screenshot format:", screenshot.mimeType); // "image/png" or "image/webp"
// screenshot.blob contains base64-encoded image data
```

## Resource Updates

Resources are automatically updated whenever the `observe()` tool is called. After each observation:

1. The observation data is cached in memory and on disk
2. The screenshot is saved to the cache directory
3. Resource update notifications are sent to all connected MCP clients

MCP clients can subscribe to resource updates using the standard MCP notification mechanism:

```json
{
  "method": "notifications/resources/updated",
  "params": {
    "uri": "automobile://observation/latest"
  }
}
```

Navigation graph resources publish update notifications when navigation events are recorded, debounced to at most once per second.

## Use Cases

### Test Assertions

Access the current screen state directly in your tests:

```typescript
// Check current screen state
const obs = await getObservation();
assert(obs.activeWindow.appId === "com.example.app");
assert(obs.elements.clickable.some(el => el.text === "Login"));
```

### Debugging

Inspect what the device sees without calling observe again:

```typescript
// Get the latest observation without triggering a new capture
const currentState = await readResource("automobile://observation/latest");
console.log("Last observation was at:", currentState.updatedAt);
console.log("Screen elements:", currentState.viewHierarchy);
```

### Reactive Testing

Wait for screen state changes:

```typescript
// Subscribe to observation updates
client.on("notification", (notification) => {
  if (notification.method === "notifications/resources/updated") {
    if (notification.params.uri === "automobile://observation/latest") {
      // Screen state changed, re-read observation
      checkForExpectedState();
    }
  }
});
```

### Visual Regression Testing

Compare screenshots across test runs:

```typescript
// Get current screenshot
const screenshot = await readResource("automobile://observation/latest/screenshot");
const currentImage = Buffer.from(screenshot.blob, "base64");

// Compare with baseline
const diff = await compareImages(baselineImage, currentImage);
assert(diff.percentDifferent < 0.01);
```

### Navigation Graph

**URI:** `automobile://navigation/graph`

**Type:** JSON (text)

**Description:** High-level navigation graph for the current app. Includes node IDs, screen names, visit counts, and edge transitions with tool names. Updates are debounced to once per second while navigation events are recorded.

**Contents:**
- `appId`: Current application package ID (or null if unset)
- `currentScreen`: Most recently observed screen name
- `nodes`: Array of `{ id, screenName, visitCount }`
- `edges`: Array of `{ id, from, to, toolName }`

**Example Usage:**

```typescript
// Read navigation graph summary
const response = await client.request({
  method: "resources/read",
  params: {
    uri: "automobile://navigation/graph"
  }
});

const graph = JSON.parse(response.contents[0].text);
console.log("Graph nodes:", graph.nodes.length);
console.log("Graph edges:", graph.edges.length);
```

## Error Handling

If no observation is available (i.e., `observe()` has not been called yet), the resources return an error message:

```json
{
  "error": "No observation available. Call the 'observe' tool first to capture screen state."
}
```

For screenshots:

```json
{
  "error": "No screenshot available. Call the 'observe' tool first to capture a screenshot."
}
```

## Cache Behavior

- **Observation Cache:** Stored in `/tmp/auto-mobile/observe_results/` with a 5-minute TTL
- **Screenshot Cache:** Stored in `/tmp/auto-mobile/screenshots/` with a 128MB size limit (LRU cleanup)

The caches are shared across all MCP connections to the same AutoMobile server instance.

## Implementation Notes

Resources use the standard MCP resource protocol:
- `resources/list` - List all available resources
- `resources/read` - Read resource content by URI
- `notifications/resources/updated` - Notification when a resource changes

For more details on the MCP resource protocol, see the [Model Context Protocol specification](https://modelcontextprotocol.io/docs/concepts/resources).
