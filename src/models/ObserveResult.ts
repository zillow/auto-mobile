import { Element } from "./Element";
import { ScreenSize } from "./ScreenSize";
import { SystemInsets } from "./SystemInsets";
import { ActiveWindowInfo } from "./ActiveWindowInfo";
import { ViewHierarchyResult } from "./ViewHierarchyResult";

/**
 * Represents the result of observing the device state
 */
export interface ObserveResult {
  /**
   * Timestamp when observation was made
   * Can be a number (milliseconds) or ISO string depending on context
   */
  timestamp: string | number;

  /** Screen dimensions */
  screenSize: ScreenSize;

  /** System UI insets */
  systemInsets: SystemInsets;

  /** Screen rotation (0: portrait, 1: landscape 90°, 2: reverse portrait 180°, 3: reverse landscape 270°) */
  rotation?: number;

  /** View hierarchy data */
  viewHierarchy?: ViewHierarchyResult;

  /** Active window information */
  activeWindow?: ActiveWindowInfo;

  /**
   * Categorized elements from the view hierarchy
   */
  elements?: {
    clickable: Element[];
    scrollable: Element[];
    text: Element[];
  };

  /**
   * The single currently focused UI element from the view hierarchy
   * Contains the element that has focus state set to true
   */
  focusedElement?: Element;

  /** Whether a system intent chooser dialog was detected */
  intentChooserDetected?: boolean;

  /** Error message if observation failed partially or completely */
  error?: string;
}
