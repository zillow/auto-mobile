import { z } from "zod";
import { ToolRegistry, ProgressCallback } from "./toolRegistry";
import { TapOnElement } from "../features/action/TapOnElement";
import { InputText } from "../features/action/InputText";
import { ClearText } from "../features/action/ClearText";
import { SelectAllText } from "../features/action/SelectAllText";
import { PressButton } from "../features/action/PressButton";
import { DragAndDrop } from "../features/action/DragAndDrop";
import { SwipeOn } from "../features/action/swipeon";
import { PinchOn } from "../features/action/PinchOn";
import { Shake } from "../features/action/Shake";
import { ImeAction } from "../features/action/ImeAction";
import { RecentApps } from "../features/action/RecentApps";
import { HomeScreen } from "../features/action/HomeScreen";
import { Rotate } from "../features/action/Rotate";
import { OpenURL } from "../features/action/OpenURL";
import { Clipboard } from "../features/action/Clipboard";
import { Keyboard } from "../features/action/Keyboard";
import {
  ActionableError,
  BootedDevice,
} from "../models";
import { ListInstalledApps } from "../features/observe/ListInstalledApps";
import { createJSONToolResponse, createStructuredToolResponse } from "../utils/toolUtils";
import { resolveSwipeDirection } from "../utils/swipeOnUtils";
import { RecompositionTracker } from "../features/performance/RecompositionTracker";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import {
  createElementIdTextSelectorSchema,
  elementContainerSchema,
  elementIdTextFieldsSchema,
  elementSelectionStrategySchema,
  validateElementIdTextSelector
} from "./elementSelectorSchemas";
import {
  elementSchema,
  observationSummarySchema,
  scrollableCandidateSchema,
  selectedElementSchema
} from "./toolOutputSchemas";

// Import from extracted modules
import type {
  ClearTextArgs,
  SelectAllTextArgs,
  PressButtonArgs,
  SystemTrayNotificationArgs,
  SystemTrayArgs,
  PressKeyArgs,
  InputTextArgs,
  OpenLinkArgs,
  TapOnArgs,
  DragAndDropArgs,
  SwipeOnArgs,
  PinchOnArgs,
  ShakeArgs,
  ImeActionArgs,
  KeyboardArgs,
  RecentAppsArgs,
  RotateArgs,
  ClipboardArgs,
} from "./interactionToolTypes";

import {
  SystemTrayObserver,
  SystemTrayAdb,
  SystemTrayDependencies,
  setSystemTrayDependencies,
  resetSystemTrayDependencies,
  getSystemTrayDependencies,
  waitForNotificationMatch,
  resolveSystemTrayAwaitTimeout,
  ensureSystemTrayOpen,
  resolveNotificationTapElement,
  resolveNotificationSwipeElement,
  tapElementWithAdb,
  swipeElementWithAdb,
  resolveAppLabel,
  SYSTEM_TRAY_CLEAR_MAX_ITERATIONS,
  SYSTEM_TRAY_NOTIFICATION_SWIPE_DURATION_MS,
} from "./systemTrayHelpers";

// Re-export types for backward compatibility
export type {
  ClearTextArgs,
  SelectAllTextArgs,
  PressButtonArgs,
  SystemTrayNotificationArgs,
  SystemTrayArgs,
  PressKeyArgs,
  InputTextArgs,
  OpenLinkArgs,
  TapOnArgs,
  DragAndDropArgs,
  SwipeOnArgs,
  PinchOnArgs,
  ShakeArgs,
  ImeActionArgs,
  KeyboardArgs,
  RecentAppsArgs,
  RotateArgs,
  ClipboardArgs,
};

// Re-export system tray helpers for backward compatibility
export type {
  SystemTrayObserver,
  SystemTrayAdb,
  SystemTrayDependencies,
};

export {
  setSystemTrayDependencies,
  resetSystemTrayDependencies,
  waitForNotificationMatch,
};

// ============================================================================
// Schema Definitions
// ============================================================================

export const shakeSchema = addDeviceTargetingToSchema(z.object({
  duration: z.number().optional().describe("Shake duration in ms (default: 1000)"),
  intensity: z.number().optional().describe("Shake acceleration intensity (default: 100)"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const keyboardSchema = addDeviceTargetingToSchema(z.object({
  action: z.enum(["open", "close", "detect"]).describe("Keyboard action"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

const tapOnBaseSchema = z.object({
  container: elementContainerSchema.optional().describe(
    "Container selector object to scope search. Provide { \"elementId\": \"<id>\" } or { \"text\": \"<text>\" }."
  ),
  action: z.enum(["tap", "doubleTap", "longPress", "focus"]).describe("Action type"),
  selectionStrategy: elementSelectionStrategySchema.optional().describe(
    "Element selection strategy when multiple matches are found (default: first)"
  ),
  duration: z.number().optional().describe("Long press duration (ms)"),
  searchUntil: z.object({
    duration: z.number().min(100).max(12000).optional().describe("Polling duration (ms, default: 500)"),
  }).optional().describe("Poll for element before tapping"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}).strict();

const tapOnSelectorSchema = addDeviceTargetingToSchema(
  tapOnBaseSchema.extend(elementIdTextFieldsSchema.shape).strict()
);

export const tapOnSchema = tapOnSelectorSchema.superRefine((value, ctx) => {
  validateElementIdTextSelector(value, ctx);
});

const tapOnResultSchema = z.object({
  success: z.boolean(),
  action: z.enum(["tap", "doubleTap", "longPress", "focus"]),
  message: z.string().optional(),
  element: elementSchema.optional(),
  observation: observationSummarySchema.optional(),
  selectedElement: selectedElementSchema.optional(),
  selectedElements: z.array(selectedElementSchema).optional(),
  error: z.string().optional(),
  pressRecognized: z.boolean().optional(),
  contextMenuOpened: z.boolean().optional(),
  selectionStarted: z.boolean().optional(),
  searchUntil: z.object({
    durationMs: z.number().int(),
    requestCount: z.number().int(),
    changeCount: z.number().int()
  }).partial().optional(),
  debug: z.any().optional()
}).passthrough();

const swipeOnResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  warning: z.string().optional(),
  scrollableCandidates: z.array(scrollableCandidateSchema).optional(),
  targetType: z.enum(["screen", "element"]),
  element: elementSchema.optional(),
  x1: z.number().int(),
  y1: z.number().int(),
  x2: z.number().int(),
  y2: z.number().int(),
  duration: z.number().int(),
  easing: z.enum(["linear", "decelerate", "accelerate", "accelerateDecelerate"]).optional(),
  path: z.number().optional(),
  found: z.boolean().optional(),
  scrollIterations: z.number().int().optional(),
  elapsedMs: z.number().int().optional(),
  hierarchyChanged: z.boolean().optional(),
  observation: observationSummarySchema.optional(),
  a11yTotalTimeMs: z.number().int().optional(),
  a11yGestureTimeMs: z.number().int().optional(),
  fallbackReason: z.string().optional(),
  debug: z.any().optional()
}).passthrough();

const dragAndDropSelectorSchema = (label: "Source" | "Target") =>
  createElementIdTextSelectorSchema({
    elementId: `${label} ID`,
    text: `${label} text`
  }).describe(`${label} element`);

const swipeOnLookForSchema = createElementIdTextSelectorSchema({
  elementId: "ID of the element to look for",
  text: "Text to look for"
});

export const dragAndDropSchema = addDeviceTargetingToSchema(z.object({
  source: dragAndDropSelectorSchema("Source"),
  target: dragAndDropSelectorSchema("Target"),
  pressDurationMs: z.number().min(600).max(3000).optional().describe(
    "Press duration ms (min: 600, max: 3000, default: 600)"
  ),
  dragDurationMs: z.number().min(300).max(1000).optional().describe(
    "Drag duration ms (min: 300, max: 1000, default: 300)"
  ),
  holdDurationMs: z.number().min(100).max(3000).optional().describe(
    "Hold duration ms (min: 100, max: 3000, default: 100)"
  ),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const swipeOnSchema = addDeviceTargetingToSchema(z.object({
  includeSystemInsets: z.boolean().optional().describe("Use full screen including status/nav bars"),
  container: elementContainerSchema.optional().describe(
    "Container selector object to scope search. Provide { \"elementId\": \"<id>\" } or { \"text\": \"<text>\" }."
  ),
  autoTarget: z.boolean().optional().describe("Auto-target scrollable containers (default: true)"),
  direction: z.enum(["up", "down", "left", "right"]).describe("Swipe/scroll direction"),
  gestureType: z.enum(["swipeFingerTowardsDirection", "scrollTowardsDirection"]).optional()
    .describe("swipeFingerTowardsDirection: finger moves in direction (e.g., 'up' = finger up = content scrolls down). scrollTowardsDirection: content moves in direction (e.g., 'up' = content up = see content below). Default: scrollTowardsDirection."),
  lookFor: swipeOnLookForSchema.optional().describe("Element to look for during swipe"),
  boomerang: z.boolean().optional().describe("Return to start position after swipe apex"),
  apexPause: z.number().min(0).max(3000).optional().describe("Pause duration at swipe apex in ms (0-3000)"),
  returnSpeed: z.number().min(0.1).max(3.0).optional().describe("Speed multiplier for return swipe (0.1-3.0)"),
  speed: z.enum(["slow", "normal", "fast"]).optional().describe("Swipe speed preset"),
  platform: z.enum(["android", "ios"]).describe("Platform")
}));

export const pinchOnSchema = addDeviceTargetingToSchema(z.object({
  direction: z.enum(["in", "out"]).describe("Pinch direction"),
  distanceStart: z.number().optional().describe("Initial finger distance (px, default: 400)"),
  distanceEnd: z.number().optional().describe("Final finger distance (px, default: 100)"),
  scale: z.number().optional().describe("Scale factor (overrides distances)"),
  duration: z.number().optional().describe("Gesture duration (ms)"),
  rotationDegrees: z.number().optional().describe("Rotation during pinch (degrees)"),
  includeSystemInsets: z.boolean().optional().describe("Use full screen including status/nav bars"),
  container: elementContainerSchema.optional().describe(
    "Container selector object to scope search. Provide { \"elementId\": \"<id>\" } or { \"text\": \"<text>\" }."
  ),
  autoTarget: z.boolean().optional().describe("Auto-target pinchable containers"),
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
  title: z.string().optional().describe("Notification title to match"),
  body: z.string().optional().describe("Notification body to match"),
  appId: z.string().optional().describe("App package ID to match"),
  tapActionLabel: z.string().optional().describe("Action button label to tap (for 'tap' action)")
});

const systemTraySchemaBase = z.object({
  action: z.enum(["open", "find", "tap", "dismiss", "clearAll"]).describe(
    "Action: open=expand tray, find=search for notification, tap=tap notification, dismiss=swipe away, clearAll=dismiss all for app"
  ),
  notification: systemTrayNotificationSchema.optional().describe("Notification criteria to match"),
  awaitTimeout: z.number().optional().describe("Timeout in ms to wait for notification (default: 5000)"),
  platform: z.enum(["android", "ios"]).describe("Platform")
});

export const systemTraySchema = addDeviceTargetingToSchema(systemTraySchemaBase).superRefine((value, ctx) => {
  const notification = value.notification ?? {};

  if (value.action === "open") {
    return;
  }

  const hasCriteria = notification.title || notification.body || notification.appId;
  if (!hasCriteria) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${value.action} action requires at least one notification criteria (title, body, or appId)`
    });
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

// ============================================================================
// Tool Registration
// ============================================================================

export function registerInteractionTools() {
  // Tap on handler
  const tapOnHandler = async (device: BootedDevice, args: TapOnArgs, progress?: ProgressCallback) => {
    RecompositionTracker.getInstance().recordInteraction();
    const tapOnTextCommand = new TapOnElement(device);
    const result = await tapOnTextCommand.execute({
      container: args.container,
      text: args.text,
      elementId: args.elementId,
      selectionStrategy: args.selectionStrategy,
      action: args.action,
      duration: args.duration,
      searchUntil: args.searchUntil,
    }, progress);

    const searchStats = result.searchUntil;
    const freshness = result.observation?.freshness;
    const hasFreshnessTimestamp = typeof freshness?.requestedAfter === "number"
      && typeof freshness?.actualTimestamp === "number";
    const hasConfirmedFreshObservation = hasFreshnessTimestamp
      && freshness.actualTimestamp >= freshness.requestedAfter;
    const shouldIncludeSearchSummary = Boolean(searchStats)
      && (
        searchStats.requestCount > 0
        || searchStats.changeCount > 0
        || (Boolean(args.searchUntil) && hasConfirmedFreshObservation)
      );
    const searchSummary = shouldIncludeSearchSummary && searchStats
      ? `${searchStats.changeCount} view hierarchy changes over ${searchStats.requestCount} requests within ${searchStats.durationMs}ms`
      : undefined;

    return createStructuredToolResponse({
      message: searchSummary ? `Tapped on element (${searchSummary})` : "Tapped on element",
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
      pressDurationMs: args.pressDurationMs,
      dragDurationMs: args.dragDurationMs,
      holdDurationMs: args.holdDurationMs
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

      const awaitTimeoutMs = resolveSystemTrayAwaitTimeout(args.awaitTimeout);

      if (args.action === "open") {
        const result = await ensureSystemTrayOpen(device, awaitTimeoutMs, progress);
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
        const { observeScreenFactory } = getSystemTrayDependencies();
        const observeScreen = observeScreenFactory(device);
        const nextObservation = await observeScreen.execute();

        return createJSONToolResponse({
          message: notification.tapActionLabel
            ? `Tapped notification action "${notification.tapActionLabel}"`
            : "Tapped notification",
          match: match.match.matches,
          tapTarget: {
            text: tapMatch.text,
            matchType: tapMatch.matchType,
            bounds: tapMatch.element.bounds
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
          throw new ActionableError("No swipeable notification element was resolved within the matched notification.");
        }

        await swipeElementWithAdb(device, swipeElement);
        const { observeScreenFactory } = getSystemTrayDependencies();
        const observeScreen = observeScreenFactory(device);
        const nextObservation = await observeScreen.execute();

        return createJSONToolResponse({
          message: "Dismissed notification",
          match: match.match.matches,
          observation: nextObservation,
          success: true
        });
      }

      if (args.action === "clearAll") {
        let dismissed = 0;
        const { timer } = getSystemTrayDependencies();

        for (let i = 0; i < SYSTEM_TRAY_CLEAR_MAX_ITERATIONS; i++) {
          const { match } = await waitForNotificationMatch(
            device,
            notification,
            appMatchTexts,
            500,
            progress
          );

          if (!match) {
            break;
          }

          const swipeElement = resolveNotificationSwipeElement(match, notification, appMatchTexts);
          if (!swipeElement) {
            break;
          }

          await swipeElementWithAdb(device, swipeElement);
          dismissed++;
          await timer.sleep(SYSTEM_TRAY_NOTIFICATION_SWIPE_DURATION_MS + 100);
        }

        const { observeScreenFactory } = getSystemTrayDependencies();
        const observeScreen = observeScreenFactory(device);
        const nextObservation = await observeScreen.execute();

        return createJSONToolResponse({
          message: dismissed > 0
            ? `Cleared ${dismissed} notification(s) for ${notification.appId}`
            : `No notifications found for ${notification.appId}`,
          dismissedCount: dismissed,
          observation: nextObservation,
          success: true
        });
      }

      throw new ActionableError(`Unknown systemTray action: ${args.action}`);
    } catch (error) {
      if (error instanceof ActionableError) {
        throw error;
      }
      throw new ActionableError(`systemTray failed: ${error}`);
    }
  };

  // Swipe on handler
  const swipeOnHandler = async (device: BootedDevice, args: SwipeOnArgs, progress?: ProgressCallback) => {
    RecompositionTracker.getInstance().recordInteraction();
    const swipeOn = new SwipeOn(device);
    const resolvedDirection = resolveSwipeDirection(args.direction, args.gestureType);
    const result = await swipeOn.execute({
      container: args.container,
      autoTarget: args.autoTarget ?? true,
      direction: resolvedDirection,
      lookFor: args.lookFor,
      speed: args.speed,
      includeSystemInsets: args.includeSystemInsets ?? false,
      boomerang: args.boomerang,
      apexPause: args.apexPause,
      returnSpeed: args.returnSpeed
    }, progress);

    return createStructuredToolResponse({
      message: result.found
        ? `Swiped ${args.direction} and found element after ${result.scrollIterations ?? 1} swipe(s)`
        : `Swiped ${args.direction}`,
      observation: result.observation,
      ...result
    });
  };

  // Pinch on handler
  const pinchOnHandler = async (device: BootedDevice, args: PinchOnArgs, progress?: ProgressCallback) => {
    RecompositionTracker.getInstance().recordInteraction();
    const pinchOn = new PinchOn(device);
    const result = await pinchOn.execute({
      direction: args.direction,
      distanceStart: args.distanceStart,
      distanceEnd: args.distanceEnd,
      scale: args.scale,
      duration: args.duration,
      rotationDegrees: args.rotationDegrees,
      includeSystemInsets: args.includeSystemInsets,
      container: args.container,
      autoTarget: args.autoTarget
    }, progress);

    return createJSONToolResponse({
      message: `Pinched ${args.direction}`,
      observation: result.observation,
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

  // Keyboard handler
  const keyboardHandler = async (device: BootedDevice, args: KeyboardArgs) => {
    try {
      const keyboard = new Keyboard(device);
      const result = await keyboard.execute(args.action);

      return createJSONToolResponse(result);
    } catch (error) {
      throw new ActionableError(`Failed to execute keyboard ${args.action}: ${error}`);
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
    "Tap UI elements by text or ID (returns selectedElement metadata)",
    tapOnSchema,
    tapOnHandler,
    true, // Supports progress notifications
    false,
    { outputSchema: tapOnResultSchema }
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
    true, // Supports progress notifications
    false,
    { outputSchema: swipeOnResultSchema }
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
    "keyboard",
    "Open, close, or detect the on-screen keyboard",
    keyboardSchema,
    keyboardHandler,
    false // Does not support progress notifications
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
