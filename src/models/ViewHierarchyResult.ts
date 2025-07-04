import { ElementBounds } from "./ElementBounds";

/**
 * Represents the ViewHierarchy dump result from a device.
 */
export interface ViewHierarchyResult {
  hierarchy: Hierarchy;
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
