# Implement In-Memory Navigation Graph and NavigateTo Tool

## Overview
Implement an intelligent navigation system that learns app navigation patterns by correlating navigation events from the AutoMobile Android SDK with MCP tool call interactions. Enable automated navigation to any previously-visited screen using the new `navigateTo` tool.

## Background

The AutoMobile Android SDK recently added support for publishing navigation events via broadcast receiver to the accessibility service, which streams them over WebSocket to the MCP server. However, the TypeScript MCP server currently has no handler for these events.

## Requirements

### 1. Navigation Event Timestamps
- ✅ **Already implemented**: Timestamps are set in milliseconds via `System.currentTimeMillis()` in both `NavigationEvent.kt` and `NavigationEventAccumulator.kt`
- Verify timestamps are correctly propagated through WebSocket messages

### 2. In-Memory Navigation Graph

Build a navigation graph in memory that tracks:
- **Screen nodes**: Screen names with visit counts and timestamps
- **Navigation edges**: Transitions between screens with the interaction that caused them
- **Tool call correlation**: Match navigation events to tool calls based on timestamps (within a correlation window)
- **Unknown transitions**: Support placeholders when no tool call is found (e.g., system-triggered navigation)

Data structure requirements:
```typescript
interface NavigationNode {
  screenName: string;
  firstSeenAt: number;      // milliseconds
  lastSeenAt: number;       // milliseconds
  visitCount: number;
}

interface NavigationEdge {
  from: string;             // source screen
  to: string;               // destination screen
  interaction?: {
    toolName: string;       // e.g., "tapOn", "inputText"
    args: Record<string, any>;
    timestamp: number;      // milliseconds
  };
  timestamp: number;        // milliseconds
  edgeType: "tool" | "back" | "unknown";
}
```

Key capabilities:
- Record navigation events from WebSocket
- Record tool calls before execution (for correlation)
- Find shortest path between screens using BFS
- Support multiple edge types between same screen pairs
- Maintain tool call history with sliding window (10 seconds)
- Provide graph statistics for debugging

**Note**: SQLite persistence will be implemented in a future iteration. For now, the graph is in-memory only.

### 3. Tool Call Correlation

Modify the tool registry to record all tool calls with timestamps before execution:
- Intercept in `ToolRegistry.registerDeviceAware()` wrapper
- Record tool name, arguments, and timestamp
- Maintain recent history (last 10 seconds)
- Correlation window: 2 seconds (tool call must occur 0-2000ms before navigation event)

### 4. NavigateTo Tool

Implement a new MCP tool that uses the navigation graph to traverse the app:

**Specification**:
- **Tool name**: `navigateTo`
- **Input**: `{ targetScreen: string, platform: "android" | "ios" }`
- **Timeout**: Maximum 30 seconds
- **Strategy**:
  1. Find shortest path using BFS
  2. Execute each edge's interaction (if known)
  3. Fall back to `pressButton(back)` if no known interaction
  4. Wait for screen transition to complete (5 second timeout per step)
  5. Report progress during navigation

**Return format**:
```typescript
{
  success: boolean;
  message?: string;
  error?: string;
  currentScreen: string | null;
  stepsExecuted: number;
  path?: string[];           // Array of executed actions
  partialPath?: string[];    // If timeout occurred
}
```

### 5. WebSocket Message Handler

Add handler for `navigation_event` messages in `AccessibilityServiceClient.ts`:
- Message type: `"navigation_event"`
- Payload includes `TimestampedNavigationEvent` with:
  - `destination`: string
  - `source`: string (navigation framework)
  - `arguments`: Map<string, string>
  - `metadata`: Map<string, string>
  - `timestamp`: number (milliseconds)
  - `sequenceNumber`: number

## Implementation Plan

See [`docs/navigation-graph-plan.md`](./navigation-graph-plan.md) for detailed implementation plan including:
- Phase-by-phase breakdown
- Code examples and pseudocode
- File structure
- Testing strategy

## Files to Create/Modify

### New Files
- `src/features/navigation/NavigationGraphManager.ts` - Core graph logic
- `src/features/navigation/NavigateTo.ts` - NavigateTo tool implementation
- `src/server/navigationTools.ts` - Tool registration
- `test/features/navigation/NavigationGraphManager.test.ts`
- `test/features/navigation/NavigateTo.test.ts`

### Modified Files
- `src/features/observe/AccessibilityServiceClient.ts` - Add navigation_event handler
- `src/server/toolRegistry.ts` - Intercept tool calls
- `src/server/index.ts` - Register navigation tools

## Success Criteria

- [ ] Navigation events from Android SDK are received via WebSocket
- [ ] Events are processed and nodes/edges are created in the graph
- [ ] Tool calls are correctly correlated with navigation events (within 2 second window)
- [ ] Graph supports multiple edge types between same screens
- [ ] `navigateTo` successfully navigates along known paths
- [ ] `navigateTo` falls back to back button for unknown transitions
- [ ] `navigateTo` respects 30 second timeout
- [ ] Graph statistics API available for debugging
- [ ] All unit and integration tests passing

## Future Enhancements (Out of Scope)

- SQLite persistence with relational schema
- Path ranking (prefer shorter/faster paths)
- Learning from failed navigation attempts
- Deep link integration
- Intent chooser handling during navigation
- Confidence scoring for edges
- Graph visualization

## Related

- Android SDK navigation events: `android/auto-mobile-sdk/src/main/kotlin/dev/jasonpearson/automobile/sdk/NavigationEvent.kt`
- Accessibility service broadcast: `android/accessibility-service/src/main/java/dev/jasonpearson/automobile/accessibilityservice/AutoMobileAccessibilityService.kt` (line 1252-1277)
- MCP tool registry: `src/server/toolRegistry.ts`
