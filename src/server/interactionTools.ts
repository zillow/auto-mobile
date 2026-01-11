import { z } from "zod";
import { ToolRegistry, ProgressCallback } from "./toolRegistry";
import { TapOnElement } from "../features/action/TapOnElement";
import { InputText } from "../features/action/InputText";
import { ClearText } from "../features/action/ClearText";
import { SelectAllText } from "../features/action/SelectAllText";
import { PressButton } from "../features/action/PressButton";
import { DragAndDrop } from "../features/action/DragAndDrop";
import { SwipeOn } from "../features/action/SwipeOn";
import { PinchOn } from "../features/action/PinchOn";
import { Shake } from "../features/action/Shake";
import { ImeAction } from "../features/action/ImeAction";
import { RecentApps } from "../features/action/RecentApps";
import { HomeScreen } from "../features/action/HomeScreen";
import { Rotate } from "../features/action/Rotate";
import { OpenURL } from "../features/action/OpenURL";
import { Clipboard } from "../features/action/Clipboard";
import { ActionableError, BootedDevice, Element, ViewHierarchyResult } from "../models";
import { serverConfig } from "../utils/ServerConfig";
import { ObserveScreen } from "../features/observe/ObserveScreen";
import { ListInstalledApps } from "../features/observe/ListInstalledApps";
import { createJSONToolResponse } from "../utils/toolUtils";
import { Platform } from "../models";
import { resolveSwipeDirection } from "../utils/swipeOnUtils";
import { RecompositionTracker } from "../features/performance/RecompositionTracker";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import { ElementUtils } from "../features/utility/ElementUtils";
import { AdbClient } from "../utils/android-cmdline-tools/AdbClient";

// Type definitions for better TypeScript support
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
  text?: string;
  id?: string;
  action: "tap" | "doubleTap" | "longPress" | "focus";
  duration?: number;
  await?: {
    element: {
      id?: string;
      text?: string;
    };
    timeout?: number;
  };
  platform: Platform;
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
  duration?: number;
  holdTime?: number;
  dropDelay?: number;
  platform: Platform;
}

export interface SwipeOnArgs {
  includeSystemInsets?: boolean;
  container?: {
    elementId?: string;
    text?: string;
  };
  autoTarget?: boolean;
  direction?: "up" | "down" | "left" | "right";
  gestureType?: "swipeFingerTowardsDirection" | "scrollTowardsDirection";
  lookFor?: {
    elementId?: string;
    text?: string;
  };
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

// Schema definitions for tool arguments
export const shakeSchema = addDeviceTargetingToSchema(z.object({
  duration: z.number().optional().describe("Shake duration in ms (default: 1000)"),
  intensity: z.number().optional().describe("Shake acceleration intensity (default: 100)"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

const tapOnContainerSchema = z.object({
  elementId: z.string().optional().describe("Container resource ID"),
  text: z.string().optional().describe("Container text")
}).superRefine((value, ctx) => {
  if (!value.elementId && !value.text) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "container must include elementId or text"
    });
  }
});

export const tapOnSchema = addDeviceTargetingToSchema(z.object({
  container: tapOnContainerSchema.optional().describe(
    "Container selector object to scope search. Provide { \"elementId\": \"<id>\" } or { \"text\": \"<text>\" }."
  ),
  action: z.enum(["tap", "doubleTap", "longPress", "focus"]).describe("Action type"),
  text: z.string().optional().describe("Text to tap (overrides id)"),
  id: z.string().optional().describe("Element ID to tap"),
  duration: z.number().optional().describe("Long press duration (ms)"),
  await: z.object({
    element: z.object({
      id: z.string().optional().describe("Element ID to wait for"),
      text: z.string().optional().describe("Element text to wait for"),
    }).describe("Element to wait for"),
    timeout: z.number().optional().describe("Wait timeout ms (default: 5000)"),
  }).optional().describe("Wait for element after tap"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const dragAndDropSchema = addDeviceTargetingToSchema(z.object({
  source: z.object({
    text: z.string().optional().describe("Source text"),
    elementId: z.string().optional().describe("Source ID")
  }).describe("Source element"),
  target: z.object({
    text: z.string().optional().describe("Target text"),
    elementId: z.string().optional().describe("Target ID")
  }).describe("Target element"),
  duration: z.number().optional().describe("Drag duration ms (default: 500)"),
  holdTime: z.number().optional().describe("Hold time ms (default: 200)"),
  dropDelay: z.number().optional().describe("Drop delay ms (default: 100)"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const swipeOnSchema = addDeviceTargetingToSchema(z.object({
  includeSystemInsets: z.boolean().optional().describe("Include system bars (default false)"),
  container: z.object({
    elementId: z.string().optional().describe("Container resource ID"),
    text: z.string().optional().describe("Container text")
  })
    .refine(
      value => [value.elementId, value.text].filter(Boolean).length === 1,
      "container must specify exactly one of elementId or text"
    )
    .optional()
    .describe(
      "Container to swipe within (elementId or text). REQUIRED for lists. Omit for full-screen swipes."
    ),
  autoTarget: z.boolean().optional().describe("Auto-target scrollable container (default true)"),
  direction: z.enum(["up", "down", "left", "right"]).describe(
    `Finger movement direction. up=finger up/reveals above, down=finger down/reveals below, left/right=finger left/right`
  ),
  gestureType: z.enum(["swipeFingerTowardsDirection", "scrollTowardsDirection"]).optional().describe(
    `swipeFingerTowardsDirection=finger moves in direction (default), scrollTowardsDirection=content scrolls in direction`
  ),
  lookFor: z.object({
    elementId: z.string().optional().describe("ID of the element to look for"),
    text: z.string().optional().describe("Text to look for"),
  }).optional().describe("Swipe until we find a match"),
  speed: z.enum(["slow", "normal", "fast"]).optional().describe("Scroll speed"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const pinchOnSchema = addDeviceTargetingToSchema(z.object({
  direction: z.enum(["in", "out"]).describe("Pinch direction (in=zoom out, out=zoom in)"),
  distanceStart: z.number().optional().describe("Start distance px"),
  distanceEnd: z.number().optional().describe("End distance px"),
  scale: z.number().optional().describe("Scale multiplier"),
  duration: z.number().optional().describe("Duration ms (default: 300)"),
  rotationDegrees: z.number().optional().describe("Rotation degrees (+ = clockwise)"),
  includeSystemInsets: z.boolean().optional().describe("Include system bars (default false)"),
  container: z.object({
    elementId: z.string().optional().describe("Container ID"),
    text: z.string().optional().describe("Container text")
  }).optional().describe("Container to pinch within"),
  autoTarget: z.boolean().optional().describe("Auto-target surface (default true)"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const clearTextSchema = addDeviceTargetingToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const selectAllTextSchema = addDeviceTargetingToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const pressButtonSchema = addDeviceTargetingToSchema(z.object({
  button: z.enum(["home", "back", "menu", "power", "volume_up", "volume_down", "recent"])
    .describe("Button to press"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

const systemTrayNotificationSchema = z.object({
  title: z.string().optional().describe("Notification title (case-insensitive, partial match)"),
  body: z.string().optional().describe("Notification body (case-insensitive, partial match)"),
  appId: z.string().optional().describe("Notification app package ID (Android only)"),
  tapActionLabel: z.string().optional().describe("Notification action button label to tap (tap only)")
});

const systemTraySchemaBase = z.object({
  action: z.enum(["open", "find", "tap", "dismiss", "clearAll"]).describe("System tray action"),
  notification: systemTrayNotificationSchema.optional().describe("Notification match criteria"),
  awaitTimeout: z.number().int().nonnegative().optional().describe("Wait timeout ms (default: 5000)"),
  platform: z.enum(["android", "ios"]).describe("Platform")
});

export const systemTraySchema = addDeviceTargetingToSchema(systemTraySchemaBase).superRefine((value, ctx) => {
  const notification = value.notification;
  const hasCriteria = Boolean(notification?.title || notification?.body || notification?.appId || notification?.tapActionLabel);

  if (value.action === "open") {
    return;
  }

  if (!notification || !hasCriteria) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "notification with title/body/appId/tapActionLabel is required for this action"
    });
    return;
  }

  if (value.action === "tap") {
    const hasTapTarget = Boolean(notification.title || notification.body || notification.tapActionLabel);
    if (!hasTapTarget) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tap action requires notification.title, notification.body, or notification.tapActionLabel"
      });
    }
  }

  if (value.action === "dismiss") {
    const hasDismissTarget = Boolean(notification.title || notification.body);
    if (!hasDismissTarget) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dismiss action requires notification.title or notification.body"
      });
    }
  }

  if (value.action === "clearAll" && !notification.appId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "clearAll action requires notification.appId"
    });
  }

  if (notification.tapActionLabel && value.action !== "tap") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "notification.tapActionLabel is only valid for tap action"
    });
  }
});

export const pressKeySchema = addDeviceTargetingToSchema(z.object({
  key: z.enum(["home", "back", "menu", "power", "volume_up", "volume_down", "recent"])
    .describe("Key to press"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const stopAppSchema = addDeviceTargetingToSchema(z.object({
  appId: z.string().describe("App package ID"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const clearStateSchema = addDeviceTargetingToSchema(z.object({
  appId: z.string().describe("App package ID"),
  clearKeychain: z.boolean().optional().describe("Clear iOS keychain"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const inputTextSchema = addDeviceTargetingToSchema(z.object({
  text: z.string().describe("Text to input"),
  imeAction: z.enum(["done", "next", "search", "send", "go", "previous"]).optional()
    .describe("IME action after input"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const openLinkSchema = addDeviceTargetingToSchema(z.object({
  url: z.string().describe("URL to open"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const imeActionSchema = addDeviceTargetingToSchema(z.object({
  action: z.enum(["done", "next", "search", "send", "go", "previous"]).describe("IME action"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const recentAppsSchema = addDeviceTargetingToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const homeScreenSchema = addDeviceTargetingToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const rotateSchema = addDeviceTargetingToSchema(z.object({
  orientation: z.enum(["portrait", "landscape"]).describe("Orientation"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const clipboardSchema = addDeviceTargetingToSchema(z.object({
  action: z.enum(["copy", "paste", "clear", "get"]).describe("Clipboard action: copy=set clipboard, paste=paste into focused field, clear=clear clipboard, get=get clipboard content"),
  text: z.string().optional().describe("Text to copy (required for 'copy' action)"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

const SYSTEM_TRAY_PACKAGE = "com.android.systemui";
const SYSTEM_TRAY_RESOURCE_ID_HINTS = [
  "notification_panel",
  "notification_stack",
  "notification_stack_scroller",
  "status_bar_expanded",
  "quick_settings",
  "quick_settings_panel",
  "quick_settings_container",
  "qs_panel",
  "qs_frame",
  "qs_header",
  "shade_header",
  "expanded_status_bar"
];
const SYSTEM_TRAY_CLASS_HINTS = [
  "NotificationPanel",
  "NotificationShade",
  "NotificationStack",
  "QSPanel",
  "QuickSettings",
  "StatusBarExpanded"
];
const NOTIFICATION_ROW_RESOURCE_ID_HINTS = [
  "notification_row",
  "status_bar_notification",
  "notification_container",
  "notification_content",
  "notification_main_column",
  "notification_template"
];
const NOTIFICATION_ROW_CLASS_HINTS = [
  "ExpandableNotificationRow",
  "NotificationRow",
  "StatusBarNotification",
  "NotificationContentView"
];
const NOTIFICATION_ROW_RESOURCE_ID_EXCLUDES = [
  ...SYSTEM_TRAY_RESOURCE_ID_HINTS,
  "notification_shelf",
  "notification_stack_scroll"
];
const DEFAULT_SYSTEM_TRAY_AWAIT_TIMEOUT_MS = 5000;
const SYSTEM_TRAY_POLL_INTERVAL_MS = 250;
const SYSTEM_TRAY_CLEAR_MAX_ITERATIONS = 25;
const SYSTEM_TRAY_NOTIFICATION_SWIPE_DURATION_MS = 300;

const getNodeProperties = (node: any): Record<string, any> | null => {
  if (!node || typeof node !== "object") {
    return null;
  }
  if ("$" in node && node.$) {
    return node.$ as Record<string, any>;
  }
  return node as Record<string, any>;
};

const nodeHasSystemTrayHint = (node: any): boolean => {
  const props = getNodeProperties(node);
  if (!props) {
    return false;
  }

  const resourceId = String(props["resource-id"] ?? props.resourceId ?? "");
  const className = String(props.className ?? props.class ?? "");
  const packageName = String(props.packageName ?? props.package ?? "");
  const isSystemUi = packageName === SYSTEM_TRAY_PACKAGE || resourceId.includes(SYSTEM_TRAY_PACKAGE);

  if (!isSystemUi) {
    return false;
  }

  const matchesResourceId = SYSTEM_TRAY_RESOURCE_ID_HINTS.some(hint => resourceId.includes(hint));
  const matchesClassName = SYSTEM_TRAY_CLASS_HINTS.some(hint => className.includes(hint));

  return matchesResourceId || matchesClassName;
};

const traverseForSystemTray = (node: any): boolean => {
  if (!node) {
    return false;
  }

  if (nodeHasSystemTrayHint(node)) {
    return true;
  }

  const children = node.node;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (traverseForSystemTray(child)) {
        return true;
      }
    }
  } else if (children && typeof children === "object") {
    if (traverseForSystemTray(children)) {
      return true;
    }
  }

  return false;
};

const getHierarchyRoots = (viewHierarchy: ViewHierarchyResult): any[] => {
  if (!viewHierarchy?.hierarchy || (viewHierarchy.hierarchy as any).error) {
    return [];
  }

  const hierarchy: any = viewHierarchy.hierarchy;
  if (hierarchy.node) {
    return Array.isArray(hierarchy.node) ? hierarchy.node : [hierarchy.node];
  }
  if (hierarchy.hierarchy) {
    return [hierarchy.hierarchy];
  }

  return [hierarchy];
};

const isSystemTrayOpen = (viewHierarchy?: ViewHierarchyResult): boolean => {
  if (!viewHierarchy) {
    return false;
  }

  const rootNodes = getHierarchyRoots(viewHierarchy);
  for (const rootNode of rootNodes) {
    if (traverseForSystemTray(rootNode)) {
      return true;
    }
  }

  return false;
};

type SystemTrayMatchType = "exact" | "partial";

interface SystemTrayTextMatch {
  text: string;
  matchType: SystemTrayMatchType;
}

interface SystemTrayMatchResult {
  matched: boolean;
  matches: {
    title?: SystemTrayTextMatch;
    body?: SystemTrayTextMatch;
    app?: SystemTrayTextMatch;
    action?: SystemTrayTextMatch;
  };
}

interface SystemTrayNotificationCandidate {
  node: any;
  depth: number;
  element?: Element;
}

interface SystemTrayNotificationMatch {
  candidate: SystemTrayNotificationCandidate;
  match: SystemTrayMatchResult;
  subHierarchy: ViewHierarchyResult;
}

interface SystemTrayElementMatch {
  text: string;
  matchType: SystemTrayMatchType;
  element: Element;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const resolveSystemTrayAwaitTimeout = (awaitTimeout?: number): number => {
  return awaitTimeout ?? DEFAULT_SYSTEM_TRAY_AWAIT_TIMEOUT_MS;
};

const parseAppLabelFromDumpsys = (stdout: string): string | null => {
  const lines = stdout.split("\n").map(line => line.trim()).filter(Boolean);
  const parseLine = (line: string): string | null => {
    const match = line.match(/application-label(?:-[^:]+)?:\s*(?:'([^']+)'|"([^"]+)"|(.+))/);
    if (!match) {
      return null;
    }
    const label = match[1] ?? match[2] ?? match[3];
    return label ? label.trim() : null;
  };

  for (const line of lines) {
    if (line.startsWith("application-label:")) {
      const label = parseLine(line);
      if (label) {
        return label;
      }
    }
  }

  for (const line of lines) {
    if (line.startsWith("application-label-")) {
      const label = parseLine(line);
      if (label) {
        return label;
      }
    }
  }

  return null;
};

const resolveAppLabel = async (device: BootedDevice, appId: string): Promise<string | null> => {
  if (device.platform !== "android") {
    return null;
  }

  try {
    const adb = new AdbClient(device);
    const result = await adb.executeCommand(`shell dumpsys package ${appId}`, undefined, undefined, true);
    return parseAppLabelFromDumpsys(result.stdout);
  } catch (error) {
    return null;
  }
};

const createSubHierarchy = (node: any): ViewHierarchyResult => {
  return {
    hierarchy: {
      node
    }
  };
};

const getNotificationCriteriaCount = (criteria: SystemTrayNotificationArgs): number => {
  return [criteria.title, criteria.body, criteria.appId, criteria.tapActionLabel].filter(Boolean).length;
};

const nodeHasNotificationRowHint = (node: any): boolean => {
  const props = getNodeProperties(node);
  if (!props) {
    return false;
  }

  const resourceId = String(props["resource-id"] ?? props.resourceId ?? "").toLowerCase();
  const className = String(props.className ?? props.class ?? "").toLowerCase();
  const packageName = String(props.packageName ?? props.package ?? "").toLowerCase();
  const isSystemUi = packageName === SYSTEM_TRAY_PACKAGE || resourceId.includes(SYSTEM_TRAY_PACKAGE);

  if (!isSystemUi) {
    return false;
  }

  if (NOTIFICATION_ROW_RESOURCE_ID_EXCLUDES.some(hint => resourceId.includes(hint))) {
    return false;
  }

  const matchesResourceId = NOTIFICATION_ROW_RESOURCE_ID_HINTS.some(hint => resourceId.includes(hint));
  const matchesClassName = NOTIFICATION_ROW_CLASS_HINTS.some(hint => className.includes(hint.toLowerCase()));

  return matchesResourceId || matchesClassName;
};

const collectNotificationCandidates = (viewHierarchy: ViewHierarchyResult): SystemTrayNotificationCandidate[] => {
  const candidates: SystemTrayNotificationCandidate[] = [];
  const elementUtils = new ElementUtils();

  const visit = (node: any, depth: number): void => {
    if (!node) {
      return;
    }

    if (nodeHasNotificationRowHint(node)) {
      const element = elementUtils.parseNodeBounds(node) ?? undefined;
      candidates.push({ node, depth, element });
      return;
    }

    const children = node.node;
    if (Array.isArray(children)) {
      for (const child of children) {
        visit(child, depth + 1);
      }
    } else if (children && typeof children === "object") {
      visit(children, depth + 1);
    }
  };

  const rootNodes = getHierarchyRoots(viewHierarchy);
  for (const rootNode of rootNodes) {
    visit(rootNode, 0);
  }

  return candidates;
};

const findTextMatch = (
  elementUtils: ElementUtils,
  viewHierarchy: ViewHierarchyResult,
  text: string
): SystemTrayTextMatch | null => {
  const exactMatch = elementUtils.findElementByText(viewHierarchy, text, undefined, false, false);
  if (exactMatch) {
    return { text, matchType: "exact" };
  }

  const partialMatch = elementUtils.findElementByText(viewHierarchy, text, undefined, true, false);
  if (partialMatch) {
    return { text, matchType: "partial" };
  }

  return null;
};

const findFirstTextMatch = (
  elementUtils: ElementUtils,
  viewHierarchy: ViewHierarchyResult,
  texts: string[]
): SystemTrayTextMatch | null => {
  const candidates = texts.map(text => text.trim()).filter(Boolean);
  for (const text of candidates) {
    const exactMatch = elementUtils.findElementByText(viewHierarchy, text, undefined, false, false);
    if (exactMatch) {
      return { text, matchType: "exact" };
    }
  }

  for (const text of candidates) {
    const partialMatch = elementUtils.findElementByText(viewHierarchy, text, undefined, true, false);
    if (partialMatch) {
      return { text, matchType: "partial" };
    }
  }

  return null;
};

const findElementMatch = (
  elementUtils: ElementUtils,
  viewHierarchy: ViewHierarchyResult,
  text: string
): SystemTrayElementMatch | null => {
  const exactMatch = elementUtils.findElementByText(viewHierarchy, text, undefined, false, false);
  if (exactMatch) {
    return { text, matchType: "exact", element: exactMatch };
  }

  const partialMatch = elementUtils.findElementByText(viewHierarchy, text, undefined, true, false);
  if (partialMatch) {
    return { text, matchType: "partial", element: partialMatch };
  }

  return null;
};

const findFirstElementMatch = (
  elementUtils: ElementUtils,
  viewHierarchy: ViewHierarchyResult,
  texts: string[]
): SystemTrayElementMatch | null => {
  const candidates = texts.map(text => text.trim()).filter(Boolean);
  for (const text of candidates) {
    const exactMatch = elementUtils.findElementByText(viewHierarchy, text, undefined, false, false);
    if (exactMatch) {
      return { text, matchType: "exact", element: exactMatch };
    }
  }

  for (const text of candidates) {
    const partialMatch = elementUtils.findElementByText(viewHierarchy, text, undefined, true, false);
    if (partialMatch) {
      return { text, matchType: "partial", element: partialMatch };
    }
  }

  return null;
};

const buildNotificationMatch = (
  viewHierarchy: ViewHierarchyResult,
  criteria: SystemTrayNotificationArgs,
  appMatchTexts: string[]
): SystemTrayMatchResult => {
  const elementUtils = new ElementUtils();
  const matches: SystemTrayMatchResult["matches"] = {};
  let matched = true;

  if (criteria.title) {
    const titleMatch = findTextMatch(elementUtils, viewHierarchy, criteria.title);
    if (!titleMatch) {
      matched = false;
    } else {
      matches.title = titleMatch;
    }
  }

  if (criteria.body) {
    const bodyMatch = findTextMatch(elementUtils, viewHierarchy, criteria.body);
    if (!bodyMatch) {
      matched = false;
    } else {
      matches.body = bodyMatch;
    }
  }

  if (criteria.tapActionLabel) {
    const actionMatch = findTextMatch(elementUtils, viewHierarchy, criteria.tapActionLabel);
    if (!actionMatch) {
      matched = false;
    } else {
      matches.action = actionMatch;
    }
  }

  if (criteria.appId) {
    const appMatch = findFirstTextMatch(elementUtils, viewHierarchy, appMatchTexts);
    if (!appMatch) {
      matched = false;
    } else {
      matches.app = appMatch;
    }
  }

  return { matched, matches };
};

const getMatchCounts = (matches: SystemTrayMatchResult["matches"]): { exact: number; partial: number } => {
  const values = Object.values(matches);
  let exact = 0;
  let partial = 0;
  for (const match of values) {
    if (!match) {
      continue;
    }
    if (match.matchType === "exact") {
      exact += 1;
    } else {
      partial += 1;
    }
  }
  return { exact, partial };
};

const getCandidateArea = (candidate: SystemTrayNotificationCandidate): number => {
  const bounds = candidate.element?.bounds;
  if (!bounds) {
    return 0;
  }
  return Math.max(0, bounds.right - bounds.left) * Math.max(0, bounds.bottom - bounds.top);
};

const selectBestNotificationMatch = (
  matches: SystemTrayNotificationMatch[]
): SystemTrayNotificationMatch | null => {
  if (matches.length === 0) {
    return null;
  }

  return matches
    .slice()
    .sort((left, right) => {
      const leftCounts = getMatchCounts(left.match.matches);
      const rightCounts = getMatchCounts(right.match.matches);
      if (leftCounts.exact !== rightCounts.exact) {
        return rightCounts.exact - leftCounts.exact;
      }
      if (leftCounts.partial !== rightCounts.partial) {
        return rightCounts.partial - leftCounts.partial;
      }
      const leftArea = getCandidateArea(left.candidate);
      const rightArea = getCandidateArea(right.candidate);
      if (leftArea !== rightArea) {
        return rightArea - leftArea;
      }
      return left.candidate.depth - right.candidate.depth;
    })[0];
};

const findNotificationMatches = (
  viewHierarchy: ViewHierarchyResult,
  criteria: SystemTrayNotificationArgs,
  appMatchTexts: string[]
): SystemTrayNotificationMatch[] => {
  const elementUtils = new ElementUtils();
  const candidates = collectNotificationCandidates(viewHierarchy);
  const criteriaCount = getNotificationCriteriaCount(criteria);
  const fallbackCandidates = criteriaCount <= 1
    ? getHierarchyRoots(viewHierarchy).map(node => ({
      node,
      depth: 0,
      element: elementUtils.parseNodeBounds(node) ?? undefined
    }))
    : [];
  const searchCandidates = candidates.length > 0 ? candidates : fallbackCandidates;

  return searchCandidates
    .map(candidate => {
      const subHierarchy = createSubHierarchy(candidate.node);
      const match = buildNotificationMatch(subHierarchy, criteria, appMatchTexts);
      return { candidate, match, subHierarchy };
    })
    .filter(entry => entry.match.matched);
};

const findBestNotificationMatch = (
  viewHierarchy: ViewHierarchyResult,
  criteria: SystemTrayNotificationArgs,
  appMatchTexts: string[]
): SystemTrayNotificationMatch | null => {
  const matches = findNotificationMatches(viewHierarchy, criteria, appMatchTexts);
  return selectBestNotificationMatch(matches);
};

const ensureSystemTrayOpen = async (
  device: BootedDevice,
  progress?: ProgressCallback
): Promise<{ observation?: import("../models").ObserveResult; opened: boolean; skipped: boolean }> => {
  let observation: import("../models").ObserveResult | undefined;

  if (device.platform === "android") {
    const observeScreen = new ObserveScreen(device);
    observation = await observeScreen.execute();
    if (isSystemTrayOpen(observation.viewHierarchy)) {
      return { observation, opened: false, skipped: true };
    }
  }

  const swipeOn = new SwipeOn(device);

  const options: import("../models").SwipeOnOptions = {
    direction: "down",
    includeSystemInsets: true,
    duration: 100
  };

  const result = await swipeOn.execute(options, progress);
  return {
    observation: result.observation ?? observation,
    opened: true,
    skipped: false
  };
};

const waitForNotificationMatch = async (
  device: BootedDevice,
  criteria: SystemTrayNotificationArgs,
  appMatchTexts: string[],
  awaitTimeoutMs: number,
  progress?: ProgressCallback
): Promise<{ observation: import("../models").ObserveResult; match: SystemTrayNotificationMatch | null }> => {
  const observeScreen = new ObserveScreen(device);
  let { observation } = await ensureSystemTrayOpen(device, progress);
  if (!observation) {
    observation = await observeScreen.execute();
  }

  const startTime = Date.now();
  while (true) {
    const viewHierarchy = observation.viewHierarchy;
    if (viewHierarchy) {
      const match = findBestNotificationMatch(viewHierarchy, criteria, appMatchTexts);
      if (match) {
        return { observation, match };
      }
    }

    if (Date.now() - startTime >= awaitTimeoutMs) {
      return { observation, match: null };
    }

    await sleep(SYSTEM_TRAY_POLL_INTERVAL_MS);
    observation = await observeScreen.execute();
  }
};

const resolveNotificationTapElement = (
  match: SystemTrayNotificationMatch,
  criteria: SystemTrayNotificationArgs
): SystemTrayElementMatch | null => {
  const elementUtils = new ElementUtils();
  const subHierarchy = match.subHierarchy;

  if (criteria.tapActionLabel) {
    const actionMatch = findElementMatch(elementUtils, subHierarchy, criteria.tapActionLabel);
    if (actionMatch) {
      return actionMatch;
    }
  }

  if (criteria.title) {
    const titleMatch = findElementMatch(elementUtils, subHierarchy, criteria.title);
    if (titleMatch) {
      return titleMatch;
    }
  }

  if (criteria.body) {
    const bodyMatch = findElementMatch(elementUtils, subHierarchy, criteria.body);
    if (bodyMatch) {
      return bodyMatch;
    }
  }

  return null;
};

const resolveNotificationSwipeElement = (
  match: SystemTrayNotificationMatch,
  criteria: SystemTrayNotificationArgs,
  appMatchTexts: string[]
): Element | null => {
  if (match.candidate.element) {
    return match.candidate.element;
  }

  const elementUtils = new ElementUtils();
  const subHierarchy = match.subHierarchy;

  if (criteria.title) {
    const titleMatch = findElementMatch(elementUtils, subHierarchy, criteria.title);
    if (titleMatch) {
      return titleMatch.element;
    }
  }

  if (criteria.body) {
    const bodyMatch = findElementMatch(elementUtils, subHierarchy, criteria.body);
    if (bodyMatch) {
      return bodyMatch.element;
    }
  }

  if (criteria.appId) {
    const appMatch = findFirstElementMatch(elementUtils, subHierarchy, appMatchTexts);
    if (appMatch) {
      return appMatch.element;
    }
  }

  return null;
};

const tapElementWithAdb = async (device: BootedDevice, element: Element): Promise<void> => {
  const elementUtils = new ElementUtils();
  const center = elementUtils.getElementCenter(element);
  const adb = new AdbClient(device);
  await adb.executeCommand(`shell input tap ${center.x} ${center.y}`);
};

const swipeElementWithAdb = async (device: BootedDevice, element: Element): Promise<void> => {
  const elementUtils = new ElementUtils();
  const { startX, startY, endX, endY } = elementUtils.getSwipeWithinBounds("left", element.bounds);
  const adb = new AdbClient(device);
  await adb.executeCommand(
    `shell input swipe ${Math.floor(startX)} ${Math.floor(startY)} ${Math.floor(endX)} ${Math.floor(endY)} ${SYSTEM_TRAY_NOTIFICATION_SWIPE_DURATION_MS}`
  );
};

// Register tools
export function registerInteractionTools() {
  // Tap on handler
  const tapOnHandler = async (device: BootedDevice, args: TapOnArgs, progress?: ProgressCallback) => {
    RecompositionTracker.getInstance().recordInteraction();
    const tapOnTextCommand = new TapOnElement(device);
    const result = await tapOnTextCommand.execute({
      container: args.container,
      text: args.text,
      elementId: args.id,
      action: args.action,
      duration: args.duration,
      await: args.await,
      strictAwait: serverConfig.isStrictAwaitEnabled(),
    }, progress);

    return createJSONToolResponse({
      message: `Tapped on element`,
      observation: result.observation,
      ...result
    });
  };

  // Drag and drop handler
  const dragAndDropHandler = async (device: BootedDevice, args: DragAndDropArgs, progress?: ProgressCallback) => {
    RecompositionTracker.getInstance().recordInteraction();
    const dragAndDrop = new DragAndDrop(device);
    const result = await dragAndDrop.execute({
      source: args.source,
      target: args.target,
      duration: args.duration,
      holdTime: args.holdTime,
      dropDelay: args.dropDelay
    }, progress);

    return createJSONToolResponse({
      message: "Dragged element to target",
      observation: result.observation,
      ...result
    });
  };

  // Clear text handler
  const clearTextHandler = async (device: BootedDevice, args: ClearTextArgs, progress?: ProgressCallback) => {
    try {
      const clearText = new ClearText(device);
      const result = await clearText.execute(progress);

      return createJSONToolResponse({
        message: "Cleared text from input field",
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to clear text: ${error}`);
    }
  };

  // Select all text handler
  const selectAllTextHandler = async (device: BootedDevice, args: SelectAllTextArgs, progress?: ProgressCallback) => {
    try {
      const selectAllText = new SelectAllText(device);
      const result = await selectAllText.execute(progress);

      return createJSONToolResponse({
        message: "Selected all text in focused input field",
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to select all text: ${error}`);
    }
  };

  // Press button handler
  const pressButtonHandler = async (device: BootedDevice, args: PressButtonArgs, progress?: ProgressCallback) => {
    RecompositionTracker.getInstance().recordInteraction();
    try {
      const pressButton = new PressButton(device);
      const result = await pressButton.execute(args.button, progress); // observe = true

      return createJSONToolResponse({
        message: `Pressed button ${args.button}`,
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to press button: ${error}`);
    }
  };

  // System tray handler
  const systemTrayHandler = async (device: BootedDevice, args: SystemTrayArgs, progress?: ProgressCallback) => {
    try {
      if (args.platform === "ios") {
        return createJSONToolResponse({
          success: false,
          message: "systemTray is not supported on iOS yet.",
          action: args.action
        });
      }

      if (args.action === "open") {
        const result = await ensureSystemTrayOpen(device, progress);
        return createJSONToolResponse({
          message: result.skipped
            ? "System tray already open; no swipe needed"
            : "Opened system tray by swiping down from the status bar",
          observation: result.observation,
          success: true,
          skipped: result.skipped
        });
      }

      const notification = args.notification ?? {};
      const awaitTimeoutMs = resolveSystemTrayAwaitTimeout(args.awaitTimeout);
      let appLabel: string | null = null;
      let appMatchTexts: string[] = [];

      if (notification.appId) {
        const listInstalledApps = new ListInstalledApps(device);
        const installedApps = await listInstalledApps.execute();
        if (!installedApps.includes(notification.appId)) {
          throw new ActionableError(`App ${notification.appId} is not installed.`);
        }

        appLabel = await resolveAppLabel(device, notification.appId);
        appMatchTexts = [appLabel, notification.appId].filter(Boolean) as string[];
      }

      if (args.action === "find") {
        const { observation, match } = await waitForNotificationMatch(
          device,
          notification,
          appMatchTexts,
          awaitTimeoutMs,
          progress
        );

        if (!match) {
          throw new ActionableError(`Notification not found after ${awaitTimeoutMs}ms.`);
        }

        return createJSONToolResponse({
          message: "Found notification in system tray",
          match: match.match.matches,
          observation,
          success: true
        });
      }

      if (args.action === "tap") {
        const { match } = await waitForNotificationMatch(
          device,
          notification,
          appMatchTexts,
          awaitTimeoutMs,
          progress
        );

        if (!match) {
          throw new ActionableError(`Notification not found after ${awaitTimeoutMs}ms.`);
        }

        const tapMatch = resolveNotificationTapElement(match, notification);
        if (!tapMatch) {
          throw new ActionableError("No notification tap target was resolved within the matched notification.");
        }

        await tapElementWithAdb(device, tapMatch.element);
        const observeScreen = new ObserveScreen(device);
        const nextObservation = await observeScreen.execute();

        return createJSONToolResponse({
          message: notification.tapActionLabel
            ? `Tapped notification action "${notification.tapActionLabel}"`
            : "Tapped notification",
          match: match.match.matches,
          tapTarget: {
            text: tapMatch.text,
            matchType: tapMatch.matchType
          },
          observation: nextObservation,
          success: true
        });
      }

      if (args.action === "dismiss") {
        const { match } = await waitForNotificationMatch(
          device,
          notification,
          appMatchTexts,
          awaitTimeoutMs,
          progress
        );

        if (!match) {
          throw new ActionableError(`Notification not found after ${awaitTimeoutMs}ms.`);
        }

        const swipeElement = resolveNotificationSwipeElement(match, notification, appMatchTexts);
        if (!swipeElement) {
          throw new ActionableError("No notification dismiss target was resolved within the matched notification.");
        }

        await swipeElementWithAdb(device, swipeElement);
        const observeScreen = new ObserveScreen(device);
        const nextObservation = await observeScreen.execute();

        return createJSONToolResponse({
          message: "Dismissed notification",
          match: match.match.matches,
          observation: nextObservation,
          success: true
        });
      }

      if (args.action === "clearAll") {
        const appId = notification.appId;
        if (!appId) {
          throw new ActionableError("clearAll requires notification.appId.");
        }

        if (appMatchTexts.length === 0) {
          appMatchTexts = [appId];
        }

        const observeScreen = new ObserveScreen(device);
        const startTime = Date.now();
        let clearedCount = 0;
        let lastMatchText: string | undefined;
        let lastObservation = (await ensureSystemTrayOpen(device, progress)).observation;

        if (!lastObservation) {
          lastObservation = await observeScreen.execute();
        }

        while (clearedCount < SYSTEM_TRAY_CLEAR_MAX_ITERATIONS) {
          const viewHierarchy = lastObservation.viewHierarchy;
          const match = viewHierarchy
            ? selectBestNotificationMatch(findNotificationMatches(viewHierarchy, notification, appMatchTexts))
            : null;

          if (!match) {
            if (clearedCount > 0 || Date.now() - startTime >= awaitTimeoutMs) {
              break;
            }
            await sleep(SYSTEM_TRAY_POLL_INTERVAL_MS);
            lastObservation = await observeScreen.execute();
            continue;
          }

          const swipeElement = resolveNotificationSwipeElement(match, notification, appMatchTexts);
          if (!swipeElement) {
            throw new ActionableError("Matched notification but could not resolve a swipe target.");
          }

          lastMatchText = match.match.matches.app?.text;
          await swipeElementWithAdb(device, swipeElement);
          clearedCount += 1;
          lastObservation = await observeScreen.execute();
          await sleep(SYSTEM_TRAY_POLL_INTERVAL_MS);
        }

        return createJSONToolResponse({
          message: clearedCount > 0
            ? `Cleared ${clearedCount} notification(s) for ${appId}`
            : `No matching notifications found for ${appId}`,
          clearedCount,
          appId,
          appLabel,
          matchText: lastMatchText,
          observation: lastObservation,
          success: true
        });
      }

      throw new ActionableError(`Unsupported systemTray action: ${args.action}`);
    } catch (error) {
      throw new ActionableError(`Failed to execute system tray action: ${error}`);
    }
  };

  // SwipeOn handler - unified swipe/scroll tool
  const swipeOnHandler = async (device: BootedDevice, args: SwipeOnArgs, progress?: ProgressCallback) => {
    RecompositionTracker.getInstance().recordInteraction();
    const swipeOn = new SwipeOn(device);

    // Resolve direction based on gestureType
    const resolved = resolveSwipeDirection({
      direction: args.direction,
      gestureType: args.gestureType
    });

    if (resolved.error) {
      return createJSONToolResponse({
        message: resolved.error,
        success: false,
        error: resolved.error
      });
    }

    // Convert SwipeOnArgs to SwipeOnOptions with resolved direction
    const options: import("../models").SwipeOnOptions = {
      includeSystemInsets: args.includeSystemInsets,
      container: args.container,
      autoTarget: args.autoTarget,
      direction: resolved.direction,
      gestureType: args.gestureType,
      lookFor: args.lookFor,
      speed: args.speed
      // duration and scrollMode are internal-only, not exposed in schema
    };

    const result = await swipeOn.execute(options, progress);

    const directionLabel = resolved.direction ?? "unknown";

    // Determine message based on operation type
    let message = "";
    if (!result.success && result.error) {
      message = `Swipe failed: ${result.error}`;
    } else if (result.found !== undefined) {
      // Scroll-until-visible operation
      if (result.found) {
        const target = args.lookFor?.text
          ? `text "${args.lookFor.text}"`
          : `element with id "${args.lookFor?.elementId}"`;
        message = `Scrolled until ${target} became visible (${result.scrollIterations} iterations, ${result.elapsedMs}ms)`;
      } else {
        message = `Element not found after scrolling`;
      }
    } else {
      // Use the descriptive message from resolution, then add context
      const gestureDesc = resolved.message ?? `Swiped ${directionLabel}`;
      if (!args.container) {
        // No container = screen swipe
        message = `${gestureDesc} on screen`;
      } else if (args.container.text) {
        message = `${gestureDesc} in container with text "${args.container.text}"`;
      } else if (args.container.elementId) {
        message = `${gestureDesc} in container with id "${args.container.elementId}"`;
      } else {
        message = gestureDesc;
      }
    }

    if (result.warning) {
      message = `${message} Warning: ${result.warning}`;
    }

    return createJSONToolResponse({
      message,
      ...result
    });
  };

  const pinchOnHandler = async (device: BootedDevice, args: PinchOnArgs, progress?: ProgressCallback) => {
    RecompositionTracker.getInstance().recordInteraction();
    const pinchOn = new PinchOn(device);

    const options: import("../models").PinchOnOptions = {
      direction: args.direction,
      distanceStart: args.distanceStart,
      distanceEnd: args.distanceEnd,
      scale: args.scale,
      duration: args.duration,
      rotationDegrees: args.rotationDegrees,
      includeSystemInsets: args.includeSystemInsets,
      container: args.container,
      autoTarget: args.autoTarget
    };

    const result = await pinchOn.execute(options, progress);

    let message = `Pinched ${args.direction}`;
    if (result.targetType === "container" && result.container?.text) {
      message = `Pinched ${args.direction} in container with text "${result.container.text}"`;
    } else if (result.targetType === "container" && result.container?.elementId) {
      message = `Pinched ${args.direction} in container with id "${result.container.elementId}"`;
    } else if (result.targetType === "screen") {
      message = `Pinched ${args.direction} on screen`;
    }

    if (!result.success && result.error) {
      message = `Pinch failed: ${result.error}`;
    }

    if (result.warning) {
      message = `${message} Warning: ${result.warning}`;
    }

    return createJSONToolResponse({
      message,
      ...result
    });
  };

  // Press key handler
  const pressKeyHandler = async (device: BootedDevice, args: PressKeyArgs, progress?: ProgressCallback) => {
    RecompositionTracker.getInstance().recordInteraction();
    const pressButton = new PressButton(device);
    const result = await pressButton.execute(args.key, progress);

    return createJSONToolResponse({
      message: `Pressed key ${args.key}`,
      observation: result.observation,
      ...result
    });
  };

  // Input text handler
  const inputTextHandler = async (device: BootedDevice, args: InputTextArgs) => {
    RecompositionTracker.getInstance().recordInteraction();
    const inputText = new InputText(device);
    const result = await inputText.execute(args.text, args.imeAction);
    return createJSONToolResponse({
      message: `Input text`,
      observation: result.observation,
      ...result
    });
  };

  // Open link handler
  const openLinkHandler = async (device: BootedDevice, args: OpenLinkArgs) => {
    const openUrl = new OpenURL(device);
    const result = await openUrl.execute(args.url);

    return createJSONToolResponse({
      message: `Opened link ${args.url}`,
      observation: result.observation,
      ...result
    });
  };

  // Shake handler
  const shakeHandler = async (device: BootedDevice, args: ShakeArgs, progress?: ProgressCallback) => {
    try {
      const shake = new Shake(device);
      const result = await shake.execute({
        duration: args.duration ?? 1000,
        intensity: args.intensity ?? 100
      }, progress);

      return createJSONToolResponse({
        message: `Shook device for ${args.duration ?? 1000}ms with intensity ${args.intensity ?? 100}`,
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to shake device: ${error}`);
    }
  };

  // IME action handler
  const imeActionHandler = async (device: BootedDevice, args: ImeActionArgs, progress?: ProgressCallback) => {
    try {
      const imeAction = new ImeAction(device);
      const result = await imeAction.execute(args.action, progress);

      return createJSONToolResponse({
        message: `Executed IME action "${args.action}"`,
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to execute IME action: ${error}`);
    }
  };

  // Recent Apps handler
  const recentAppsHandler = async (device: BootedDevice, args: RecentAppsArgs, progress?: ProgressCallback) => {
    try {
      const recentApps = new RecentApps(device);
      const result = await recentApps.execute(progress);

      return createJSONToolResponse({
        message: "Opened recent apps",
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to open recent apps: ${error}`);
    }
  };

  // Home Screen handler
  const homeScreenHandler = async (device: BootedDevice, args: any, progress?: ProgressCallback) => {
    try {
      const homeScreen = new HomeScreen(device);
      const result = await homeScreen.execute(progress);

      return createJSONToolResponse({
        message: "Pressed home button to return to the home screen",
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to go to home screen: ${error}`);
    }
  };

  // Rotate handler
  const rotateHandler = async (device: BootedDevice, args: RotateArgs, progress?: ProgressCallback) => {
    try {
      const rotate = new Rotate(device);
      const result = await rotate.execute(args.orientation, progress);

      return createJSONToolResponse({
        message: `Rotated device to ${args.orientation} orientation`,
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to rotate device: ${error}`);
    }
  };

  // Clipboard handler
  const clipboardHandler = async (device: BootedDevice, args: ClipboardArgs) => {
    try {
      const clipboard = new Clipboard(device);
      const result = await clipboard.execute(args.action, args.text);

      // Build descriptive message based on action
      let message = "";
      switch (args.action) {
        case "copy":
          message = `Copied text to clipboard`;
          break;
        case "paste":
          message = `Pasted clipboard content into focused field`;
          break;
        case "clear":
          message = `Cleared clipboard`;
          break;
        case "get":
          message = result.text
            ? `Retrieved clipboard content: "${result.text.substring(0, 50)}${result.text.length > 50 ? "..." : ""}"`
            : `Retrieved empty clipboard`;
          break;
      }

      if (result.method) {
        message += ` (via ${result.method})`;
      }

      return createJSONToolResponse({
        message,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to execute clipboard ${args.action}: ${error}`);
    }
  };

  // Register with the tool registry
  ToolRegistry.registerDeviceAware(
    "clearText",
    "Clear text from focused input",
    clearTextSchema,
    clearTextHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "selectAllText",
    "Select all text in focused input",
    selectAllTextSchema,
    selectAllTextHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "pressButton",
    "Press hardware button",
    pressButtonSchema,
    pressButtonHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "systemTray",
    "System tray actions for notifications (open/find/tap/dismiss/clearAll)",
    systemTraySchema,
    systemTrayHandler,
    true // Supports progress notifications
  );

  // Phase 1: Core Command Renames
  ToolRegistry.registerDeviceAware(
    "pressKey",
    "Press hardware key",
    pressKeySchema,
    pressKeyHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "inputText",
    "Input text",
    inputTextSchema,
    inputTextHandler,
    false // Does not support progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "openLink",
    "Open URL in browser",
    openLinkSchema,
    openLinkHandler,
    false // Does not support progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "tapOn",
    "Tap UI elements by text or ID",
    tapOnSchema,
    tapOnHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "dragAndDrop",
    "Drag and drop element",
    dragAndDropSchema,
    dragAndDropHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "swipeOn",
    "Swipe/scroll on screen or elements",
    swipeOnSchema,
    swipeOnHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "pinchOn",
    "Pinch to zoom",
    pinchOnSchema,
    pinchOnHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "shake",
    "Shake device",
    shakeSchema,
    shakeHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "imeAction",
    "Perform IME action",
    imeActionSchema,
    imeActionHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "recentApps",
    "Open recent apps",
    recentAppsSchema,
    recentAppsHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "homeScreen",
    "Go to home screen",
    homeScreenSchema,
    homeScreenHandler,
    true // Supports progress notifications
  );

  // Register the new rotate tool
  ToolRegistry.registerDeviceAware(
    "rotate",
    "Rotate device orientation",
    rotateSchema,
    rotateHandler,
    true // Supports progress notifications
  );

  // Register the clipboard tool
  ToolRegistry.registerDeviceAware(
    "clipboard",
    "Clipboard operations (copy/paste/clear/get)",
    clipboardSchema,
    clipboardHandler,
    false // Does not support progress notifications
  );
}
