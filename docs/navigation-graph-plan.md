# Navigation Graph Implementation Plan

## Overview
Implement an in-memory navigation graph that tracks user navigation through an Android app by correlating navigation events from the AutoMobile SDK with tool call interactions. This enables intelligent automated navigation using the `navigateTo` tool.

## Current State

### Android SDK (Already Implemented)
- ✅ `NavigationEvent.kt` - Data class with destination, timestamp (milliseconds), source, arguments, metadata
- ✅ `NavigationEventAccumulator.kt` - Accumulates events with timestamps and sequence numbers
- ✅ `AutoMobileAccessibilityService.kt` - Broadcasts navigation events via WebSocket
  - Message type: `navigation_event`
  - Contains: `TimestampedNavigationEvent` with timestamp in milliseconds

### MCP Server (Current State)
- ❌ No handler for `navigation_event` WebSocket messages
- ❌ No in-memory navigation graph
- ❌ No `navigateTo` tool
- ✅ Tool registry pattern exists (`src/server/toolRegistry.ts`)
- ✅ WebSocket message handler exists (`src/features/observe/AccessibilityServiceClient.ts`)

## Implementation Plan

### Phase 1: WebSocket Message Handler

**File**: `src/features/observe/AccessibilityServiceClient.ts`

Add handler for `navigation_event` messages in `handleWebSocketMessage()`:

```typescript
interface NavigationEvent {
  destination: string;
  source: string;
  arguments: Record<string, string>;
  metadata: Record<string, string>;
  timestamp: number; // milliseconds
  sequenceNumber: number;
}

// In handleWebSocketMessage():
if (message.type === "navigation_event") {
  const event = (message as any).event as NavigationEvent;
  logger.debug(`[ACCESSIBILITY_SERVICE] Received navigation event: ${event.destination} at ${event.timestamp}`);

  // Pass to NavigationGraphManager
  NavigationGraphManager.getInstance().recordNavigationEvent(event);
}
```

### Phase 2: In-Memory Navigation Graph

**File**: `src/features/navigation/NavigationGraphManager.ts` (new)

Data structures:

```typescript
interface NavigationNode {
  screenName: string;           // destination from navigation event
  firstSeenAt: number;          // timestamp in ms
  lastSeenAt: number;           // timestamp in ms
  visitCount: number;
}

interface NavigationEdge {
  from: string;                 // source screen name
  to: string;                   // destination screen name
  interaction?: ToolCallInteraction; // the tool call that caused navigation
  timestamp: number;            // when this edge was created (ms)
  edgeType: "tool" | "back" | "unknown";
}

interface ToolCallInteraction {
  toolName: string;             // e.g., "tapOn", "inputText"
  args: Record<string, any>;    // tool arguments
  timestamp: number;            // when tool was called (ms)
}

class NavigationGraph {
  private nodes: Map<string, NavigationNode>;
  private edges: NavigationEdge[];
  private currentScreen: string | null;
  private toolCallHistory: ToolCallInteraction[];
  private readonly TOOL_CALL_CORRELATION_WINDOW_MS = 2000; // 2 second window
}
```

Core methods:

```typescript
class NavigationGraphManager {
  private graph: NavigationGraph;

  // Record a navigation event from WebSocket
  recordNavigationEvent(event: NavigationEvent): void {
    const screenName = event.destination;
    const timestamp = event.timestamp;

    // Update or create node
    if (!this.graph.nodes.has(screenName)) {
      this.graph.nodes.set(screenName, {
        screenName,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        visitCount: 1
      });
    } else {
      const node = this.graph.nodes.get(screenName)!;
      node.lastSeenAt = timestamp;
      node.visitCount++;
    }

    // Create edge from previous screen to current screen
    if (this.graph.currentScreen && this.graph.currentScreen !== screenName) {
      const interaction = this.findCorrelatedToolCall(timestamp);

      this.graph.edges.push({
        from: this.graph.currentScreen,
        to: screenName,
        interaction,
        timestamp,
        edgeType: interaction ? "tool" : "unknown"
      });
    }

    this.graph.currentScreen = screenName;
  }

  // Record a tool call for correlation
  recordToolCall(toolName: string, args: Record<string, any>): void {
    this.graph.toolCallHistory.push({
      toolName,
      args,
      timestamp: Date.now()
    });

    // Keep only recent tool calls (last 10 seconds)
    const cutoff = Date.now() - 10000;
    this.graph.toolCallHistory = this.graph.toolCallHistory.filter(
      tc => tc.timestamp >= cutoff
    );
  }

  // Find tool call that likely caused this navigation
  private findCorrelatedToolCall(navigationTimestamp: number): ToolCallInteraction | undefined {
    // Look for tool calls within correlation window BEFORE navigation event
    const candidates = this.graph.toolCallHistory.filter(tc => {
      const timeDiff = navigationTimestamp - tc.timestamp;
      return timeDiff >= 0 && timeDiff <= this.TOOL_CALL_CORRELATION_WINDOW_MS;
    });

    // Return the most recent tool call before navigation
    return candidates.length > 0
      ? candidates[candidates.length - 1]
      : undefined;
  }

  // Find path from current screen to target screen
  findPath(targetScreen: string): NavigationEdge[] | null {
    if (!this.graph.currentScreen) {
      return null;
    }

    // BFS to find shortest path
    const queue: Array<{ screen: string; path: NavigationEdge[] }> = [
      { screen: this.graph.currentScreen, path: [] }
    ];
    const visited = new Set<string>([this.graph.currentScreen]);

    while (queue.length > 0) {
      const { screen, path } = queue.shift()!;

      if (screen === targetScreen) {
        return path;
      }

      // Find all edges from current screen
      const outgoingEdges = this.graph.edges.filter(e => e.from === screen);

      for (const edge of outgoingEdges) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push({
            screen: edge.to,
            path: [...path, edge]
          });
        }
      }
    }

    return null; // No path found
  }

  // Get graph statistics for debugging
  getStats(): {
    nodeCount: number;
    edgeCount: number;
    currentScreen: string | null;
    knownEdgeCount: number;
    unknownEdgeCount: number;
  } {
    return {
      nodeCount: this.graph.nodes.size,
      edgeCount: this.graph.edges.length,
      currentScreen: this.graph.currentScreen,
      knownEdgeCount: this.graph.edges.filter(e => e.edgeType === "tool").length,
      unknownEdgeCount: this.graph.edges.filter(e => e.edgeType === "unknown").length
    };
  }
}
```

### Phase 3: Tool Call Interception

**File**: `src/server/toolRegistry.ts`

Modify `registerDeviceAware()` to record tool calls:

```typescript
const wrappedHandler: ToolHandler = async (args: any, progress?: ProgressCallback) => {
  // ... existing device setup code ...

  try {
    // Record tool call BEFORE execution
    NavigationGraphManager.getInstance().recordToolCall(name, args);

    let response: any | undefined;
    if (device !== undefined) {
      response = await handler(device, args, progress);
    }

    return response;
  } catch (error) {
    // ... existing error handling ...
  }
};
```

### Phase 4: NavigateTo Tool

**File**: `src/features/navigation/NavigateTo.ts` (new)

```typescript
export class NavigateTo {
  private navigationManager: NavigationGraphManager;
  private readonly MAX_TIMEOUT_MS = 30000;

  async execute(
    device: BootedDevice,
    options: { targetScreen: string },
    progress?: ProgressCallback
  ): Promise<NavigateToResult> {
    const startTime = Date.now();

    // Get current screen from navigation graph
    const currentScreen = this.navigationManager.getCurrentScreen();
    if (!currentScreen) {
      return {
        success: false,
        error: "Cannot determine current screen"
      };
    }

    if (currentScreen === options.targetScreen) {
      return {
        success: true,
        message: "Already on target screen",
        currentScreen,
        stepsExecuted: 0
      };
    }

    // Find path
    const path = this.navigationManager.findPath(options.targetScreen);
    if (!path) {
      return {
        success: false,
        error: `No known path from ${currentScreen} to ${options.targetScreen}`,
        currentScreen
      };
    }

    // Execute path
    const stepsExecuted: string[] = [];

    for (const edge of path) {
      // Check timeout
      if (Date.now() - startTime > this.MAX_TIMEOUT_MS) {
        return {
          success: false,
          error: "Navigation timeout (30 seconds)",
          currentScreen: this.navigationManager.getCurrentScreen(),
          stepsExecuted: stepsExecuted.length,
          partialPath: stepsExecuted
        };
      }

      if (progress) {
        await progress(
          stepsExecuted.length,
          path.length,
          `Navigating: ${edge.from} → ${edge.to}`
        );
      }

      // Execute navigation step
      if (edge.interaction) {
        // Replay the tool call
        await this.executeToolCall(device, edge.interaction);
        stepsExecuted.push(`${edge.interaction.toolName}(${JSON.stringify(edge.interaction.args)})`);
      } else {
        // No known interaction - try back button
        await this.pressBack(device);
        stepsExecuted.push("pressButton(back)");
      }

      // Wait for navigation to complete
      await this.waitForScreen(edge.to, 5000);
    }

    return {
      success: true,
      message: `Navigated to ${options.targetScreen}`,
      currentScreen: this.navigationManager.getCurrentScreen(),
      stepsExecuted: stepsExecuted.length,
      path: stepsExecuted
    };
  }

  private async executeToolCall(
    device: BootedDevice,
    interaction: ToolCallInteraction
  ): Promise<void> {
    // Get tool from registry and execute
    const tool = ToolRegistry.getTool(interaction.toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${interaction.toolName}`);
    }

    await tool.handler(interaction.args);
  }

  private async pressBack(device: BootedDevice): Promise<void> {
    const pressButton = new PressButton(device);
    await pressButton.execute({ button: "back", platform: device.platform });
  }

  private async waitForScreen(
    screenName: string,
    timeoutMs: number
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const currentScreen = this.navigationManager.getCurrentScreen();
      if (currentScreen === screenName) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return false;
  }
}
```

**Tool Registration**: `src/server/navigationTools.ts` (new)

```typescript
import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { NavigateTo } from "../features/navigation/NavigateTo";

const NavigateToSchema = z.object({
  targetScreen: z.string().describe("The destination screen name to navigate to"),
  platform: z.enum(["android", "ios"]).default("android")
});

export function registerNavigationTools() {
  ToolRegistry.registerDeviceAware(
    "navigateTo",
    "Navigate to a specific screen in the app using the learned navigation graph. Uses previously recorded navigation paths and UI interactions. If no known path exists, attempts to use back button navigation. Maximum timeout of 30 seconds.",
    NavigateToSchema,
    async (device, args) => {
      const navigateTo = new NavigateTo(device);
      return navigateTo.execute(device, args);
    },
    true // supports progress
  );
}
```

## Phase 5: Testing Strategy

### Unit Tests
1. `NavigationGraphManager.test.ts` - Test graph operations
2. `NavigateTo.test.ts` - Test navigation logic
3. Test tool call correlation with various time windows

### Integration Tests
1. Test end-to-end flow: tool call → navigation event → graph update
2. Test `navigateTo` with known paths
3. Test `navigateTo` with unknown paths (fallback to back button)

## Future Enhancements (Not in Scope)

### SQLite Persistence
- Schema with tables: `nodes`, `edges`, `tool_calls`
- Relations across screens and interactions
- Persist graph across sessions
- Load graph on server start

### Advanced Features
- Multiple paths ranking (prefer shorter/faster paths)
- Learn from failed navigation attempts
- Deep link integration
- Intent chooser handling during navigation
- Confidence scoring for edges

## Timeline Estimates

- Phase 1 (WebSocket Handler): 2 hours
- Phase 2 (Navigation Graph): 6 hours
- Phase 3 (Tool Interception): 2 hours
- Phase 4 (NavigateTo Tool): 6 hours
- Phase 5 (Testing): 4 hours

**Total**: ~20 hours

## Success Criteria

1. ✅ Navigation events from Android SDK are received and processed
2. ✅ In-memory graph correctly correlates tool calls with navigation events
3. ✅ `navigateTo` successfully navigates along known paths
4. ✅ `navigateTo` falls back to back button for unknown transitions
5. ✅ Graph statistics are queryable for debugging
6. ✅ All tests passing
