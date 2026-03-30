/**
 * Type definitions for interaction tools.
 * Extracted from interactionTools.ts for maintainability.
 */
import type { Platform, ElementSelectionStrategy } from "../models";

// ============================================================================
// Tool Argument Types
// ============================================================================

export interface ClearTextArgs {
  platform: Platform;
}

export interface SelectAllTextArgs {
  platform: Platform;
}

export interface PressButtonArgs {
  button: "home" | "back" | "menu" | "power" | "volume_up" | "volume_down" | "recent";
  platform: Platform;
}

export interface SystemTrayNotificationArgs {
  title?: string;
  body?: string;
  appId?: string;
  tapActionLabel?: string;
}

export interface SystemTrayArgs {
  action: "open" | "find" | "tap" | "dismiss" | "clearAll";
  notification?: SystemTrayNotificationArgs;
  awaitTimeout?: number;
  platform: Platform;
}

export interface PressKeyArgs {
  key: "home" | "back" | "menu" | "power" | "volume_up" | "volume_down" | "recent";
  platform: Platform;
}

export interface InputTextArgs {
  text: string;
  imeAction?: "done" | "next" | "search" | "send" | "go" | "previous";
  platform: Platform;
}

export interface OpenLinkArgs {
  url: string;
  platform: Platform;
}

export interface TapOnArgs {
  container?: {
    elementId?: string;
    text?: string;
  };
  elementId?: string;
  text?: string;
  selectionStrategy?: ElementSelectionStrategy;
  action: "tap" | "doubleTap" | "longPress" | "focus";
  duration?: number;
  searchUntil?: {
    duration?: number;
  };
  platform: Platform;
  tapClickableParent?: boolean;
  clickable?: boolean;
  scrollableContainer?: boolean;
  siblingOfText?: string;
}

export interface DragAndDropArgs {
  source: {
    text?: string;
    elementId?: string;
  };
  target: {
    text?: string;
    elementId?: string;
  };
  pressDurationMs?: number;
  dragDurationMs?: number;
  holdDurationMs?: number;
  platform: Platform;
}

export interface SwipeOnArgs {
  includeSystemInsets?: boolean;
  container?: {
    elementId?: string;
    text?: string;
  };
  autoTarget?: boolean;
  direction: "up" | "down" | "left" | "right";
  gestureType?: "swipeFingerTowardsDirection" | "scrollTowardsDirection";
  lookFor?: {
    elementId?: string;
    text?: string;
  };
  boomerang?: boolean;
  apexPause?: number;
  returnSpeed?: number;
  speed?: "slow" | "normal" | "fast";
  platform: Platform;
}

export interface PinchOnArgs {
  direction: "in" | "out";
  distanceStart?: number;
  distanceEnd?: number;
  scale?: number;
  duration?: number;
  rotationDegrees?: number;
  includeSystemInsets?: boolean;
  container?: {
    elementId?: string;
    text?: string;
  };
  autoTarget?: boolean;
  platform: Platform;
}

export interface ShakeArgs {
  duration?: number;
  intensity?: number;
  platform: Platform;
}

export interface ImeActionArgs {
  action: "done" | "next" | "search" | "send" | "go" | "previous";
  platform: Platform;
}

export interface KeyboardArgs {
  action: "open" | "close" | "detect";
  platform: Platform;
}

export interface RecentAppsArgs {
  platform: Platform;
}

export interface RotateArgs {
  orientation: "portrait" | "landscape";
  platform: Platform;
}

export interface ClipboardArgs {
  action: "copy" | "paste" | "clear" | "get";
  text?: string;
  platform: Platform;
}
