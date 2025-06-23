/**
 * Represents the ViewHierarchy dump result from a device.
 */
export interface ViewHierarchyResult {
  hierarchy: {
    error?: string;
    node?: Node;
  };
}

// Define types for the view hierarchy structure
export interface NodeAttributes {
  [key: string]: string;
}

export interface Node {
  $: NodeAttributes;
  node?: Node[];
}
