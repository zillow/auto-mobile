import { logger } from "../../utils/logger";
import {
  NavigationGraph,
  NavigationEvent,
  NavigationNode,
  NavigationEdge,
  NavigationGraphStats,
  PathResult,
  ToolCallInteraction,
  ExportedGraph,
  UIState
} from "../../utils/interfaces/NavigationGraph";

// Re-export types for convenience
export {
  NavigationGraph,
  NavigationEvent,
  NavigationNode,
  NavigationEdge,
  NavigationGraphStats,
  PathResult,
  ToolCallInteraction,
  ExportedGraph,
  UIState
};

/**
 * Internal graph data structure.
 */
interface InternalNavigationGraph {
  nodes: Map<string, NavigationNode>;
  edges: NavigationEdge[];
  currentScreen: string | null;
  toolCallHistory: ToolCallInteraction[];
}

/**
 * Manages the in-memory navigation graph for an app.
 * Tracks screen visits and correlates navigation events with tool calls.
 */
export class NavigationGraphManager implements NavigationGraph {
  private static instance: NavigationGraphManager | null = null;

  private graphs: Map<string, InternalNavigationGraph> = new Map(); // Per-app graphs
  private currentAppId: string | null = null;

  // Correlation window: tool call must occur 0-2000ms before navigation event
  private readonly TOOL_CALL_CORRELATION_WINDOW_MS = 2000;
  // Keep tool calls for 10 seconds
  private readonly TOOL_CALL_HISTORY_TTL_MS = 10000;

  private constructor() {}

  /**
   * Get the singleton instance of NavigationGraphManager.
   */
  public static getInstance(): NavigationGraphManager {
    if (!NavigationGraphManager.instance) {
      NavigationGraphManager.instance = new NavigationGraphManager();
    }
    return NavigationGraphManager.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  public static resetInstance(): void {
    NavigationGraphManager.instance = null;
  }

  /**
   * Set the current app being navigated.
   * This allows tracking separate graphs per app.
   */
  public setCurrentApp(appId: string): void {
    this.currentAppId = appId;
    if (!this.graphs.has(appId)) {
      this.graphs.set(appId, {
        nodes: new Map(),
        edges: [],
        currentScreen: null,
        toolCallHistory: []
      });
      logger.info(`[NAVIGATION_GRAPH] Created new graph for app: ${appId}`);
    }
  }

  /**
   * Get the current app ID.
   */
  public getCurrentAppId(): string | null {
    return this.currentAppId;
  }

  /**
   * Get or create the graph for the current app.
   */
  private getGraph(): InternalNavigationGraph | null {
    if (!this.currentAppId) {
      return null;
    }
    return this.graphs.get(this.currentAppId) || null;
  }

  /**
   * Record a navigation event from WebSocket.
   */
  public recordNavigationEvent(event: NavigationEvent): void {
    const graph = this.getGraph();
    if (!graph) {
      logger.warn(`[NAVIGATION_GRAPH] Cannot record event - no current app set`);
      return;
    }

    const screenName = event.destination;
    const timestamp = event.timestamp;

    // Update or create node
    if (!graph.nodes.has(screenName)) {
      graph.nodes.set(screenName, {
        screenName,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        visitCount: 1
      });
      logger.info(`[NAVIGATION_GRAPH] New screen discovered: ${screenName}`);
    } else {
      const node = graph.nodes.get(screenName)!;
      node.lastSeenAt = timestamp;
      node.visitCount++;
      logger.debug(`[NAVIGATION_GRAPH] Screen revisited: ${screenName} (visit #${node.visitCount})`);
    }

    // Create edge from previous screen to current screen
    if (graph.currentScreen && graph.currentScreen !== screenName) {
      const interaction = this.findCorrelatedToolCall(graph, timestamp);

      const edge: NavigationEdge = {
        from: graph.currentScreen,
        to: screenName,
        interaction,
        timestamp,
        edgeType: interaction ? "tool" : "unknown",
        uiState: interaction?.uiState
      };

      graph.edges.push(edge);

      if (interaction) {
        const uiStateInfo = interaction.uiState?.selectedElements.length
          ? ` (requires: ${interaction.uiState.selectedElements.map(e => e.text || e.resourceId).join(", ")})`
          : "";
        logger.info(
          `[NAVIGATION_GRAPH] Edge added: ${graph.currentScreen} → ${screenName} via ${interaction.toolName}${uiStateInfo}`
        );
      } else {
        logger.info(
          `[NAVIGATION_GRAPH] Edge added: ${graph.currentScreen} → ${screenName} (unknown interaction)`
        );
      }
    }

    graph.currentScreen = screenName;
  }

  /**
   * Record a tool call for correlation with future navigation events.
   */
  public recordToolCall(toolName: string, args: Record<string, any>, uiState?: UIState): void {
    const graph = this.getGraph();
    if (!graph) {
      // Store in a temporary buffer if no app is set yet
      logger.debug(`[NAVIGATION_GRAPH] Tool call recorded without app context: ${toolName}`);
      return;
    }

    const timestamp = Date.now();

    graph.toolCallHistory.push({
      toolName,
      args,
      timestamp,
      uiState
    });

    const uiStateInfo = uiState?.selectedElements.length
      ? ` (UI: ${uiState.selectedElements.map(e => e.text || e.resourceId).join(", ")})`
      : "";
    logger.debug(`[NAVIGATION_GRAPH] Tool call recorded: ${toolName} at ${timestamp}${uiStateInfo}`);

    // Clean up old tool calls
    this.cleanupToolCallHistory(graph);
  }

  /**
   * Remove tool calls older than TTL.
   */
  private cleanupToolCallHistory(graph: InternalNavigationGraph): void {
    const cutoff = Date.now() - this.TOOL_CALL_HISTORY_TTL_MS;
    const before = graph.toolCallHistory.length;
    graph.toolCallHistory = graph.toolCallHistory.filter(tc => tc.timestamp >= cutoff);
    const removed = before - graph.toolCallHistory.length;
    if (removed > 0) {
      logger.debug(`[NAVIGATION_GRAPH] Cleaned up ${removed} old tool calls`);
    }
  }

  /**
   * Find a tool call that likely caused a navigation event.
   * Looks for tool calls within the correlation window BEFORE the navigation event.
   */
  private findCorrelatedToolCall(
    graph: InternalNavigationGraph,
    navigationTimestamp: number
  ): ToolCallInteraction | undefined {
    // Look for tool calls within correlation window BEFORE navigation event
    const candidates = graph.toolCallHistory.filter(tc => {
      const timeDiff = navigationTimestamp - tc.timestamp;
      return timeDiff >= 0 && timeDiff <= this.TOOL_CALL_CORRELATION_WINDOW_MS;
    });

    if (candidates.length === 0) {
      return undefined;
    }

    // Return the most recent tool call before navigation
    const mostRecent = candidates[candidates.length - 1];
    logger.debug(
      `[NAVIGATION_GRAPH] Correlated tool call: ${mostRecent.toolName} ` +
      `(${navigationTimestamp - mostRecent.timestamp}ms before navigation)`
    );
    return mostRecent;
  }

  /**
   * Get the current screen name.
   */
  public getCurrentScreen(): string | null {
    const graph = this.getGraph();
    return graph?.currentScreen || null;
  }

  /**
   * Find the shortest path from current screen to target screen using BFS.
   */
  public findPath(targetScreen: string): PathResult {
    const graph = this.getGraph();

    if (!graph || !graph.currentScreen) {
      return {
        found: false,
        path: [],
        startScreen: "",
        targetScreen
      };
    }

    const startScreen = graph.currentScreen;

    if (startScreen === targetScreen) {
      return {
        found: true,
        path: [],
        startScreen,
        targetScreen
      };
    }

    // BFS to find shortest path
    const queue: Array<{ screen: string; path: NavigationEdge[] }> = [
      { screen: startScreen, path: [] }
    ];
    const visited = new Set<string>([startScreen]);

    while (queue.length > 0) {
      const { screen, path } = queue.shift()!;

      // Find all edges from current screen
      const outgoingEdges = graph.edges.filter(e => e.from === screen);

      for (const edge of outgoingEdges) {
        if (edge.to === targetScreen) {
          // Found the target
          return {
            found: true,
            path: [...path, edge],
            startScreen,
            targetScreen
          };
        }

        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push({
            screen: edge.to,
            path: [...path, edge]
          });
        }
      }
    }

    // No path found
    return {
      found: false,
      path: [],
      startScreen,
      targetScreen
    };
  }

  /**
   * Get all known screen names.
   */
  public getKnownScreens(): string[] {
    const graph = this.getGraph();
    if (!graph) {
      return [];
    }
    return Array.from(graph.nodes.keys());
  }

  /**
   * Get a specific node by screen name.
   */
  public getNode(screenName: string): NavigationNode | undefined {
    const graph = this.getGraph();
    return graph?.nodes.get(screenName);
  }

  /**
   * Get all edges from a specific screen.
   */
  public getEdgesFrom(screenName: string): NavigationEdge[] {
    const graph = this.getGraph();
    if (!graph) {
      return [];
    }
    return graph.edges.filter(e => e.from === screenName);
  }

  /**
   * Get all edges to a specific screen.
   */
  public getEdgesTo(screenName: string): NavigationEdge[] {
    const graph = this.getGraph();
    if (!graph) {
      return [];
    }
    return graph.edges.filter(e => e.to === screenName);
  }

  /**
   * Get graph statistics for debugging.
   */
  public getStats(): NavigationGraphStats {
    const graph = this.getGraph();
    if (!graph) {
      return {
        nodeCount: 0,
        edgeCount: 0,
        currentScreen: null,
        knownEdgeCount: 0,
        unknownEdgeCount: 0,
        toolCallHistorySize: 0
      };
    }

    return {
      nodeCount: graph.nodes.size,
      edgeCount: graph.edges.length,
      currentScreen: graph.currentScreen,
      knownEdgeCount: graph.edges.filter(e => e.edgeType === "tool").length,
      unknownEdgeCount: graph.edges.filter(e => e.edgeType === "unknown").length,
      toolCallHistorySize: graph.toolCallHistory.length
    };
  }

  /**
   * Clear the graph for the current app.
   */
  public clearCurrentGraph(): void {
    if (this.currentAppId) {
      this.graphs.delete(this.currentAppId);
      logger.info(`[NAVIGATION_GRAPH] Cleared graph for app: ${this.currentAppId}`);
    }
  }

  /**
   * Clear all graphs.
   */
  public clearAllGraphs(): void {
    this.graphs.clear();
    this.currentAppId = null;
    logger.info(`[NAVIGATION_GRAPH] Cleared all navigation graphs`);
  }

  /**
   * Export the current graph for debugging/visualization.
   */
  public exportGraph(): ExportedGraph {
    const graph = this.getGraph();
    if (!graph) {
      return {
        appId: this.currentAppId,
        nodes: [],
        edges: [],
        currentScreen: null
      };
    }

    return {
      appId: this.currentAppId,
      nodes: Array.from(graph.nodes.values()),
      edges: [...graph.edges],
      currentScreen: graph.currentScreen
    };
  }
}
