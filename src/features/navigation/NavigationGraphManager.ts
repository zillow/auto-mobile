import { logger } from "../../utils/logger";
import { BackStackInfo } from "../../models";
import { NavigationRepository } from "../../db/navigationRepository";
import type { NavigationEdge as DBNavigationEdge } from "../../db/types";
import {
  NavigationGraph,
  NavigationEvent,
  HierarchyNavigationEvent,
  NavigationNode,
  NavigationEdge,
  NavigationGraphStats,
  PathResult,
  ToolCallInteraction,
  ExportedGraph,
  NavigationGraphSummary,
  NavigationGraphSummaryEdge,
  NavigationGraphSummaryNode,
  NavigationGraphSummaryProvider,
  UIState,
  ScrollPosition,
  SelectedElement,
} from "../../utils/interfaces/NavigationGraph";

// Re-export types for convenience
export type {
  NavigationGraph,
  NavigationEvent,
  HierarchyNavigationEvent,
  NavigationNode,
  NavigationEdge,
  NavigationGraphStats,
  PathResult,
  ToolCallInteraction,
  ExportedGraph,
  NavigationGraphSummary,
  NavigationGraphSummaryEdge,
  NavigationGraphSummaryNode,
  NavigationGraphSummaryProvider,
  UIState,
};

/**
 * Manages the navigation graph with SQLite persistence.
 * Tracks screen visits and correlates navigation events with tool calls.
 */
export class NavigationGraphManager implements NavigationGraph, NavigationGraphSummaryProvider {
  private static instance: NavigationGraphManager | null = null;

  private repository: NavigationRepository;
  private currentAppId: string | null = null;
  private currentScreen: string | null = null;
  private graphUpdateListener?: () => void;

  // Tool call history kept in memory for correlation (transient data)
  private toolCallHistory: ToolCallInteraction[] = [];

  // Correlation window: tool call must occur 0-2000ms before navigation event
  private readonly TOOL_CALL_CORRELATION_WINDOW_MS = 2000;
  // Keep tool calls for 10 seconds
  private readonly TOOL_CALL_HISTORY_TTL_MS = 10000;

  private constructor() {
    this.repository = new NavigationRepository();
  }

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
   * Creates the app record in the database if it doesn't exist.
   */
  public async setCurrentApp(appId: string): Promise<void> {
    if (this.currentAppId === appId) {
      return;
    }

    this.currentAppId = appId;
    this.currentScreen = null;

    // Ensure app exists in database
    await this.repository.getOrCreateApp(appId);
    logger.info(`[NAVIGATION_GRAPH] Set current app: ${appId}`);
    this.notifyGraphUpdated();
  }

  /**
   * Get the current app ID.
   */
  public getCurrentAppId(): string | null {
    return this.currentAppId;
  }

  /**
   * Record back stack information for the current screen.
   * Updates the current node with back stack depth and task ID.
   */
  public async recordBackStack(backStack: BackStackInfo): Promise<void> {
    if (!this.currentAppId || !this.currentScreen) {
      logger.debug(`[NAVIGATION_GRAPH] Cannot record back stack - no current app or screen`);
      return;
    }

    await this.repository.updateNodeBackStack(
      this.currentAppId,
      this.currentScreen,
      backStack.depth,
      backStack.currentTaskId
    );

    logger.debug(
      `[NAVIGATION_GRAPH] Updated back stack for ${this.currentScreen}: ` +
      `depth=${backStack.depth}, taskId=${backStack.currentTaskId}`
    );
  }

  /**
   * Record a navigation event from WebSocket.
   * If the event contains an applicationId, automatically sets/switches the current app.
   */
  public async recordNavigationEvent(event: NavigationEvent): Promise<void> {
    // Auto-set current app from navigation event if provided
    if (event.applicationId && event.applicationId !== this.currentAppId) {
      await this.setCurrentApp(event.applicationId);
    }

    if (!this.currentAppId) {
      logger.warn(`[NAVIGATION_GRAPH] Cannot record event - no current app set`);
      return;
    }

    const screenName = event.destination;
    const timestamp = event.timestamp;

    // Get or create node and update visit count
    const node = await this.repository.getOrCreateNode(
      this.currentAppId,
      screenName,
      timestamp
    );

    // Get modal stack from the most recent tool call (if any)
    const recentToolCall = this.findCorrelatedToolCall(timestamp);
    const currentModalStack = recentToolCall?.uiState?.modalStack;

    // Update node modals if present
    if (currentModalStack && currentModalStack.length > 0) {
      const modalIds = currentModalStack.map(m => m.identifier || `${m.type}-${m.layer}`);
      await this.repository.setNodeModals(node.id, modalIds);

      logger.info(
        `[NAVIGATION_GRAPH] Screen ${screenName} has ${modalIds.length} modal(s)`
      );
    }

    // Create edge from previous screen to current screen
    if (this.currentScreen && this.currentScreen !== screenName) {
      const interaction = this.findCorrelatedToolCall(timestamp);

      const toolName = interaction?.toolName || null;
      const toolArgs = interaction?.args || null;

      const edge = await this.repository.createEdge(
        this.currentAppId,
        this.currentScreen,
        screenName,
        toolName,
        toolArgs,
        timestamp
      );

      // Store UI elements if present in interaction
      if (interaction?.uiState?.selectedElements) {
        await this.storeUIElements(
          edge.id,
          interaction.uiState.selectedElements,
          timestamp
        );
      }

      // Store modal stacks for from/to
      const fromNode = await this.repository.getNode(this.currentAppId, this.currentScreen);
      if (fromNode) {
        const fromModals = await this.repository.getNodeModals(fromNode.id);
        if (fromModals.length > 0) {
          await this.repository.setEdgeModals(edge.id, "from", fromModals);
        }
      }

      if (currentModalStack && currentModalStack.length > 0) {
        const toModalIds = currentModalStack.map(
          m => m.identifier || `${m.type}-${m.layer}`
        );
        await this.repository.setEdgeModals(edge.id, "to", toModalIds);
      }

      // Store scroll position if present
      if (interaction?.uiState?.scrollPosition) {
        await this.storeScrollPosition(
          edge.id,
          interaction.uiState.scrollPosition,
          timestamp
        );
      }
    }

    this.currentScreen = screenName;
    await this.repository.touchApp(this.currentAppId);
    this.notifyGraphUpdated();
  }

  /**
   * Record a navigation event detected from view hierarchy changes.
   * This is an alternative to SDK navigation events for apps without SDK integration.
   * Uses the fingerprint hash as the screen name.
   */
  public async recordHierarchyNavigation(event: HierarchyNavigationEvent): Promise<void> {
    // Auto-set current app from package name if provided
    if (event.packageName && event.packageName !== this.currentAppId) {
      await this.setCurrentApp(event.packageName);
    }

    if (!this.currentAppId) {
      logger.warn(`[NAVIGATION_GRAPH] Cannot record hierarchy navigation - no current app set`);
      return;
    }

    // Use a shortened fingerprint hash as the screen name for readability
    const screenName = `screen_${event.toFingerprint.substring(0, 12)}`;
    const timestamp = event.timestamp;

    // Get or create node and update visit count
    await this.repository.getOrCreateNode(
      this.currentAppId,
      screenName,
      timestamp
    );

    // Get modal stack from the most recent tool call (if any)
    const recentToolCall = this.findCorrelatedToolCall(timestamp);
    const currentModalStack = recentToolCall?.uiState?.modalStack;

    // Create edge from previous screen to current screen
    const fromScreenName = event.fromFingerprint
      ? `screen_${event.fromFingerprint.substring(0, 12)}`
      : null;

    if (fromScreenName && fromScreenName !== screenName) {
      const interaction = this.findCorrelatedToolCall(timestamp);

      const toolName = interaction?.toolName || null;
      const toolArgs = interaction?.args || null;

      const edge = await this.repository.createEdge(
        this.currentAppId,
        fromScreenName,
        screenName,
        toolName,
        toolArgs,
        timestamp
      );

      // Store UI elements if present in interaction
      if (interaction?.uiState?.selectedElements) {
        await this.storeUIElements(
          edge.id,
          interaction.uiState.selectedElements,
          timestamp
        );
      }

      // Store modal stacks for from/to
      const fromNode = await this.repository.getNode(this.currentAppId, fromScreenName);
      if (fromNode) {
        const fromModals = await this.repository.getNodeModals(fromNode.id);
        if (fromModals.length > 0) {
          await this.repository.setEdgeModals(edge.id, "from", fromModals);
        }
      }

      if (currentModalStack && currentModalStack.length > 0) {
        const toModalIds = currentModalStack.map(
          m => m.identifier || `${m.type}-${m.layer}`
        );
        await this.repository.setEdgeModals(edge.id, "to", toModalIds);
      }

      // Store scroll position if present
      if (interaction?.uiState?.scrollPosition) {
        await this.storeScrollPosition(
          edge.id,
          interaction.uiState.scrollPosition,
          timestamp
        );
      }

      logger.info(
        `[NAVIGATION_GRAPH] Hierarchy navigation: ${fromScreenName} -> ${screenName}` +
        (toolName ? ` (via ${toolName})` : " (no correlated tool call)")
      );
    } else if (!fromScreenName) {
      logger.info(`[NAVIGATION_GRAPH] Initial hierarchy screen: ${screenName}`);
    }

    this.currentScreen = screenName;
    await this.repository.touchApp(this.currentAppId);
  }

  /**
   * Store UI elements used in an edge transition.
   */
  private async storeUIElements(
    edgeId: number,
    selectedElements: SelectedElement[],
    timestamp: number
  ): Promise<void> {
    if (!this.currentAppId || selectedElements.length === 0) {
      return;
    }

    const elementIds: number[] = [];

    for (const selected of selectedElements) {
      const element = await this.repository.getOrCreateUIElement(
        this.currentAppId,
        {
          text: selected.text,
          resourceId: selected.resourceId,
          contentDescription: selected.contentDesc,
        },
        timestamp
      );
      elementIds.push(element.id);
    }

    await this.repository.linkUIElementsToEdge(edgeId, elementIds);
  }

  /**
   * Store scroll position for an edge.
   */
  private async storeScrollPosition(
    edgeId: number,
    scrollPosition: ScrollPosition,
    timestamp: number
  ): Promise<void> {
    if (!this.currentAppId) {
      return;
    }

    // Store the target element
    const targetElement = await this.repository.getOrCreateUIElement(
      this.currentAppId,
      {
        text: scrollPosition.targetElement.text,
        resourceId: scrollPosition.targetElement.resourceId,
        contentDescription: scrollPosition.targetElement.contentDesc,
      },
      timestamp
    );

    // Store the container element if present
    let containerElementId: number | undefined;
    if (scrollPosition.container) {
      const containerElement = await this.repository.getOrCreateUIElement(
        this.currentAppId,
        {
          text: scrollPosition.container.text,
          resourceId: scrollPosition.container.resourceId,
          contentDescription: scrollPosition.container.contentDesc,
        },
        timestamp
      );
      containerElementId = containerElement.id;
    }

    await this.repository.setScrollPosition(
      edgeId,
      targetElement.id,
      scrollPosition.direction,
      containerElementId,
      scrollPosition.speed
    );
  }

  /**
   * Record a tool call for correlation with future navigation events.
   */
  public recordToolCall(toolName: string, args: Record<string, any>, uiState?: UIState): void {
    const timestamp = Date.now();

    this.toolCallHistory.push({
      toolName,
      args,
      timestamp,
      uiState,
    });

    const uiStateInfo = uiState?.selectedElements.length
      ? ` (UI: ${uiState.selectedElements.map(e => e.text || e.resourceId).join(", ")})`
      : "";
    const modalInfo = uiState?.modalStack?.length
      ? ` [${uiState.modalStack.length} modal(s)]`
      : "";
    logger.debug(`[NAVIGATION_GRAPH] Tool call recorded: ${toolName} at ${timestamp}${uiStateInfo}${modalInfo}`);

    // Clean up old tool calls
    this.cleanupToolCallHistory();
  }

  /**
   * Update the most recent swipeOn tool call with scroll position information.
   * This is called after a swipeOn with lookFor completes successfully.
   */
  public updateScrollPosition(scrollPosition: ScrollPosition): void {
    if (this.toolCallHistory.length === 0) {
      logger.debug(`[NAVIGATION_GRAPH] Cannot update scroll position: no tool calls`);
      return;
    }

    // Find the most recent swipeOn tool call
    const recentSwipeOn = [...this.toolCallHistory]
      .reverse()
      .find(tc => tc.toolName === "swipeOn");

    if (!recentSwipeOn) {
      logger.debug(`[NAVIGATION_GRAPH] No recent swipeOn tool call to update`);
      return;
    }

    // Update the UI state with scroll position
    if (!recentSwipeOn.uiState) {
      recentSwipeOn.uiState = {
        selectedElements: [],
        scrollPosition,
      };
    } else {
      recentSwipeOn.uiState.scrollPosition = scrollPosition;
    }

    logger.debug(
      `[NAVIGATION_GRAPH] Updated scroll position for swipeOn: ` +
        `target=${scrollPosition.targetElement.text || scrollPosition.targetElement.resourceId}, ` +
        `direction=${scrollPosition.direction}`
    );
  }

  /**
   * Remove tool calls older than TTL.
   */
  private cleanupToolCallHistory(): void {
    const cutoff = Date.now() - this.TOOL_CALL_HISTORY_TTL_MS;
    const before = this.toolCallHistory.length;
    this.toolCallHistory = this.toolCallHistory.filter(tc => tc.timestamp >= cutoff);
    const removed = before - this.toolCallHistory.length;
    if (removed > 0) {
      logger.debug(`[NAVIGATION_GRAPH] Cleaned up ${removed} old tool calls`);
    }
  }

  /**
   * Find a tool call that likely caused a navigation event.
   * Looks for tool calls within the correlation window BEFORE the navigation event.
   */
  private findCorrelatedToolCall(navigationTimestamp: number): ToolCallInteraction | undefined {
    // Look for tool calls within correlation window BEFORE navigation event
    const candidates = this.toolCallHistory.filter(tc => {
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
   * Get the current screen name (runtime state).
   */
  public getCurrentScreen(): string | null {
    return this.currentScreen;
  }

  /**
   * Find the shortest path from current screen to target screen using BFS.
   */
  public async findPath(targetScreen: string): Promise<PathResult> {
    if (!this.currentAppId || !this.currentScreen) {
      return {
        found: false,
        path: [],
        startScreen: "",
        targetScreen,
      };
    }

    const startScreen = this.currentScreen;

    if (startScreen === targetScreen) {
      return {
        found: true,
        path: [],
        startScreen,
        targetScreen,
      };
    }

    // Get all edges for BFS
    const dbEdges = await this.repository.getEdges(this.currentAppId);
    const edges = await this.convertDBEdgesToNavigationEdges(dbEdges);

    // BFS to find shortest path
    const queue: Array<{ screen: string; path: NavigationEdge[] }> = [
      { screen: startScreen, path: [] },
    ];
    const visited = new Set<string>([startScreen]);

    while (queue.length > 0) {
      const { screen, path } = queue.shift()!;

      // Find all edges from current screen
      const outgoingEdges = edges.filter(e => e.from === screen);

      for (const edge of outgoingEdges) {
        if (edge.to === targetScreen) {
          // Found the target
          return {
            found: true,
            path: [...path, edge],
            startScreen,
            targetScreen,
          };
        }

        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push({
            screen: edge.to,
            path: [...path, edge],
          });
        }
      }
    }

    // No path found
    return {
      found: false,
      path: [],
      startScreen,
      targetScreen,
    };
  }

  /**
   * Convert database edges to NavigationEdge format.
   */
  private async convertDBEdgesToNavigationEdges(
    dbEdges: DBNavigationEdge[]
  ): Promise<NavigationEdge[]> {
    const edges: NavigationEdge[] = [];

    for (const dbEdge of dbEdges) {
      const edge: NavigationEdge = {
        from: dbEdge.from_screen,
        to: dbEdge.to_screen,
        timestamp: dbEdge.timestamp,
        edgeType: dbEdge.tool_name ? "tool" : "unknown",
      };

      if (dbEdge.tool_name) {
        edge.interaction = {
          toolName: dbEdge.tool_name,
          args: dbEdge.tool_args ? JSON.parse(dbEdge.tool_args) : {},
          timestamp: dbEdge.timestamp,
        };

        // Load UI elements
        const uiElements = await this.repository.getUIElementsForEdge(dbEdge.id);
        if (uiElements.length > 0) {
          edge.interaction.uiState = {
            selectedElements: uiElements.map(el => ({
              text: el.text || undefined,
              resourceId: el.resource_id || undefined,
              contentDesc: el.content_description || undefined,
            })),
          };
        }

        // Load scroll position
        const scrollPos = await this.repository.getScrollPosition(dbEdge.id);
        if (scrollPos) {
          // Initialize uiState if not already present
          if (!edge.interaction.uiState) {
            edge.interaction.uiState = {
              selectedElements: [],
            };
          }
          edge.interaction.uiState.scrollPosition = {
            targetElement: {
              text: scrollPos.targetElement.text || undefined,
              resourceId: scrollPos.targetElement.resource_id || undefined,
              contentDesc: scrollPos.targetElement.content_description || undefined,
            },
            direction: scrollPos.direction as "up" | "down" | "left" | "right",
            speed: scrollPos.speed as "slow" | "normal" | "fast" | undefined,
          };

          // Add container if present
          if (scrollPos.containerElement) {
            edge.interaction.uiState.scrollPosition.container = {
              text: scrollPos.containerElement.text || undefined,
              resourceId: scrollPos.containerElement.resource_id || undefined,
              contentDesc: scrollPos.containerElement.content_description || undefined,
            };
          }
        }

        // Copy interaction.uiState to edge.uiState for backward compatibility
        if (edge.interaction.uiState) {
          edge.uiState = edge.interaction.uiState;
        }
      }

      // Load modal stacks
      const fromModals = await this.repository.getEdgeModals(dbEdge.id, "from");
      const toModals = await this.repository.getEdgeModals(dbEdge.id, "to");

      if (fromModals.length > 0) {
        edge.fromModalStack = fromModals.map((id, layer) => ({
          type: "overlay" as const,
          identifier: id,
          layer,
        }));
      }

      if (toModals.length > 0) {
        edge.toModalStack = toModals.map((id, layer) => ({
          type: "overlay" as const,
          identifier: id,
          layer,
        }));
      }

      edges.push(edge);
    }

    return edges;
  }

  /**
   * Get all known screen names.
   */
  public async getKnownScreens(): Promise<string[]> {
    if (!this.currentAppId) {
      return [];
    }

    const nodes = await this.repository.getNodes(this.currentAppId);
    return nodes.map(n => n.screen_name);
  }

  /**
   * Get a specific node by screen name.
   */
  public async getNode(screenName: string): Promise<NavigationNode | undefined> {
    if (!this.currentAppId) {
      return undefined;
    }

    const dbNode = await this.repository.getNode(this.currentAppId, screenName);
    if (!dbNode) {
      return undefined;
    }

    const modals = await this.repository.getNodeModals(dbNode.id);

    return {
      screenName: dbNode.screen_name,
      firstSeenAt: dbNode.first_seen_at,
      lastSeenAt: dbNode.last_seen_at,
      visitCount: dbNode.visit_count,
      backStackDepth: dbNode.back_stack_depth ?? undefined,
      taskId: dbNode.task_id ?? undefined,
      modalStack: modals.length > 0
        ? modals.map((id, layer) => ({
          type: "overlay" as const,
          identifier: id,
          layer,
        }))
        : undefined,
    };
  }

  /**
   * Get all edges from a specific screen.
   */
  public async getEdgesFrom(screenName: string): Promise<NavigationEdge[]> {
    if (!this.currentAppId) {
      return [];
    }

    const dbEdges = await this.repository.getEdgesFrom(this.currentAppId, screenName);
    return this.convertDBEdgesToNavigationEdges(dbEdges);
  }

  /**
   * Get all edges to a specific screen.
   */
  public async getEdgesTo(screenName: string): Promise<NavigationEdge[]> {
    if (!this.currentAppId) {
      return [];
    }

    const dbEdges = await this.repository.getEdgesTo(this.currentAppId, screenName);
    return this.convertDBEdgesToNavigationEdges(dbEdges);
  }

  /**
   * Get graph statistics for debugging.
   */
  public async getStats(): Promise<NavigationGraphStats> {
    if (!this.currentAppId) {
      return {
        nodeCount: 0,
        edgeCount: 0,
        currentScreen: null,
        knownEdgeCount: 0,
        unknownEdgeCount: 0,
        toolCallHistorySize: 0,
      };
    }

    const stats = await this.repository.getStats(this.currentAppId);

    return {
      nodeCount: stats.nodeCount,
      edgeCount: stats.edgeCount,
      currentScreen: this.currentScreen,
      knownEdgeCount: stats.toolEdgeCount,
      unknownEdgeCount: stats.unknownEdgeCount,
      toolCallHistorySize: this.toolCallHistory.length,
    };
  }

  /**
   * Clear the graph for the current app.
   */
  public async clearCurrentGraph(): Promise<void> {
    if (this.currentAppId) {
      await this.repository.clearAppGraph(this.currentAppId);
      this.currentScreen = null;
      logger.info(`[NAVIGATION_GRAPH] Cleared graph for app: ${this.currentAppId}`);
      this.notifyGraphUpdated();
    }
  }

  /**
   * Clear all graphs.
   * Note: This only clears the current app's data since we use app-specific storage.
   */
  public async clearAllGraphs(): Promise<void> {
    await this.clearCurrentGraph();
    this.currentAppId = null;
    this.currentScreen = null;
    this.toolCallHistory = [];
    logger.info(`[NAVIGATION_GRAPH] Cleared all navigation graphs`);
    this.notifyGraphUpdated();
  }

  /**
   * Export the current graph for debugging/visualization.
   */
  public async exportGraph(): Promise<ExportedGraph> {
    if (!this.currentAppId) {
      return {
        appId: null,
        nodes: [],
        edges: [],
        currentScreen: null,
      };
    }

    const dbNodes = await this.repository.getNodes(this.currentAppId);
    const dbEdges = await this.repository.getEdges(this.currentAppId);

    const nodes: NavigationNode[] = [];
    for (const dbNode of dbNodes) {
      const modals = await this.repository.getNodeModals(dbNode.id);
      nodes.push({
        screenName: dbNode.screen_name,
        firstSeenAt: dbNode.first_seen_at,
        lastSeenAt: dbNode.last_seen_at,
        visitCount: dbNode.visit_count,
        modalStack: modals.length > 0
          ? modals.map((id, layer) => ({
            type: "overlay" as const,
            identifier: id,
            layer,
          }))
          : undefined,
      });
    }

    const edges = await this.convertDBEdgesToNavigationEdges(dbEdges);

    return {
      appId: this.currentAppId,
      nodes,
      edges,
      currentScreen: this.currentScreen,
    };
  }

  /**
   * Export a high-level graph summary for MCP resources.
   */
  public async exportGraphSummary(): Promise<NavigationGraphSummary> {
    if (!this.currentAppId) {
      return {
        appId: null,
        nodes: [],
        edges: [],
        currentScreen: null,
      };
    }

    const dbNodes = await this.repository.getNodes(this.currentAppId);
    const dbEdges = await this.repository.getEdges(this.currentAppId);

    const nodes: NavigationGraphSummaryNode[] = dbNodes.map(node => ({
      id: node.id,
      screenName: node.screen_name,
      visitCount: node.visit_count,
    }));

    const edges: NavigationGraphSummaryEdge[] = dbEdges.map(edge => ({
      id: edge.id,
      from: edge.from_screen,
      to: edge.to_screen,
      toolName: edge.tool_name,
    }));

    return {
      appId: this.currentAppId,
      nodes,
      edges,
      currentScreen: this.currentScreen,
    };
  }

  /**
   * Register a listener for graph update notifications.
   */
  public setGraphUpdateListener(listener: (() => void) | null): void {
    this.graphUpdateListener = listener ?? undefined;
  }

  private notifyGraphUpdated(): void {
    if (this.graphUpdateListener) {
      this.graphUpdateListener();
    }
  }
}
