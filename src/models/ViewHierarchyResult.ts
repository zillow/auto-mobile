import { ElementBounds } from "./ElementBounds";
import { RecompositionMetrics, RecompositionNodeInfo } from "./Recomposition";

/**
 * Represents the ViewHierarchy dump result from a device.
 */
export interface ViewHierarchyResult {
  hierarchy: Hierarchy;
  /** Timestamp from the device when the hierarchy was captured (milliseconds since epoch) */
  updatedAt?: number;
  /** Package name of the foreground app (from accessibility service) */
  packageName?: string;
  /** Whether an intent chooser dialog was detected (from accessibility service) */
  intentChooserDetected?: boolean;
  /** All visible windows (including popups, toolbars, etc.) */
  windows?: WindowHierarchy[];
}

/**
 * Represents a single window's hierarchy with metadata.
 * Used to capture floating windows like text selection toolbars, popups, etc.
 */
export interface WindowHierarchy {
  windowId: number;
  windowType: string;
  windowLayer: number;
  packageName?: string;
  isActive: boolean;
  isFocused: boolean;
  hierarchy?: ViewHierarchyNode;
}

export interface Hierarchy {
  error?: string;
  node?: ViewHierarchyNode;
}

// Define types for the view hierarchy structure
export interface NodeAttributes {
  [key: string]: string;
}

export interface ViewHierarchyNode {
  $: NodeAttributes;
  node?: ViewHierarchyNode[];
  bounds?: ElementBounds;
  recomposition?: RecompositionNodeInfo;
  recompositionMetrics?: RecompositionMetrics;
  occlusionState?: string;
  occludedBy?: string;
  "test-tag"?: string;
  extras?: Record<string, string>;
}
