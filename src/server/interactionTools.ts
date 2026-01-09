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
import { ActionableError, BootedDevice, ViewHierarchyResult } from "../models";
import { serverConfig } from "../utils/ServerConfig";
import { ObserveScreen } from "../features/observe/ObserveScreen";
import { createJSONToolResponse } from "../utils/toolUtils";
import { Platform } from "../models";
import { resolveSwipeDirection } from "../utils/swipeOnUtils";
import { RecompositionTracker } from "../features/performance/RecompositionTracker";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";

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

export interface OpenSystemTrayArgs {
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
    "Container to scope search (elementId or text)"
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

export const openSystemTraySchema = addDeviceTargetingToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

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

  if (!viewHierarchy.windows || viewHierarchy.windows.length === 0) {
    return false;
  }

  for (const window of viewHierarchy.windows) {
    if (!window.hierarchy) {
      continue;
    }

    const windowHierarchy: any = window.hierarchy;
    const windowRoots = windowHierarchy.node
      ? (Array.isArray(windowHierarchy.node) ? windowHierarchy.node : [windowHierarchy.node])
      : [windowHierarchy];

    for (const rootNode of windowRoots) {
      if (traverseForSystemTray(rootNode)) {
        return true;
      }
    }
  }

  return false;
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

  // Open system tray handler
  const openSystemTrayHandler = async (device: BootedDevice, args: OpenSystemTrayArgs, progress?: ProgressCallback) => {
    try {
      if (args.platform === "android") {
        const observeScreen = new ObserveScreen(device);
        const observation = await observeScreen.execute();

        if (isSystemTrayOpen(observation.viewHierarchy)) {
          return createJSONToolResponse({
            message: "System tray already open; no swipe needed",
            observation,
            success: true,
            skipped: true
          });
        }
      }

      const swipeOn = new SwipeOn(device);

      const options: import("../models").SwipeOnOptions = {
        direction: "down",
        includeSystemInsets: true, // to access status bar area
        duration: 100
      };

      const result = await swipeOn.execute(options, progress);

      return createJSONToolResponse({
        message: "Opened system tray by swiping down from the status bar",
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to open system tray: ${error}`);
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
    "openSystemTray",
    "Open system notification tray",
    openSystemTraySchema,
    openSystemTrayHandler,
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
