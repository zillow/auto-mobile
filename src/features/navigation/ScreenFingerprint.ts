import crypto from "crypto";

/**
 * Interface for accessibility service node format (subset of AccessibilityNode from AccessibilityServiceClient)
 */
interface AccessibilityNode {
  text?: string;
  "content-desc"?: string;
  "resource-id"?: string;
  "test-tag"?: string;
  className?: string;
  scrollable?: string;
  node?: AccessibilityNode | AccessibilityNode[];
}

/**
 * Interface for accessibility hierarchy format
 */
export interface AccessibilityHierarchy {
  updatedAt: number;
  packageName: string;
  hierarchy: AccessibilityNode;
}

/**
 * Result of computing a screen fingerprint
 */
export interface FingerprintResult {
  /** SHA-256 hash of sorted fingerprint elements */
  hash: string;
  /** Timestamp when the hierarchy was captured */
  timestamp: number;
  /** Package name of the app */
  packageName: string;
  /** Number of elements included in the fingerprint */
  elementCount: number;
}

/**
 * Options for fingerprint computation
 */
export interface FingerprintOptions {
  /** Filter duplicate elements from scrollable containers (default: true) */
  filterDuplicates?: boolean;
  /** Include resource-ids in fingerprint (default: true) */
  includeResourceIds?: boolean;
  /** Include text content in fingerprint (default: true) */
  includeText?: boolean;
  /** Include content descriptions in fingerprint (default: true) */
  includeContentDesc?: boolean;
  /** Include test tags in fingerprint (default: true) */
  includeTestTags?: boolean;
}

const DEFAULT_OPTIONS: Required<FingerprintOptions> = {
  filterDuplicates: true,
  includeResourceIds: true,
  includeText: true,
  includeContentDesc: true,
  includeTestTags: true,
};

/**
 * Class names that indicate scrollable list containers
 */
const SCROLLABLE_CLASS_NAMES = [
  "recyclerview",
  "listview",
  "scrollview",
  "lazycolumn",
  "lazyrow",
  "lazyverticalgrid",
  "lazyhorizontalgrid",
  "nestedscrollview",
  "horizontalscrollview",
];

/**
 * Computes a fingerprint hash from a view hierarchy to identify screens.
 *
 * The fingerprint is computed by:
 * 1. Traversing all nodes in the hierarchy
 * 2. Collecting text, resource-id, content-desc, and test-tag from each node
 * 3. Filtering duplicate elements from scrollable containers (list items)
 * 4. Sorting elements lexicographically for stable ordering
 * 5. Hashing with SHA-256
 */
export class ScreenFingerprint {
  /**
   * Compute a fingerprint from a view hierarchy.
   */
  static compute(
    hierarchy: AccessibilityHierarchy,
    options?: FingerprintOptions
  ): FingerprintResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const elements: string[] = [];
    const scrollableContainerChildren = new Map<string, Map<string, string[]>>();

    // Traverse hierarchy and collect elements
    this.traverseHierarchy(
      hierarchy.hierarchy,
      elements,
      scrollableContainerChildren,
      opts,
      null,
      false
    );

    // Filter duplicates from scrollable containers if enabled
    let filteredElements = elements;
    if (opts.filterDuplicates) {
      filteredElements = this.filterScrollableContainerDuplicates(
        elements,
        scrollableContainerChildren
      );
    }

    // Sort lexicographically for deterministic output
    filteredElements.sort();

    // Generate SHA-256 hash
    const hash = this.generateHash(filteredElements);

    return {
      hash,
      timestamp: hierarchy.updatedAt,
      packageName: hierarchy.packageName,
      elementCount: filteredElements.length,
    };
  }

  /**
   * Traverse the view hierarchy and collect fingerprint elements.
   *
   * @param node - Current node to process
   * @param elements - Array to collect fingerprint elements into
   * @param scrollableContainerChildren - Map tracking children of scrollable containers
   * @param opts - Fingerprint options
   * @param currentScrollableId - ID of the current scrollable container (if inside one)
   * @param insideScrollable - Whether we're inside a scrollable container
   */
  private static traverseHierarchy(
    node: AccessibilityNode,
    elements: string[],
    scrollableContainerChildren: Map<string, Map<string, string[]>>,
    opts: Required<FingerprintOptions>,
    currentScrollableId: string | null,
    insideScrollable: boolean
  ): void {
    // Check if this node is a scrollable container
    const isScrollable = this.isScrollableContainer(node);
    let scrollableId = currentScrollableId;
    let isInsideScrollable = insideScrollable;

    if (isScrollable && !insideScrollable) {
      // This is a new scrollable container - use resource-id or generate unique id
      scrollableId = node["resource-id"] || `scrollable_${elements.length}`;
      isInsideScrollable = true;

      // Initialize the map for this container
      if (!scrollableContainerChildren.has(scrollableId)) {
        scrollableContainerChildren.set(scrollableId, new Map());
      }
    }

    // Collect fingerprint elements from this node
    const nodeElements = this.collectNodeElements(node, opts);

    for (const element of nodeElements) {
      if (isInsideScrollable && scrollableId) {
        // Track this element as part of a scrollable container
        const containerMap = scrollableContainerChildren.get(scrollableId)!;

        // Group by element value (resource-id takes priority)
        const groupKey = this.getGroupKey(node, element);
        if (!containerMap.has(groupKey)) {
          containerMap.set(groupKey, []);
        }
        containerMap.get(groupKey)!.push(element);
      }

      elements.push(element);
    }

    // Recurse into children
    if (node.node) {
      const children = Array.isArray(node.node) ? node.node : [node.node];
      for (const child of children) {
        this.traverseHierarchy(
          child,
          elements,
          scrollableContainerChildren,
          opts,
          scrollableId,
          isInsideScrollable
        );
      }
    }
  }

  /**
   * Collect fingerprint elements from a single node.
   */
  private static collectNodeElements(
    node: AccessibilityNode,
    opts: Required<FingerprintOptions>
  ): string[] {
    const elements: string[] = [];

    if (opts.includeResourceIds && node["resource-id"]) {
      elements.push(`id:${node["resource-id"]}`);
    }

    if (opts.includeText && node.text) {
      elements.push(`text:${node.text}`);
    }

    if (opts.includeContentDesc && node["content-desc"]) {
      elements.push(`desc:${node["content-desc"]}`);
    }

    if (opts.includeTestTags && node["test-tag"]) {
      elements.push(`tag:${node["test-tag"]}`);
    }

    return elements;
  }

  /**
   * Get a grouping key for an element based on its resource-id or value.
   * Elements with the same resource-id are grouped together for duplicate filtering.
   */
  private static getGroupKey(node: AccessibilityNode, element: string): string {
    // If the node has a resource-id, group by that
    if (node["resource-id"]) {
      return `id:${node["resource-id"]}`;
    }
    // Otherwise, group by the element value itself
    return element;
  }

  /**
   * Check if a node is a scrollable container.
   */
  private static isScrollableContainer(node: AccessibilityNode): boolean {
    // Check scrollable attribute
    if (node.scrollable === "true") {
      return true;
    }

    // Check class name for known scrollable containers
    if (node.className) {
      const classNameLower = node.className.toLowerCase();
      for (const scrollableClass of SCROLLABLE_CLASS_NAMES) {
        if (classNameLower.includes(scrollableClass)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Filter duplicate elements from scrollable containers.
   * For each scrollable container, group elements by resource-id and keep only the first occurrence.
   */
  private static filterScrollableContainerDuplicates(
    elements: string[],
    scrollableContainerChildren: Map<string, Map<string, string[]>>
  ): string[] {
    // Collect all elements that should be removed (duplicates beyond the first)
    const duplicatesToRemove = new Set<string>();

    for (const containerMap of scrollableContainerChildren.values()) {
      for (const groupElements of containerMap.values()) {
        // Keep the first element, mark rest as duplicates
        for (let i = 1; i < groupElements.length; i++) {
          duplicatesToRemove.add(groupElements[i]);
        }
      }
    }

    // Track which duplicates we've already removed (for elements appearing multiple times)
    const removedCounts = new Map<string, number>();

    return elements.filter(element => {
      if (duplicatesToRemove.has(element)) {
        const removedCount = removedCounts.get(element) || 0;

        // Find how many times this element appears in duplicate lists
        let totalDuplicates = 0;
        for (const containerMap of scrollableContainerChildren.values()) {
          for (const groupElements of containerMap.values()) {
            // Count duplicates (skip first element in each group)
            for (let i = 1; i < groupElements.length; i++) {
              if (groupElements[i] === element) {
                totalDuplicates++;
              }
            }
          }
        }

        if (removedCount < totalDuplicates) {
          removedCounts.set(element, removedCount + 1);
          return false; // Remove this duplicate
        }
      }
      return true;
    });
  }

  /**
   * Generate SHA-256 hash from sorted element list.
   */
  private static generateHash(elements: string[]): string {
    const data = elements.join("\n");
    return crypto.createHash("sha256").update(data).digest("hex");
  }
}
