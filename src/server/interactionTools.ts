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
import { ActionableError, BootedDevice, ViewHierarchyResult } from "../models";
import { serverConfig } from "../utils/ServerConfig";
import { ObserveScreen } from "../features/observe/ObserveScreen";
import { createJSONToolResponse } from "../utils/toolUtils";
import { Platform } from "../models";
import { resolveSwipeDirection } from "../utils/swipeOnUtils";
import { RecompositionTracker } from "../features/performance/RecompositionTracker";
import { DEVICE_LABEL_DESCRIPTION } from "./toolSchemaHelpers";

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
  action: "tap" | "doubleTap" | "longPress" | "longPressDrag" | "focus";
  duration?: number;
  dragTo?: {
    x?: number;
    y?: number;
    text?: string;
    elementId?: string;
  };
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

// Schema definitions for tool arguments
export const shakeSchema = z.object({
  duration: z.number().optional().describe("Duration of the shake in milliseconds (default: 1000)"),
  intensity: z.number().optional().describe("Intensity of the shake acceleration (default: 100)"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

const tapOnContainerSchema = z.object({
  elementId: z.string().optional().describe("Container element resource ID to restrict search within"),
  text: z.string().optional().describe("Container element text to restrict search within")
}).superRefine((value, ctx) => {
  if (!value.elementId && !value.text) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "container must include elementId or text"
    });
  }
});

export const tapOnSchema = z.object({
  container: tapOnContainerSchema.optional().describe(
    "Container element to scope the search. Provide elementId or text to locate it."
  ),
  action: z.enum(["tap", "doubleTap", "longPress", "longPressDrag", "focus"]).describe("Action to perform on the element"),
  text: z.string().optional().describe("Text to tap on. Takes precedence over id if both are provided."),
  id: z.string().optional().describe("Element ID to tap on. Ignored when text is provided."),
  duration: z.number().optional().describe("Long press duration in milliseconds"),
  dragTo: z.object({
    x: z.number().optional().describe("Drag target X coordinate"),
    y: z.number().optional().describe("Drag target Y coordinate"),
    text: z.string().optional().describe("Text of the drag target element"),
    elementId: z.string().optional().describe("Element ID of the drag target element"),
  }).optional().describe("Drag target for long press drag action"),
  await: z.object({
    element: z.object({
      id: z.string().optional().describe("Wait for element with this resource ID"),
      text: z.string().optional().describe("Wait for element with this text"),
    }).describe("Element to wait for after tap"),
    timeout: z.number().optional().describe("Max wait time in ms (default: 5000)"),
  }).optional().describe("Wait for an element to appear after tap"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  // Framework parameters for device management (optional)
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

export const dragAndDropSchema = z.object({
  source: z.object({
    text: z.string().optional().describe("Text of the source element to drag"),
    elementId: z.string().optional().describe("Element ID of the source element to drag")
  }).describe("Source element to drag from"),
  target: z.object({
    text: z.string().optional().describe("Text of the target element to drop onto"),
    elementId: z.string().optional().describe("Element ID of the target element to drop onto")
  }).describe("Target element to drop onto"),
  duration: z.number().optional().describe("Duration of the drag in milliseconds (default: 500)"),
  holdTime: z.number().optional().describe("Hold time before dragging in milliseconds (default: 200)"),
  dropDelay: z.number().optional().describe("Delay after dropping in milliseconds (default: 100)"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

export const swipeOnSchema = z.object({
  includeSystemInsets: z.boolean().optional().describe("Include status/navigation bars in swipes (default false)"),
  container: z.object({
    elementId: z.string().optional().describe("Resource ID of the container element (finds nearest scrollable parent if element is not scrollable)"),
    text: z.string().optional().describe("Text within the container (finds nearest scrollable parent of element containing this text)")
  })
    .refine(
      value => [value.elementId, value.text].filter(Boolean).length === 1,
      "container must specify exactly one of elementId or text"
    )
    .optional()
    .describe(
      "Container element to swipe within. Provide an object with exactly one of elementId or text. " +
      "REQUIRED for scrolling lists (RecyclerView/ScrollView/ListView). Omit only for intentional full-screen swipes."
    ),
  autoTarget: z.boolean().optional().describe("Auto-target a scrollable container when container is omitted (default true). Set to false only if you intend to swipe the entire screen after autoTarget selected a list unexpectedly."),
  direction: z.enum(["up", "down", "left", "right"]).describe(
    `Direction YOUR FINGER moves on the screen.

ASCII guide (finger vs content):
  "up"    = finger up, content moves DOWN, reveals content FROM ABOVE
  "down"  = finger down, content moves UP, reveals content FROM BELOW
  "left"  = finger left, content moves RIGHT, reveals content FROM RIGHT
  "right" = finger right, content moves LEFT, reveals content FROM LEFT

To see more content BELOW: use direction "up".
To see more content ABOVE: use direction "down".`
  ),
  gestureType: z.enum(["swipeFingerTowardsDirection", "scrollTowardsDirection"]).optional().describe(
    `Semantic intent: how to interpret the direction parameter.
"swipeFingerTowardsDirection" = finger moves in direction (default)
"scrollTowardsDirection" = content scrolls in direction (finger moves opposite)`
  ),
  lookFor: z.object({
    elementId: z.string().optional().describe("ID of the element to look for"),
    text: z.string().optional().describe("Text to look for"),
  }).optional().describe("Swipe until we find a match"),
  speed: z.enum(["slow", "normal", "fast"]).optional().describe("Scroll speed"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  // Framework parameters for device management (optional)
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

export const pinchOnSchema = z.object({
  direction: z.enum(["in", "out"]).describe("Pinch direction (in = zoom out, out = zoom in)"),
  distanceStart: z.number().optional().describe("Starting distance between fingers in pixels"),
  distanceEnd: z.number().optional().describe("Ending distance between fingers in pixels"),
  scale: z.number().optional().describe("Scale multiplier applied to distanceStart to compute distanceEnd"),
  duration: z.number().optional().describe("Gesture duration in milliseconds (default: 300)"),
  rotationDegrees: z.number().optional().describe("Rotate fingers by degrees during pinch (positive = clockwise)"),
  includeSystemInsets: z.boolean().optional().describe("Include status/navigation bars in bounds calculation (default false)"),
  container: z.object({
    elementId: z.string().optional().describe("Resource ID of the container element to center within"),
    text: z.string().optional().describe("Text within the container element to center within")
  }).optional().describe("Container element to pinch within; omit for auto-target or full-screen pinch"),
  autoTarget: z.boolean().optional().describe("Auto-target a large, tappable surface when container is omitted (default true)"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

export const clearTextSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

export const selectAllTextSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

export const pressButtonSchema = z.object({
  button: z.enum(["home", "back", "menu", "power", "volume_up", "volume_down", "recent"])
    .describe("The button to press"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

export const openSystemTraySchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

export const pressKeySchema = z.object({
  key: z.enum(["home", "back", "menu", "power", "volume_up", "volume_down", "recent"])
    .describe("The key to press"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

export const stopAppSchema = z.object({
  appId: z.string().describe("App package ID to stop"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

export const clearStateSchema = z.object({
  appId: z.string().describe("App package ID to clear state for"),
  clearKeychain: z.boolean().optional().describe("Also clear iOS keychain (iOS only)"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

export const inputTextSchema = z.object({
  text: z.string().describe("Text to input to the device"),
  imeAction: z.enum(["done", "next", "search", "send", "go", "previous"]).optional()
    .describe("Optional IME action to perform after text input"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

export const openLinkSchema = z.object({
  url: z.string().describe("URL to open in the default browser"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

export const imeActionSchema = z.object({
  action: z.enum(["done", "next", "search", "send", "go", "previous"]).describe("IME action to perform"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

export const recentAppsSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

export const homeScreenSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

export const rotateSchema = z.object({
  orientation: z.enum(["portrait", "landscape"]).describe("The orientation to set"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device"),
  sessionUuid: z.string().optional(),
  deviceId: z.string().optional(),
  device: z.string().optional().describe(DEVICE_LABEL_DESCRIPTION)
});

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
      dragTo: args.dragTo,
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

  // Register with the tool registry
  ToolRegistry.registerDeviceAware(
    "clearText",
    "Clear text from the currently focused input field",
    clearTextSchema,
    clearTextHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "selectAllText",
    "Select all text in the currently focused input field using long press + tap on 'Select All'",
    selectAllTextSchema,
    selectAllTextHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "pressButton",
    "Press a hardware button on the device",
    pressButtonSchema,
    pressButtonHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "openSystemTray",
    "Open the system notification tray by swiping down from the status bar",
    openSystemTraySchema,
    openSystemTrayHandler,
    true // Supports progress notifications
  );

  // Phase 1: Core Command Renames
  ToolRegistry.registerDeviceAware(
    "pressKey",
    "Press a hardware key on the device (Maestro equivalent of pressButton)",
    pressKeySchema,
    pressKeyHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "inputText",
    "Input text to the device",
    inputTextSchema,
    inputTextHandler,
    false // Does not support progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "openLink",
    "Open a URL in the default browser",
    openLinkSchema,
    openLinkHandler,
    false // Does not support progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "tapOn",
    "Tap UI elements by text or resource ID, optionally scoped to a container",
    tapOnSchema,
    tapOnHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "dragAndDrop",
    "Drag an element and drop it onto another element",
    dragAndDropSchema,
    dragAndDropHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "swipeOn",
    "Unified swipe/scroll tool - swipe on screen or elements, with optional scroll-until-visible. IMPORTANT: use container when scrolling lists; omit only for full-screen swipes.",
    swipeOnSchema,
    swipeOnHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "pinchOn",
    "Pinch to zoom in/out on screen or elements using a multi-touch gesture (requires accessibility service)",
    pinchOnSchema,
    pinchOnHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "shake",
    "Shake the device",
    shakeSchema,
    shakeHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "imeAction",
    "Perform an IME action (e.g., done, next, search)",
    imeActionSchema,
    imeActionHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "recentApps",
    "Open the recent apps list",
    recentAppsSchema,
    recentAppsHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "homeScreen",
    "Return to the home screen by pressing the home button",
    homeScreenSchema,
    homeScreenHandler,
    true // Supports progress notifications
  );

  // Register the new rotate tool
  ToolRegistry.registerDeviceAware(
    "rotate",
    "Rotate the device to a specific orientation",
    rotateSchema,
    rotateHandler,
    true // Supports progress notifications
  );
}
