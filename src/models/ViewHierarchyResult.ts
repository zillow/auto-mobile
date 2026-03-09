import { ElementBounds } from "./ElementBounds";
import { RecompositionMetrics, RecompositionNodeInfo } from "./Recomposition";

/**
 * Hierarchy data sources that contributed to the result
 */
export type HierarchySource = "control-proxy" | "uiautomator";

/**
 * Represents the ViewHierarchy dump result from a device.
 */
export interface ViewHierarchyResult {
  hierarchy: Hierarchy;
  /** Timestamp from the device when the hierarchy was captured (milliseconds since epoch) */
  updatedAt?: number;
  /** Package name of the foreground app (from accessibility service) */
  packageName?: string;
  /** Optional window metadata from the accessibility service */
  windows?: ViewHierarchyWindowInfo[];
  /** Whether an intent chooser dialog was detected (from accessibility service) */
  intentChooserDetected?: boolean;
  /** Whether a notification permission dialog was detected (from accessibility service) */
  notificationPermissionDetected?: boolean;
  /** Element with TalkBack/accessibility cursor (Android only) */
  "accessibility-focused-element"?: ViewHierarchyNode;
  /**
   * True when CtrlProxy couldn't fully extract the hierarchy.
   * This indicates that uiautomator fallback may have been used.
   */
  ctrlProxyIncomplete?: boolean;
  /**
   * Sources that contributed to this hierarchy result.
   * When both sources are present, the hierarchy was merged from accessibility service + uiautomator.
   */
  sources?: HierarchySource[];
  /** Screen width from accessibility service (eliminates need for dumpsys) */
  screenWidth?: number;
  /** Screen height from accessibility service (eliminates need for dumpsys) */
  screenHeight?: number;
  /** iOS screen scale factor (e.g., 2.0 for @2x, 3.0 for @3x retina). Converts points to pixels. */
  screenScale?: number;
  /** Display rotation: 0=portrait, 1=landscape90, 2=reverse, 3=landscape270 */
  rotation?: number;
  /** System insets (status bar, nav bar, gesture insets) */
  systemInsets?: { top: number; bottom: number; left: number; right: number };
  /** Device wakefulness: "Awake", "Asleep", or "Dozing" (Android only, from accessibility service) */
  wakefulness?: "Awake" | "Asleep" | "Dozing";
  /** Foreground activity component name, e.g. "com.example.app/.MainActivity" (Android only) */
  foregroundActivity?: string;
  /** Display density in DPI (Android only, from accessibility service) */
  density?: number;
  /** Android API level (Android only, from accessibility service) */
  sdkInt?: number;
  /** Device model (Android only, from accessibility service) */
  deviceModel?: string;
  /** Whether running on an emulator (Android only, from accessibility service) */
  isEmulator?: boolean;
}

export interface Hierarchy {
  error?: string;
  node?: ViewHierarchyNode;
}

export interface ViewHierarchyWindowInfo {
  id?: number;
  type?: number;
  isActive?: boolean;
  isFocused?: boolean;
  bounds?: ElementBounds;
  windowLayer?: number;
  packageName?: string;
  hierarchy?: ViewHierarchyNode;
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
