import crypto from "crypto";
import { logger } from "../../utils/logger";

/**
 * Interface for accessibility service node format (subset of AccessibilityNode from CtrlProxyClient)
 */
interface AccessibilityNode {
  text?: string;
  "content-desc"?: string;
  "resource-id"?: string;
  "test-tag"?: string;
  className?: string;
  scrollable?: string;
  selected?: string;
  editable?: string;
  "text-entry-mode"?: string;
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
 * Fingerprint confidence levels based on method used
 */
export enum FingerprintConfidence {
  /** Navigation resource-id present (SDK app) */
  VERY_HIGH = 95,
  /** Cached navigation ID with keyboard */
  HIGH = 85,
  /** Shallow scrollable with structural IDs */
  MEDIUM = 75,
  /** Keyboard detected, filtered hierarchy */
  LOW_MEDIUM = 60,
  /** Package + structure only */
  LOW = 50,
}

/**
 * Method used to compute fingerprint
 */
export enum FingerprintMethod {
  NAVIGATION_ID = "navigation-id",
  CACHED_NAVIGATION_ID = "cached-navigation-id",
  SHALLOW_SCROLLABLE = "shallow-scrollable",
  SHALLOW_SCROLLABLE_WITH_KEYBOARD = "shallow-scrollable-keyboard",
  PACKAGE_STRUCTURE = "package-structure",
}

/**
 * Result of computing a screen fingerprint
 */
export interface FingerprintResult {
  /** SHA-256 hash of the fingerprint */
  hash: string;
  /** Confidence level (0-100) */
  confidence: FingerprintConfidence;
  /** Method used to compute fingerprint */
  method: FingerprintMethod;
  /** Timestamp when the hierarchy was captured */
  timestamp: number;
  /** Package name of the app */
  packageName: string;
  /** Navigation ID if found (for caching) */
  navigationId?: string;
  /** Whether keyboard was detected */
  keyboardDetected: boolean;
  /** Number of elements included */
  elementCount?: number;
}

/**
 * Options for fingerprint computation
 */
export interface FingerprintOptions {
  /** Cached navigation ID from previous observation (for keyboard occlusion) */
  cachedNavigationId?: string;
  /** Timestamp of cached navigation ID */
  cachedNavigationIdTimestamp?: number;
  /** Cache TTL in milliseconds (default: 10000) */
  cacheTTL?: number;
}

const DEFAULT_CACHE_TTL = 10000; // 10 seconds

/** Dynamic text patterns to filter */
const TIME_PATTERN = /^\d{1,2}:\d{2}( (AM|PM))?$/;
const NUMBER_PATTERN = /^\d+$/;
const PERCENT_PATTERN = /^\d+%$/;

/**
 * Enhanced screen fingerprinting with research-backed strategies.
 *
 * Strategy (tiered fallback):
 * 1. Navigation ID (95% confidence) - SDK apps with navigation resource-ids
 * 2. Cached Navigation ID (85% confidence) - Use cached ID when keyboard detected
 * 3. Shallow Scrollable (75% confidence) - Filtered hierarchy with shallow scrollable markers
 * 4. Shallow Scrollable + Keyboard (60% confidence) - Filtered hierarchy with keyboard detected
 * 5. Package + Structure (50% confidence) - Last resort fallback
 *
 * Key features:
 * - Shallow scrollable markers: Keep container, drop children (handles scrolling)
 * - Selected state preservation: Keep selected items even in scrollable containers
 * - Keyboard detection: Filter keyboard elements
 * - Editable text filtering: Omit dynamic user input
 * - Dynamic content filtering: Remove time, numbers, system UI
 * - Stateful tracking: Cache navigation ID for keyboard occlusion
 */
export class ScreenFingerprint {
  /**
   * Compute a fingerprint from a view hierarchy.
   */
  static compute(
    hierarchy: AccessibilityHierarchy,
    options?: FingerprintOptions
  ): FingerprintResult {
    const keyboardDetected = this.detectKeyboard(hierarchy);
    const navigationId = this.extractNavigationId(hierarchy.hierarchy);

    // TIER 1: Navigation ID (highest confidence)
    if (navigationId) {
      const hash = this.hashString(`nav:${navigationId}`);
      logger.debug(`[FINGERPRINT] Using navigation ID: ${navigationId}`);

      return {
        hash,
        confidence: FingerprintConfidence.VERY_HIGH,
        method: FingerprintMethod.NAVIGATION_ID,
        timestamp: hierarchy.updatedAt,
        packageName: hierarchy.packageName,
        navigationId,
        keyboardDetected,
      };
    }

    // TIER 2: Cached Navigation ID (keyboard occlusion handling)
    if (
      keyboardDetected &&
      options?.cachedNavigationId &&
      options?.cachedNavigationIdTimestamp
    ) {
      const cacheTTL = options.cacheTTL || DEFAULT_CACHE_TTL;
      const cacheAge = hierarchy.updatedAt - options.cachedNavigationIdTimestamp;

      if (cacheAge < cacheTTL) {
        const hash = this.hashString(`nav:${options.cachedNavigationId}`);
        logger.debug(
          `[FINGERPRINT] Using cached navigation ID (keyboard detected): ${options.cachedNavigationId}`
        );

        return {
          hash,
          confidence: FingerprintConfidence.HIGH,
          method: FingerprintMethod.CACHED_NAVIGATION_ID,
          timestamp: hierarchy.updatedAt,
          packageName: hierarchy.packageName,
          navigationId: options.cachedNavigationId,
          keyboardDetected: true,
        };
      }
    }

    // TIER 3/4: Shallow Scrollable Strategy
    const filtered = this.filterHierarchyEnhanced(hierarchy.hierarchy);
    const hash = this.hashObject(filtered);
    const elementCount = this.countElements(filtered);

    const confidence = keyboardDetected
      ? FingerprintConfidence.LOW_MEDIUM
      : FingerprintConfidence.MEDIUM;

    const method = keyboardDetected
      ? FingerprintMethod.SHALLOW_SCROLLABLE_WITH_KEYBOARD
      : FingerprintMethod.SHALLOW_SCROLLABLE;

    logger.debug(
      `[FINGERPRINT] Using ${method}: ${elementCount} elements, keyboard=${keyboardDetected}`
    );

    return {
      hash,
      confidence,
      method,
      timestamp: hierarchy.updatedAt,
      packageName: hierarchy.packageName,
      keyboardDetected,
      elementCount,
    };
  }

  /**
   * Extract navigation resource-id from hierarchy (navigation.* pattern).
   */
  private static extractNavigationId(node: any): string | null {
    if (!node || typeof node !== "object") {return null;}

    if (node["resource-id"]?.startsWith("navigation.")) {
      return node["resource-id"];
    }

    // Recurse into children
    if (node.node) {
      const children = Array.isArray(node.node) ? node.node : [node.node];
      for (const child of children) {
        const result = this.extractNavigationId(child);
        if (result) {return result;}
      }
    }

    return null;
  }

  /**
   * Detect keyboard presence from hierarchy.
   * Indicators: content-desc with "Delete", "Enter", "keyboard", "emoji"
   */
  private static detectKeyboard(hierarchy: AccessibilityHierarchy): boolean {
    function hasKeyboardElements(node: any): boolean {
      if (!node || typeof node !== "object") {return false;}

      // Check resource-id patterns
      if (node["resource-id"]) {
        const id = node["resource-id"];
        if (id.includes("keyboard") || id.includes("inputmethod")) {
          return true;
        }
      }

      // Check content-desc for keyboard indicators
      if (node["content-desc"]) {
        const desc = node["content-desc"];
        if (
          desc.includes("Delete") ||
          desc.includes("Enter") ||
          desc.includes("keyboard") ||
          desc.includes("emoji") ||
          desc.includes("Shift")
        ) {
          return true;
        }
      }

      // Recurse
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        for (const child of children) {
          if (hasKeyboardElements(child)) {return true;}
        }
      }

      return false;
    }

    return hasKeyboardElements(hierarchy.hierarchy);
  }

  /**
   * Check if node is an editable text field.
   */
  private static isEditableField(node: AccessibilityNode): boolean {
    // EditText class
    if (node.className?.includes("EditText")) {return true;}

    // Text entry mode
    if (node["text-entry-mode"] === "true") {return true;}

    // Editable attribute
    if (node.editable === "true") {return true;}

    // Input-related resource-ids
    if (node["resource-id"]) {
      const id = node["resource-id"];
      if (
        id.includes("edit") ||
        id.includes("input") ||
        id.includes("text_field") ||
        id.includes("search")
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if text is dynamic (time, number, percentage).
   */
  private static isDynamicText(text: string): boolean {
    return (
      TIME_PATTERN.test(text) ||
      NUMBER_PATTERN.test(text) ||
      PERCENT_PATTERN.test(text)
    );
  }

  /**
   * Check if content-desc is system indicator.
   */
  private static isSystemIndicator(desc: string): boolean {
    return (
      desc.includes("Battery") ||
      desc.includes("signal") ||
      desc.includes("bars") ||
      desc.includes("percent") ||
      desc.includes("Wifi")
    );
  }

  /**
   * Enhanced hierarchy filtering with shallow scrollable markers.
   *
   * Strategy:
   * - Keep scrollable container metadata (resource-id, className)
   * - Preserve selected items even in scrollable containers
   * - Drop all other scrollable children
   * - Filter keyboard elements
   * - Filter editable text content
   * - Filter dynamic content (time, numbers, system UI)
   * - Keep static text for differentiation
   * - Preserve selected state
   */
  private static filterHierarchyEnhanced(node: any): any {
    if (!node || typeof node !== "object") {return null;}

    // Skip keyboard elements (match detectKeyboard indicators)
    if (
      node["content-desc"]?.includes("Delete") ||
      node["content-desc"]?.includes("Enter") ||
      node["content-desc"]?.includes("keyboard") ||
      node["content-desc"]?.includes("emoji") ||
      node["content-desc"]?.includes("Shift") ||
      node["resource-id"]?.includes("keyboard") ||
      node["resource-id"]?.includes("inputmethod")
    ) {
      return null;
    }

    const filtered: any = {};

    // Handle scrollable containers with enhanced strategy
    if (node.scrollable === "true") {
      filtered._scrollable = true;

      // Keep container identifiers (not navigation IDs)
      if (
        node["resource-id"] &&
        !node["resource-id"].startsWith("navigation.")
      ) {
        filtered["resource-id"] = node["resource-id"];
      }

      if (node.className) {
        filtered.className = node.className;
      }

      // CRITICAL: Preserve selected items in scrollable containers
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        const selectedItems = children
          .filter((child: any) => child.selected === "true")
          .map((child: any) => this.extractSelectedInfo(child))
          .filter(Boolean);

        if (selectedItems.length > 0) {
          filtered._selected = selectedItems;
        }
      }

      return filtered;
    }

    // Keep app resource-ids (not system UI, not navigation)
    if (node["resource-id"]) {
      const id = node["resource-id"];
      if (
        !id.startsWith("com.android.systemui") &&
        !id.startsWith("android:id/") &&
        !id.startsWith("navigation.")
      ) {
        filtered["resource-id"] = id;
      }
    }

    // Always keep className for structure
    if (node.className) {
      filtered.className = node.className;
    }

    // Preserve selected state (critical for tab differentiation)
    if (node.selected === "true") {
      filtered.selected = "true";
    }

    // Keep static text (not editable, not dynamic)
    if (node.text && !this.isEditableField(node)) {
      const text = node.text;
      if (!this.isDynamicText(text)) {
        filtered.text = text;
      }
    }

    // Keep useful content-desc (not system indicators, not keyboard)
    if (node["content-desc"]) {
      const desc = node["content-desc"];
      if (
        !this.isSystemIndicator(desc) &&
        !desc.includes("keyboard") &&
        !desc.includes("Delete") &&
        !desc.includes("Enter") &&
        !desc.includes("emoji") &&
        !desc.includes("Shift")
      ) {
        filtered["content-desc"] = desc;
      }
    }

    // Keep test tags
    if (node["test-tag"]) {
      filtered["test-tag"] = node["test-tag"];
    }

    // Recurse into children
    if (node.node) {
      const children = Array.isArray(node.node) ? node.node : [node.node];
      const filteredChildren = children
        .map((child: any) => this.filterHierarchyEnhanced(child))
        .filter(Boolean);

      if (filteredChildren.length > 0) {
        filtered.node = filteredChildren;
      }
    }

    return Object.keys(filtered).length > 0 ? filtered : null;
  }

  /**
   * Extract selected item information (text, content-desc, or resource-id).
   */
  private static extractSelectedInfo(node: any): any {
    if (!node || typeof node !== "object") {return null;}

    const info: any = { selected: "true" };

    // Get text from node or its children
    if (node.text) {
      info.text = node.text;
    } else if (node.node) {
      const text = this.findTextInChildren(node.node);
      if (text) {info.text = text;}
    }

    // Fallback to content-desc for icon-only tabs/controls
    if (!info.text && node["content-desc"]) {
      info["content-desc"] = node["content-desc"];
    }

    // Include resource-id for additional context
    if (node["resource-id"] && !node["resource-id"].startsWith("navigation.")) {
      info["resource-id"] = node["resource-id"];
    }

    return info;
  }

  /**
   * Find text in node children.
   */
  private static findTextInChildren(node: any): string | null {
    if (!node || typeof node !== "object") {return null;}

    if (node.text) {return node.text;}

    if (node.node) {
      const children = Array.isArray(node.node) ? node.node : [node.node];
      for (const child of children) {
        const text = this.findTextInChildren(child);
        if (text) {return text;}
      }
    }

    return null;
  }

  /**
   * Count elements in filtered hierarchy.
   */
  private static countElements(node: any): number {
    if (!node || typeof node !== "object") {return 0;}

    let count = 1; // Count this node

    if (node.node) {
      const children = Array.isArray(node.node) ? node.node : [node.node];
      for (const child of children) {
        count += this.countElements(child);
      }
    }

    return count;
  }

  /**
   * Generate SHA-256 hash from string.
   */
  private static hashString(data: string): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * Generate SHA-256 hash from object.
   */
  private static hashObject(obj: any): string {
    const data = JSON.stringify(obj);
    return crypto.createHash("sha256").update(data).digest("hex");
  }
}
