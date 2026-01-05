import {
  NavigationGraph,
  NavigationEvent,
  NavigationNode,
  NavigationEdge,
  NavigationGraphStats,
  PathResult,
  ToolCallInteraction,
  ExportedGraph,
  UIState,
  BackStackInfo,
  NavigationGraphSummary,
  NavigationGraphSummaryEdge,
  NavigationGraphSummaryNode,
  NavigationGraphSummaryProvider
} from "../../src/utils/interfaces/NavigationGraph";

/**
 * Fake implementation of NavigationGraph for testing.
 * Allows full control over navigation graph state and behavior.
 */
export class FakeNavigationGraphManager implements NavigationGraph, NavigationGraphSummaryProvider {
  private currentAppId: string | null = null;
  private currentScreen: string | null = null;
  private nodes: Map<string, NavigationNode> = new Map();
  private edges: NavigationEdge[] = [];
  private toolCallHistory: ToolCallInteraction[] = [];
  private nodeSummaryIds: Map<string, number> = new Map();
  private edgeSummaries: NavigationGraphSummaryEdge[] = [];
  private nextNodeId = 1;
  private nextEdgeId = 1;
  private graphUpdateListener?: () => void;

  // Call tracking
  private methodCalls: Map<string, any[][]> = new Map();

  // Configurable responses
  private pathResult: PathResult | null = null;

  // ==================== Configuration Methods ====================

  /**
   * Set the current app ID.
   */
  setCurrentAppId(appId: string | null): void {
    this.currentAppId = appId;
  }

  /**
   * Set the current screen.
   */
  setCurrentScreenValue(screen: string | null): void {
    this.currentScreen = screen;
  }

  /**
   * Add a node to the graph.
   */
  addNode(node: NavigationNode): void {
    this.nodes.set(node.screenName, node);
    if (!this.nodeSummaryIds.has(node.screenName)) {
      this.nodeSummaryIds.set(node.screenName, this.nextNodeId++);
    }
  }

  /**
   * Add an edge to the graph.
   */
  addEdge(edge: NavigationEdge): void {
    this.edges.push(edge);
    this.edgeSummaries.push({
      id: this.nextEdgeId++,
      from: edge.from,
      to: edge.to,
      toolName: edge.interaction?.toolName ?? null
    });
  }

  /**
   * Set the result that findPath will return.
   */
  setPathResult(result: PathResult): void {
    this.pathResult = result;
  }

  /**
   * Add a tool call to the history.
   */
  addToolCallToHistory(interaction: ToolCallInteraction): void {
    this.toolCallHistory.push(interaction);
  }

  // ==================== Call Tracking ====================

  private trackCall(method: string, args: any[]): void {
    if (!this.methodCalls.has(method)) {
      this.methodCalls.set(method, []);
    }
    this.methodCalls.get(method)!.push(args);
  }

  /**
   * Check if a method was called.
   */
  wasMethodCalled(method: string): boolean {
    return (this.methodCalls.get(method)?.length ?? 0) > 0;
  }

  /**
   * Get number of times a method was called.
   */
  getMethodCallCount(method: string): number {
    return this.methodCalls.get(method)?.length ?? 0;
  }

  /**
   * Get the arguments of a specific call to a method.
   */
  getMethodCallArgs(method: string, callIndex: number = 0): any[] | undefined {
    return this.methodCalls.get(method)?.[callIndex];
  }

  /**
   * Clear all call tracking.
   */
  clearCallHistory(): void {
    this.methodCalls.clear();
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this.currentAppId = null;
    this.currentScreen = null;
    this.nodes.clear();
    this.edges = [];
    this.toolCallHistory = [];
    this.nodeSummaryIds.clear();
    this.edgeSummaries = [];
    this.nextNodeId = 1;
    this.nextEdgeId = 1;
    this.graphUpdateListener = undefined;
    this.pathResult = null;
    this.methodCalls.clear();
  }

  // ==================== NavigationGraph Interface ====================

  setCurrentApp(appId: string): void {
    this.trackCall("setCurrentApp", [appId]);
    this.currentAppId = appId;
    this.emitGraphUpdated();
  }

  getCurrentAppId(): string | null {
    this.trackCall("getCurrentAppId", []);
    return this.currentAppId;
  }

  recordNavigationEvent(event: NavigationEvent): void {
    this.trackCall("recordNavigationEvent", [event]);

    // Update current screen
    this.currentScreen = event.destination;

    // Add or update node
    if (!this.nodes.has(event.destination)) {
      this.nodes.set(event.destination, {
        screenName: event.destination,
        firstSeenAt: event.timestamp,
        lastSeenAt: event.timestamp,
        visitCount: 1
      });
      this.nodeSummaryIds.set(event.destination, this.nextNodeId++);
    } else {
      const node = this.nodes.get(event.destination)!;
      node.lastSeenAt = event.timestamp;
      node.visitCount++;
    }

    this.emitGraphUpdated();
  }

  recordBackStack(backStack: BackStackInfo): void {
    this.trackCall("recordBackStack", [backStack]);
  }

  recordToolCall(toolName: string, args: Record<string, any>, uiState?: UIState): void {
    this.trackCall("recordToolCall", [toolName, args, uiState]);
    this.toolCallHistory.push({
      toolName,
      args,
      timestamp: Date.now(),
      uiState
    });
  }

  getCurrentScreen(): string | null {
    this.trackCall("getCurrentScreen", []);
    return this.currentScreen;
  }

  findPath(targetScreen: string): PathResult {
    this.trackCall("findPath", [targetScreen]);

    if (this.pathResult) {
      return this.pathResult;
    }

    // Default behavior: check if we can find a simple path
    if (!this.currentScreen) {
      return {
        found: false,
        path: [],
        startScreen: "",
        targetScreen
      };
    }

    if (this.currentScreen === targetScreen) {
      return {
        found: true,
        path: [],
        startScreen: this.currentScreen,
        targetScreen
      };
    }

    // Look for direct edge
    const directEdge = this.edges.find(
      e => e.from === this.currentScreen && e.to === targetScreen
    );

    if (directEdge) {
      return {
        found: true,
        path: [directEdge],
        startScreen: this.currentScreen,
        targetScreen
      };
    }

    return {
      found: false,
      path: [],
      startScreen: this.currentScreen,
      targetScreen
    };
  }

  getKnownScreens(): string[] {
    this.trackCall("getKnownScreens", []);
    return Array.from(this.nodes.keys());
  }

  getNode(screenName: string): NavigationNode | undefined {
    this.trackCall("getNode", [screenName]);
    return this.nodes.get(screenName);
  }

  getEdgesFrom(screenName: string): NavigationEdge[] {
    this.trackCall("getEdgesFrom", [screenName]);
    return this.edges.filter(e => e.from === screenName);
  }

  getEdgesTo(screenName: string): NavigationEdge[] {
    this.trackCall("getEdgesTo", [screenName]);
    return this.edges.filter(e => e.to === screenName);
  }

  getStats(): NavigationGraphStats {
    this.trackCall("getStats", []);
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.length,
      currentScreen: this.currentScreen,
      knownEdgeCount: this.edges.filter(e => e.edgeType === "tool").length,
      unknownEdgeCount: this.edges.filter(e => e.edgeType === "unknown").length,
      toolCallHistorySize: this.toolCallHistory.length
    };
  }

  clearCurrentGraph(): void {
    this.trackCall("clearCurrentGraph", []);
    this.nodes.clear();
    this.edges = [];
    this.currentScreen = null;
    this.toolCallHistory = [];
    this.nodeSummaryIds.clear();
    this.edgeSummaries = [];
    this.nextNodeId = 1;
    this.nextEdgeId = 1;
    this.emitGraphUpdated();
  }

  clearAllGraphs(): void {
    this.trackCall("clearAllGraphs", []);
    this.clearCurrentGraph();
    this.currentAppId = null;
    this.emitGraphUpdated();
  }

  exportGraph(): ExportedGraph {
    this.trackCall("exportGraph", []);
    return {
      appId: this.currentAppId,
      nodes: Array.from(this.nodes.values()),
      edges: [...this.edges],
      currentScreen: this.currentScreen
    };
  }

  async exportGraphSummary(): Promise<NavigationGraphSummary> {
    this.trackCall("exportGraphSummary", []);
    const nodes: NavigationGraphSummaryNode[] = Array.from(this.nodes.values()).map(node => ({
      id: this.nodeSummaryIds.get(node.screenName) ?? this.nextNodeId++,
      screenName: node.screenName,
      visitCount: node.visitCount
    }));

    return {
      appId: this.currentAppId,
      nodes,
      edges: [...this.edgeSummaries],
      currentScreen: this.currentScreen
    };
  }

  setGraphUpdateListener(listener: (() => void) | null): void {
    this.graphUpdateListener = listener ?? undefined;
  }

  private emitGraphUpdated(): void {
    if (this.graphUpdateListener) {
      this.graphUpdateListener();
    }
  }
}
