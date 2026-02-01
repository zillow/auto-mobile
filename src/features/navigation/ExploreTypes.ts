import type { ObserveResult } from "../../models";
import type { ExportedGraph } from "../../utils/interfaces/NavigationGraph";
import type { NavigationEdge } from "./NavigationGraphManager";

/**
 * Exploration strategies for explore
 */
export type ExplorationStrategy = "breadth-first" | "depth-first" | "weighted";

/**
 * Exploration modes for explore
 */
export type ExplorationMode = "discover" | "validate" | "hybrid";

/**
 * Options for Explore execution
 */
export interface ExploreOptions {
  /** Maximum number of interactions to perform */
  maxInteractions?: number;

  /** Maximum time in milliseconds */
  timeoutMs?: number;

  /** Strategy for selecting next interaction */
  strategy?: ExplorationStrategy;

  /** Whether to reset to home screen periodically */
  resetToHome?: boolean;

  /** How often to reset (every N interactions) */
  resetInterval?: number;

  /** Exploration mode */
  mode?: ExplorationMode;

  /** Package name to limit exploration to */
  packageName?: string;

  /** Dry run mode (no interactions performed) */
  dryRun?: boolean;
}

/**
 * Statistics about element selection during exploration
 */
export interface ElementSelectionStats {
  text?: string;
  resourceId?: string;
  className?: string;
  score: number;
  novelty: number;
  coverage: number;
  finalScore: number;
}

/**
 * Edge validation result for tracking success/failure of known transitions
 */
export interface EdgeValidationResult {
  edgeKey: string;
  fromScreen: string;
  expectedTo: string;
  actualTo: string | null;
  success: boolean;
  timestamp: number;
  error?: string;
  matchConfidence?: number;
}

/**
 * Result of Explore execution
 */
export interface ExploreResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
  interactionsPerformed: number;
  screensDiscovered: number;
  edgesAdded: number;
  navigationGraph: ExportedGraph;
  explorationPath: string[];
  coverage: {
    totalScreens: number;
    exploredScreens: number;
    percentage: number;
  };
  elementSelections?: ElementSelectionStats[];
  observation?: ObserveResult;
  durationMs: number;
  stopReason?: string;
  graphTraversal?: {
    nodesVisited: number;
    totalNodes: number;
    edgesTraversed: number;
    totalEdges: number;
    edgeValidationResults: EdgeValidationResult[];
    coveragePercentage: number;
  };
}

export interface PlannedInteraction {
  order: number;
  action: "tapOn" | "swipeOn";
  target: {
    type: "text" | "id" | "coordinates";
    value: string;
  };
  reason: string;
  predictedOutcome: {
    screen: string;
    confidence: number;
  };
  whitelistStatus: "allowed" | "blocked" | "unknown";
}

export interface ExploreDryRunResult {
  success: true;
  dryRun: true;
  currentScreen: {
    name: string;
    interactableElements: number;
  };
  plannedInteractions: PlannedInteraction[];
  estimatedCoverage: {
    screensToVisit: string[];
    newScreensExpected: number;
    existingScreensToRevisit: number;
  };
  warnings: string[];
  observation?: ObserveResult;
  durationMs: number;
}

export type ExploreExecutionResult = ExploreResult | ExploreDryRunResult;

/**
 * Tracked element interaction state
 */
export interface TrackedElement {
  text?: string;
  resourceId?: string;
  contentDesc?: string;
  className?: string;
  interactionCount: number;
  lastInteractionScreen: string;
}

/**
 * Graph traversal state for validate mode
 */
export interface GraphTraversalState {
  visitedNodes: Set<string>;
  traversedEdges: Set<string>;
  pendingEdges: NavigationEdge[];
  edgeValidationResults: Map<string, EdgeValidationResult>;
  totalNodesInGraph: number;
  totalEdgesInGraph: number;
}
