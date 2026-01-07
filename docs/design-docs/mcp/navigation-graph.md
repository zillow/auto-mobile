# Navigation Graph

Automatic mapping of app screen flows and navigation patterns.


The navigation graph captures:

- **Screens**: Unique UI states identified by activity/view hierarchy
- **Transitions**: Navigation between screens
- **Triggers**: Actions that cause navigation
- **History**: Sequence of screens visited

## Graph Structure

### Nodes (Screens)

Each screen is identified by:
```typescript
{
  screenId: string,        // Unique identifier
  activity: string,        // Android activity name
  title: string,           // Screen title/label
  signature: string,       // View hierarchy fingerprint
  timestamp: number        // First seen time
}
```

### Edges (Transitions)

Transitions record navigation:
```typescript
{
  from: string,           // Source screen ID
  to: string,             // Destination screen ID
  trigger: {
    action: string,       // "tap", "swipe", etc.
    element: string,      // Element that triggered transition
    text: string          // Element text/description
  },
  count: number,          // Times this transition occurred
  avgDuration: number     // Average transition time
}
```

## Building the Graph

### Automatic Discovery

As AutoMobile explores an app:
1. **Observe screen** - Capture view hierarchy and activity
2. **Generate fingerprint** - Create unique screen signature
3. **Detect transition** - Compare current vs previous screen
4. **Record edge** - Store trigger action and timing

### Navigation Detection

Transitions are detected by:

- Activity/fragment changes (Android)
- View controller changes (iOS)
- Significant UI hierarchy changes
- Window focus changes

## Using the Graph

### Navigate to Screen

The `navigateTo` tool uses the graph to find paths:

```typescript
await navigateTo({
  targetScreen: "Settings",
  platform: "android"
})
```

AutoMobile:
1. Finds target screen in graph
2. Calculates shortest path from current screen
3. Executes recorded actions to reach target
4. Verifies arrival at destination

### Explore Efficiently

The `explore` tool uses the graph to:

- Avoid revisiting known screens
- Prioritize unexplored branches
- Track coverage of app features

## Graph Persistence

The navigation graph is:

- Built incrementally during exploration
- Stored in memory during MCP session
- Available via MCP resources
- Can be exported for analysis

## MCP Tools

### `navigateTo`
Navigate to a specific screen using learned paths.

### `getNavigationGraph`
Retrieve the current navigation graph for debugging.

### `explore`
Automatically explore the app and build the graph.

## Rendering

The navigation graph can be visualized in:

- **IDE Plugin** - Real-time graph rendering in Android Studio
- **Export** - GraphViz DOT format for external visualization
- **MCP Resource** - JSON format for AI agent analysis

See [IDE Plugin](../plat/android/ide-plugin/overview.md) for graph visualization.

## Implementation Details

The navigation graph is built using:

- UI idle detection (gfxinfo-based)
- Screen fingerprinting (view hierarchy hashing)
- Transition timing (performance tracking)
- Action recording (interaction history)

See [Interaction Loop](interaction-loop.md) for integration.
