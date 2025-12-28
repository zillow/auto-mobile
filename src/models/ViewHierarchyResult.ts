import { ElementBounds } from "./ElementBounds";

/**
 * Represents the ViewHierarchy dump result from a device.
 */
export interface ViewHierarchyResult {
  hierarchy: Hierarchy;
  /** Timestamp from the device when the hierarchy was captured (milliseconds since epoch) */
  updatedAt?: number;
  /** Package name of the foreground app (from accessibility service) */
  packageName?: string;
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
}
