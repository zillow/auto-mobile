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
  /** The application package ID (e.g., "com.example.app") */
  applicationId?: string;
}

/**
 * Represents a modal state (bottom sheet, dialog, popup, etc.) in the UI hierarchy.
 */
export interface ModalState {
  /** Type of modal (bottomsheet, dialog, popup, menu) */
  type: "bottomsheet" | "dialog" | "popup" | "menu" | "overlay";
  /** Unique identifier (resource-id preferred, falls back to text content) */
  identifier?: string;
  /** Stack depth (0 = base screen, higher = on top) */
  layer: number;
  /** Window ID from accessibility service */
  windowId?: number;
  /** Window type from accessibility service */
  windowType?: string;
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
 * Represents scroll position needed to make a navigation element visible.
 */
export interface ScrollPosition {
  /** The scrollable container that was scrolled */
  container?: {
    text?: string;
    resourceId?: string;
    contentDesc?: string;
  };
  /** The target element that was scrolled to */
  targetElement: {
    text?: string;
    resourceId?: string;
    contentDesc?: string;
  };
  /** Direction that was scrolled */
  direction: "up" | "down" | "left" | "right";
  /** Speed used for scrolling */
  speed?: "slow" | "normal" | "fast";
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
  /** Active modal stack (bottom sheets, dialogs, popups, etc.) */
  modalStack?: ModalState[];
  /** Scroll position required to make navigation elements visible */
  scrollPosition?: ScrollPosition;
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
  /** Modal stack state when this node was recorded */
  modalStack?: ModalState[];
  /** Back stack depth when this node was last observed (number of screens that can be popped) */
  backStackDepth?: number;
  /** Task ID when this node was last observed */
  taskId?: number;
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
  /** Modal stack at the source screen */
  fromModalStack?: ModalState[];
  /** Modal stack at the destination screen */
  toModalStack?: ModalState[];
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
 * Represents back stack information
 */
export interface BackStackInfo {
  depth: number;
  currentTaskId?: number;
}

/**
 * Interface for navigation graph management.
 * Allows for easy mocking in tests.
 */
export interface NavigationGraph {
  /** Set the current app being navigated */
  setCurrentApp(appId: string): Promise<void>;

  /** Get the current app ID */
  getCurrentAppId(): string | null;

  /** Record a navigation event from WebSocket */
  recordNavigationEvent(event: NavigationEvent): Promise<void>;

  /** Record back stack information for the current screen */
  recordBackStack(backStack: BackStackInfo): void;

  /** Record a tool call for correlation */
  recordToolCall(toolName: string, args: Record<string, any>, uiState?: UIState): void;

  /** Get the current screen name */
  getCurrentScreen(): string | null;

  /** Find the shortest path from current screen to target */
  findPath(targetScreen: string): Promise<PathResult>;

  /** Get all known screen names */
  getKnownScreens(): Promise<string[]>;

  /** Get a specific node by screen name */
  getNode(screenName: string): Promise<NavigationNode | undefined>;

  /** Get all edges from a specific screen */
  getEdgesFrom(screenName: string): Promise<NavigationEdge[]>;

  /** Get all edges to a specific screen */
  getEdgesTo(screenName: string): Promise<NavigationEdge[]>;

  /** Get graph statistics */
  getStats(): Promise<NavigationGraphStats>;

  /** Clear the graph for the current app */
  clearCurrentGraph(): Promise<void>;

  /** Clear all graphs */
  clearAllGraphs(): Promise<void>;

  /** Export the current graph for debugging */
  exportGraph(): Promise<ExportedGraph>;
}
