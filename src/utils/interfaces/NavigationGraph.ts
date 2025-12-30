/**
 * Represents a navigation event received from the Android SDK.
 */
export interface NavigationEvent {
  destination: string;
  source: string;
  arguments: Record<string, string>;
  metadata: Record<string, string>;
  timestamp: number; // milliseconds
  sequenceNumber: number;
}

/**
 * Represents a selected UI element (tab, menu item, etc.) captured at the time of a tool call.
 */
export interface SelectedElement {
  text?: string;
  resourceId?: string;
  contentDesc?: string;
}

/**
 * Represents the UI state at the time of a tool call.
 * Captures context needed to replay navigation (e.g., which tab is active).
 */
export interface UIState {
  /** Currently selected elements (tabs, menu items, etc.) */
  selectedElements: SelectedElement[];
  /** The destination/screen name if available from view hierarchy */
  destinationId?: string;
}

/**
 * Represents a recorded tool call for correlation with navigation events.
 */
export interface ToolCallInteraction {
  toolName: string;
  args: Record<string, any>;
  timestamp: number; // milliseconds
  /** UI state at the time of the tool call */
  uiState?: UIState;
}

/**
 * Represents a screen/destination in the navigation graph.
 */
export interface NavigationNode {
  screenName: string;
  firstSeenAt: number; // milliseconds
  lastSeenAt: number; // milliseconds
  visitCount: number;
}

/**
 * Represents a transition between screens in the navigation graph.
 */
export interface NavigationEdge {
  from: string;
  to: string;
  interaction?: ToolCallInteraction;
  timestamp: number; // milliseconds
  edgeType: "tool" | "back" | "unknown";
  /** UI state required before executing the interaction (e.g., which tab must be active) */
  uiState?: UIState;
}

/**
 * Statistics about the navigation graph.
 */
export interface NavigationGraphStats {
  nodeCount: number;
  edgeCount: number;
  currentScreen: string | null;
  knownEdgeCount: number;
  unknownEdgeCount: number;
  toolCallHistorySize: number;
}

/**
 * Result of a path search in the navigation graph.
 */
export interface PathResult {
  found: boolean;
  path: NavigationEdge[];
  startScreen: string;
  targetScreen: string;
}

/**
 * Exported graph data for debugging/visualization.
 */
export interface ExportedGraph {
  appId: string | null;
  nodes: NavigationNode[];
  edges: NavigationEdge[];
  currentScreen: string | null;
}

/**
 * Interface for navigation graph management.
 * Allows for easy mocking in tests.
 */
export interface NavigationGraph {
  /** Set the current app being navigated */
  setCurrentApp(appId: string): void;

  /** Get the current app ID */
  getCurrentAppId(): string | null;

  /** Record a navigation event from WebSocket */
  recordNavigationEvent(event: NavigationEvent): void;

  /** Record a tool call for correlation */
  recordToolCall(toolName: string, args: Record<string, any>, uiState?: UIState): void;

  /** Get the current screen name */
  getCurrentScreen(): string | null;

  /** Find the shortest path from current screen to target */
  findPath(targetScreen: string): PathResult;

  /** Get all known screen names */
  getKnownScreens(): string[];

  /** Get a specific node by screen name */
  getNode(screenName: string): NavigationNode | undefined;

  /** Get all edges from a specific screen */
  getEdgesFrom(screenName: string): NavigationEdge[];

  /** Get all edges to a specific screen */
  getEdgesTo(screenName: string): NavigationEdge[];

  /** Get graph statistics */
  getStats(): NavigationGraphStats;

  /** Clear the graph for the current app */
  clearCurrentGraph(): void;

  /** Clear all graphs */
  clearAllGraphs(): void;

  /** Export the current graph for debugging */
  exportGraph(): ExportedGraph;
}
