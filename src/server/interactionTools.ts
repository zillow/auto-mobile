import { z } from "zod";
import { ToolRegistry, ProgressCallback } from "./toolRegistry";
import { TapOnElement } from "../features/action/TapOnElement";
import { InputText } from "../features/action/InputText";
import { ClearText } from "../features/action/ClearText";
import { SelectAllText } from "../features/action/SelectAllText";
import { PressButton } from "../features/action/PressButton";
import { SwipeOnElement } from "../features/action/SwipeOnElement";
import { SwipeOnScreen } from "../features/action/SwipeOnScreen";
import { Shake } from "../features/action/Shake";
import { ImeAction } from "../features/action/ImeAction";
import { RecentApps } from "../features/action/RecentApps";
import { HomeScreen } from "../features/action/HomeScreen";
import { Rotate } from "../features/action/Rotate";
import { ElementUtils } from "../features/utility/ElementUtils";
import { ObserveScreen } from "../features/observe/ObserveScreen";
import { OpenURL } from "../features/action/OpenURL";
import { ActionableError, BootedDevice } from "../models";
import { createJSONToolResponse } from "../utils/toolUtils";
import { logger } from "../utils/logger";
import { Platform } from "../models";

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
  containerElementId?: string;
  text?: string;
  id?: string;
  action: "tap" | "doubleTap" | "longPress" | "focus";
  platform: Platform;
}

export interface SwipeOnScreenArgs {
  direction: "up" | "down" | "left" | "right";
  includeSystemInsets: boolean;
  duration: number;
  platform: Platform;
}

export interface SwipeOnElementArgs {
  containerElementId?: string;
  elementId: string;
  direction: "up" | "down" | "left" | "right";
  duration: number;
  platform: Platform;
}

export interface ScrollArgs {
  containerElementId: string;
  direction: "up" | "down" | "left" | "right";
  lookFor?: ScrollLookForArgs;
  speed?: "slow" | "normal" | "fast";
  platform: Platform;
}

export interface ScrollLookForArgs {
  elementId?: string;
  text?: string;
  maxTime?: number;
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
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const tapOnSchema = z.object({
  containerElementId: z.string().optional().describe("Container element ID to restrict the search within"),
  action: z.enum(["tap", "doubleTap", "longPress", "focus"]).describe("Action to perform on the element"),
  text: z.string().optional().describe("Text to tap on"),
  id: z.string().optional().describe("Element ID to tap on"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const swipeOnElementSchema = z.object({
  containerElementId: z.string().optional().describe("Container element ID to restrict the search within"),
  elementId: z.string().describe("ID of the element to swipe on"),
  direction: z.enum(["up", "down", "left", "right"]).describe("Direction to swipe"),
  duration: z.number().describe("Duration of the swipe in milliseconds"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const swipeOnScreenSchema = z.object({
  direction: z.enum(["up", "down", "left", "right"]).describe("Direction to swipe"),
  includeSystemInsets: z.boolean().describe("Whether to include system inset areas in the swipe"),
  duration: z.number().describe("Duration of the swipe in milliseconds"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const dragAndDropSchema = z.object({
  from: z.object({
    index: z.number().describe("Index of the source element to drag"),
    text: z.string().optional().describe("Optional text for validation and debugging")
  }).describe("Source element to drag from"),
  to: z.object({
    index: z.number().describe("Index of the destination element to drop to"),
    text: z.string().optional().describe("Optional text for validation and debugging")
  }).describe("Destination element to drop to"),
  duration: z.number().optional().describe("Duration of the drag in milliseconds (default: 500)"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const scrollSchema = z.object({
  containerElementId: z.string().describe("Element ID to scroll until visible"),
  direction: z.enum(["up", "down", "left", "right"]).describe("Scroll direction"),
  lookFor: z.object({
    elementId: z.string().optional().describe("ID of the element to look for while scrolling"),
    text: z.string().optional().describe("Optional text to look for while scrolling"),
    maxTime: z.number().optional().describe("Maximum amount of time to spend scrolling, (default 10 seconds)")
  }).optional().describe("What we're searching for while scrolling"),
  speed: z.enum(["slow", "normal", "fast"]).optional().describe("Scroll speed"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const clearTextSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const selectAllTextSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const pressButtonSchema = z.object({
  button: z.enum(["home", "back", "menu", "power", "volume_up", "volume_down", "recent"])
    .describe("The button to press"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const openSystemTraySchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const pressKeySchema = z.object({
  key: z.enum(["home", "back", "menu", "power", "volume_up", "volume_down", "recent"])
    .describe("The key to press"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const stopAppSchema = z.object({
  appId: z.string().describe("App package ID to stop"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const clearStateSchema = z.object({
  appId: z.string().describe("App package ID to clear state for"),
  clearKeychain: z.boolean().optional().describe("Also clear iOS keychain (iOS only)"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const inputTextSchema = z.object({
  text: z.string().describe("Text to input to the device"),
  imeAction: z.enum(["done", "next", "search", "send", "go", "previous"]).optional()
    .describe("Optional IME action to perform after text input"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const openLinkSchema = z.object({
  url: z.string().describe("URL to open in the default browser"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const imeActionSchema = z.object({
  action: z.enum(["done", "next", "search", "send", "go", "previous"]).describe("IME action to perform"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const recentAppsSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const homeScreenSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

export const rotateSchema = z.object({
  orientation: z.enum(["portrait", "landscape"]).describe("The orientation to set"),
  platform: z.enum(["android", "ios"]).describe("Platform of the device")
});

// Register tools
export function registerInteractionTools() {
  const elementUtils = new ElementUtils();

  // Tap on handler
  const tapOnHandler = async (device: BootedDevice, args: TapOnArgs, progress?: ProgressCallback) => {
    const tapOnTextCommand = new TapOnElement(device);
    const result = await tapOnTextCommand.execute({
      containerElementId: args.containerElementId,
      text: args.text,
      elementId: args.id,
      action: args.action,
    }, progress);

    return createJSONToolResponse({
      message: `Tapped on element`,
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

  // Swipe on element handler
  const swipeOnElementHandler = async (device: BootedDevice, args: SwipeOnElementArgs, progress?: ProgressCallback) => {
    try {
      // Validate element ID format
      const elementId = args.elementId;

      // Check if the elementId looks like coordinate bounds instead of a resource ID
      const boundsPattern = /^\[\d+,\d+\]\[\d+,\d+\]$/;
      if (boundsPattern.test(elementId)) {
        throw new ActionableError(
          `Invalid element ID: "${elementId}" appears to be coordinate bounds. ` +
          `Please provide a proper Android resource ID (e.g., "com.example.app:id/button") ` +
          `or use swipeOnScreen with coordinates instead.`
        );
      }

      // Check if elementId is empty or just whitespace
      if (!elementId || elementId.trim().length === 0) {
        throw new ActionableError("Element ID cannot be empty. Please provide a valid Android resource ID.");
      }

      const observeScreen = new ObserveScreen(device);
      const swipeOnElement = new SwipeOnElement(device);

      // First observe to find the element
      const observeResult = await observeScreen.execute();
      if (!observeResult.viewHierarchy) {
        throw new ActionableError("Could not get view hierarchy to find element for swipe.");
      }

      const element = elementUtils.findElementByResourceId(
        observeResult.viewHierarchy,
        elementId,
        args.containerElementId, // Search within the specific container
        true // partial match
      );

      if (!element) {
        // Provide helpful suggestions
        const allResourceIds: string[] = [];
        const rootNodes = elementUtils.extractRootNodes(observeResult.viewHierarchy);

        for (const rootNode of rootNodes) {
          elementUtils.traverseNode(rootNode, (node: any) => {
            const nodeProperties = elementUtils.extractNodeProperties(node);
            if (nodeProperties["resource-id"] && nodeProperties["resource-id"].trim()) {
              allResourceIds.push(nodeProperties["resource-id"]);
            }
          });
        }

        const uniqueResourceIds = [...new Set(allResourceIds)].slice(0, 5); // Show first 5 unique IDs
        const suggestion = uniqueResourceIds.length > 0
          ? ` Available resource IDs include: ${uniqueResourceIds.join(", ")}`
          : " No elements with resource IDs found on current screen.";

        throw new ActionableError(
          `Element not found with ID "${elementId}".${suggestion} ` +
          `Use the 'observe' command to see the current view hierarchy and find valid element IDs.`
        );
      }

      const result = await swipeOnElement.execute(
        element,
        args.direction,
        { duration: args.duration ?? 100 },
        progress
      );

      return createJSONToolResponse({
        message: `Swiped ${args.direction} on element with ID "${elementId}"`,
        observation: result.observation
      });
    } catch (error) {
      throw new ActionableError(`Failed to swipe on element: ${error}`);
    }
  };

  // Swipe on screen handler
  const swipeOnScreenHandler = async (device: BootedDevice, args: SwipeOnScreenArgs, progress?: ProgressCallback) => {
    try {
      const swipeOnScreen = new SwipeOnScreen(device);

      const result = await swipeOnScreen.execute(
        args.direction,
        {
          duration: args.duration ?? 100,
          includeSystemInsets: args.includeSystemInsets
        },
        progress
      );

      return createJSONToolResponse({
        message: `Swiped ${args.direction} on screen${args.includeSystemInsets ? " including navigation areas" : ""}`,
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to swipe on screen: ${error}`);
    }
  };

  // Open system tray handler
  const openSystemTrayHandler = async (device: BootedDevice, args: OpenSystemTrayArgs, progress?: ProgressCallback) => {
    try {
      const swipeOnScreen = new SwipeOnScreen(device);

      const result = await swipeOnScreen.execute(
        "down",
        {
          duration: 100,
          includeSystemInsets: true // to access status bar area
        },
        progress
      );

      return createJSONToolResponse({
        message: "Opened system tray by swiping down from the status bar",
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to open system tray: ${error}`);
    }
  };

  // Scroll handler
  const scrollHandler = async (device: BootedDevice, args: ScrollArgs, progress?: ProgressCallback) => {
    // Element-specific scrolling
    const observeScreen = new ObserveScreen(device);
    const swipe = new SwipeOnElement(device);
    const observeResult = await observeScreen.execute();

    if (!observeResult.viewHierarchy) {
      throw new ActionableError("Could not get view hierarchy for element scrolling");
    }

    // Find the element by resource ID
    const element = elementUtils.findElementByResourceId(
      observeResult.viewHierarchy,
      args.containerElementId,
      args.containerElementId,
      true // partial match
    );

    if (!element) {
      throw new ActionableError(`Container element not found with ID: ${args.containerElementId}`);
    }

    const containerElement = element;

    if (!args.lookFor) {
      const duration = elementUtils.getSwipeDurationFromSpeed(args.speed);
      const result = await swipe.execute(
        containerElement,
        elementUtils.getSwipeDirectionForScroll(args.direction), {
          duration: duration,
          easing: "accelerateDecelerate",
          fingers: 1,
          randomize: false,
          lift: true,
          pressure: 1
        },
        progress
      );

      return createJSONToolResponse({
        message: `Scrolled ${args.direction} within element ${args.containerElementId}`,
        observation: result.observation
      });

    } else if (!args.lookFor.text && !args.lookFor.elementId) {
      throw new ActionableError("Either text or element id must be specified to look for something in a scrollable list.");
    } else {
      let lastObservation = await observeScreen.execute();
      if (!lastObservation.viewHierarchy || !lastObservation.screenSize) {
        throw new Error("Failed to get initial observation for scrolling until visible.");
      }

      const direction = args.direction;
      const maxTime = 120000; // args.lookFor.maxTime ?? 120000;
      const startTime = Date.now();
      let foundElement = null;

      while (Date.now() - startTime < maxTime) {
        // Re-observe the screen to get current state
        lastObservation = await observeScreen.execute();
        if (!lastObservation.viewHierarchy) {
          throw new Error("Lost observation during scroll until visible.");
        }

        // Check if target element is now visible
        if (args.lookFor.text) {
          foundElement = elementUtils.findElementByText(
            lastObservation.viewHierarchy,
            args.lookFor.text,
            args.containerElementId, // Search within the specific container
            true, // fuzzy match
            false // case-sensitive
          );
        } else if (args.lookFor.elementId) {
          foundElement = elementUtils.findElementByResourceId(
            lastObservation.viewHierarchy,
            args.lookFor.elementId,
            args.containerElementId, // Search within the specific container
            true // partial match
          );
        }

        if (foundElement) {
          logger.info(`Found element after scrolling for ${Date.now() - startTime}ms.`);
          break;
        }

        // Use the specific container element to swipe, not any scrollable element
        const result = await swipe.execute(
          containerElement,
          elementUtils.getSwipeDirectionForScroll(direction),
          { duration: 600 },
          progress
        );

        // Update observation from swipe result
        if (result.observation && result.observation.viewHierarchy) {
          lastObservation = result.observation;
        } else {
          throw new Error("Lost observation after swipe during scroll until visible.");
        }
      }

      if (!foundElement) {
        const target = args.lookFor.text ? `text "${args.lookFor.text}"` : `element with id "${args.lookFor.elementId}"`;
        throw new ActionableError(`${target} not found after scrolling for ${maxTime}ms.`);
      }

      const target = args.lookFor.text ? `text "${args.lookFor.text}"` : `element with id "${args.lookFor.elementId}"`;
      return createJSONToolResponse({
        message: `Scrolled until ${target} became visible`,
        found: !!foundElement,
        observation: lastObservation
      });
    }
  };

  // Press key handler
  const pressKeyHandler = async (device: BootedDevice, args: PressKeyArgs, progress?: ProgressCallback) => {
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
    "swipeOnElement",
    "Swipe on a specific element",
    swipeOnElementSchema,
    swipeOnElementHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "swipeOnScreen",
    "Swipe on screen in a specific direction",
    swipeOnScreenSchema,
    swipeOnScreenHandler,
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
    "Tap supporting text or resourceId",
    tapOnSchema,
    tapOnHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "scroll",
    "Scroll in a direction on a scrollable container, optionally to find an element (supports text and selectors)",
    scrollSchema,
    scrollHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "swipe",
    "Unified scroll command supporting direction and speed (no index support due to reliability)",
    scrollSchema,
    scrollHandler,
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
