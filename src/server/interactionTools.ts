import { z } from "zod";
import { ToolRegistry, ProgressCallback } from "./toolRegistry";
import { TapOnElement } from "../features/action/TapOnElement";
import { SendText } from "../features/action/SendText";
import { ClearText } from "../features/action/ClearText";
import { SelectAllText } from "../features/action/SelectAllText";
import { PressButton } from "../features/action/PressButton";
import { SwipeOnElement } from "../features/action/SwipeOnElement";
import { SwipeOnScreen } from "../features/action/SwipeOnScreen";
import { SwipeFromElementToElement } from "../features/action/SwipeFromElementToElement";
import { PullToRefresh } from "../features/action/PullToRefresh";
import { Shake } from "../features/action/Shake";
import { ImeAction } from "../features/action/ImeAction";
import { RecentApps } from "../features/action/RecentApps";
import { HomeScreen } from "../features/action/HomeScreen";
import { Rotate } from "../features/action/Rotate";
import { ElementUtils } from "../features/utility/ElementUtils";
import { ObserveScreen } from "../features/observe/ObserveScreen";
import { TerminateApp } from "../features/action/TerminateApp";
import { ClearAppData } from "../features/action/ClearAppData";
import { OpenURL } from "../features/action/OpenURL";
import { ActionableError } from "../models";
import { createJSONToolResponse } from "../utils/toolUtils";
import { logger } from "../utils/logger";

// Type definitions for better TypeScript support
export interface ClearTextArgs {
}

export interface SelectAllTextArgs {
}

export interface PressButtonArgs {
  button: "home" | "back" | "menu" | "power" | "volume_up" | "volume_down" | "recent";
}

export interface OpenSystemTrayArgs {
}

export interface PressKeyArgs {
  key: "home" | "back" | "menu" | "power" | "volume_up" | "volume_down" | "recent";
}

export interface StopAppArgs {
  appId: string;
}

export interface ClearStateArgs {
  appId: string;
  clearKeychain?: boolean;
}

export interface InputTextArgs {
  text: string;
  imeAction?: "done" | "next" | "search" | "send" | "go" | "previous";
}

export interface OpenLinkArgs {
  url: string;
}

export interface TapOnArgs {
  containerElementId: string;
  text?: SearchForTextArgs;
  id?: SearchForIdArgs;
  action: "tap" | "doubleTap" | "longPress" | "focus";
}

export interface SearchForIdArgs {
  id: string;
}

export interface SearchForTextArgs {
  text: string;
  fuzzyMatch: boolean;
  caseSensitive: boolean;
}

export interface SwipeOnScreenArgs {
  direction: "up" | "down" | "left" | "right";
  includeSystemInsets: boolean;
  duration: number;
}

export interface SwipeOnElementArgs {
  containerElementId: string;
  elementId: string;
  direction: "up" | "down" | "left" | "right";
  duration: number;
}

export interface DragAndDropArgs {
  from: {
    index: number;
    text?: string;
  };
  to: {
    index: number;
    text?: string;
  };
  duration?: number;
}

export interface ScrollArgs {
  containerElementId: string;
  direction: "up" | "down" | "left" | "right";
  lookFor?: ScrollLookForArgs;
  speed?: "slow" | "normal" | "fast";
}

export interface ScrollLookForArgs {
  elementId?: string;
  text?: string;
  maxTime?: number;
}

export interface PullToRefreshArgs {
  listId?: string;
}

export interface ShakeArgs {
  duration?: number;
  intensity?: number;
}

export interface ImeActionArgs {
  action: "done" | "next" | "search" | "send" | "go" | "previous";
}

export interface RecentAppsArgs {
}

export interface RotateArgs {
  orientation: "portrait" | "landscape";
}

// Schema definitions for tool arguments
export const shakeSchema = z.object({
  duration: z.number().optional().describe("Duration of the shake in milliseconds (default: 1000)"),
  intensity: z.number().optional().describe("Intensity of the shake acceleration (default: 100)")
});

export const tapOnSchema = z.object({
  containerElementId: z.string().describe("Container element ID to restrict the search within"),
  text: z.object({
    text: z.string().describe("Text to tap on"),
    fuzzyMatch: z.boolean().describe("Use fuzzy text matching"),
    caseSensitive: z.boolean().describe("Use case-sensitive text matching")
  }).optional().describe("Text search parameters"),
  id: z.object({
    id: z.string().describe("Element ID to tap on")
  }).optional().describe("ID search parameters")
});

export const swipeOnElementSchema = z.object({
  containerElementId: z.string().describe("Container element ID to restrict the search within"),
  elementId: z.string().describe("ID of the element to swipe on"),
  direction: z.enum(["up", "down", "left", "right"]).describe("Direction to swipe"),
  duration: z.number().describe("Duration of the swipe in milliseconds")
});

export const swipeOnScreenSchema = z.object({
  direction: z.enum(["up", "down", "left", "right"]).describe("Direction to swipe"),
  includeSystemInsets: z.boolean().describe("Whether to include system inset areas in the swipe"),
  duration: z.number().describe("Duration of the swipe in milliseconds")
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
  duration: z.number().optional().describe("Duration of the drag in milliseconds (default: 500)")
});

export const scrollSchema = z.object({
  containerElementId: z.string().describe("Element ID to scroll until visible"),
  direction: z.enum(["up", "down", "left", "right"]).describe("Scroll direction"),
  lookFor: z.object({
    elementId: z.string().optional().describe("ID of the element to look for while scrolling"),
    text: z.string().optional().describe("Optional text to look for while scrolling"),
    maxTime: z.number().optional().describe("Maximum amount of time to spend scrolling, (default 10 seconds)")
  }).optional().describe("What we're searching for while scrolling"),
  speed: z.enum(["slow", "normal", "fast"]).optional().describe("Scroll speed")
});

export const clearTextSchema = z.object({});

export const selectAllTextSchema = z.object({});

export const pressButtonSchema = z.object({
  button: z.enum(["home", "back", "menu", "power", "volume_up", "volume_down", "recent"])
    .describe("The button to press")
});

export const openSystemTraySchema = z.object({});

export const pressKeySchema = z.object({
  key: z.enum(["home", "back", "menu", "power", "volume_up", "volume_down", "recent"])
    .describe("The key to press")
});

export const stopAppSchema = z.object({
  appId: z.string().describe("App package ID to stop")
});

export const clearStateSchema = z.object({
  appId: z.string().describe("App package ID to clear state for"),
  clearKeychain: z.boolean().optional().describe("Also clear iOS keychain (iOS only)")
});

export const inputTextSchema = z.object({
  text: z.string().describe("Text to input to the device"),
  imeAction: z.enum(["done", "next", "search", "send", "go", "previous"]).optional()
    .describe("Optional IME action to perform after text input")
});

export const openLinkSchema = z.object({
  url: z.string().describe("URL to open in the default browser")
});

export const pullToRefreshSchema = z.object({
  listId: z.string().optional().describe("ID of the list to pull")
});

export const imeActionSchema = z.object({
  action: z.enum(["done", "next", "search", "send", "go", "previous"]).describe("IME action to perform")
});

export const recentAppsSchema = z.object({});

export const homeScreenSchema = z.object({});

export const rotateSchema = z.object({
  orientation: z.enum(["portrait", "landscape"]).describe("The orientation to set")
});

// Helper functions
function parseTarget(args: { text?: string; id?: string }): { type: string; value: any } {
  if (args.text) {
    return { type: "text", value: { text: args.text } };
  }
  if (args.id) {
    return { type: "id", value: { id: args.id } };
  }
  throw new Error("Must specify either text or id");
}

// Register tools
export function registerInteractionTools() {
  const elementUtils = new ElementUtils();

  // Tap on handler
  const tapOnHandler = async (deviceId: string, args: TapOnArgs, progress?: ProgressCallback) => {
    const tapOnTextCommand = new TapOnElement(deviceId);
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
  const clearTextHandler = async (deviceId: string, args: ClearTextArgs, progress?: ProgressCallback) => {
    try {
      const clearText = new ClearText(deviceId);
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
  const selectAllTextHandler = async (deviceId: string, args: SelectAllTextArgs, progress?: ProgressCallback) => {
    try {
      const selectAllText = new SelectAllText(deviceId);
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
  const pressButtonHandler = async (deviceId: string, args: PressButtonArgs, progress?: ProgressCallback) => {
    try {
      const pressButton = new PressButton(deviceId);
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
  const swipeOnElementHandler = async (deviceId: string, args: SwipeOnElementArgs, progress?: ProgressCallback) => {
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

      const observeScreen = new ObserveScreen(deviceId);
      const swipeOnElement = new SwipeOnElement(deviceId);

      // First observe to find the element
      const observeResult = await observeScreen.execute();
      if (!observeResult.viewHierarchy) {
        throw new ActionableError("Could not get view hierarchy to find element for swipe.");
      }

      let element = null;
      const elements = elementUtils.findElementsByResourceId(
        observeResult.viewHierarchy,
        elementId,
        true // partial match
      );
      if (elements.length > 0) {
        element = elements[0];
      }

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
  const swipeOnScreenHandler = async (deviceId: string, args: SwipeOnScreenArgs, progress?: ProgressCallback) => {
    try {
      const swipeOnScreen = new SwipeOnScreen(deviceId);

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

  // Drag and drop handler
  const dragAndDropHandler = async (deviceId: string, args: DragAndDropArgs, progress?: ProgressCallback) => {
    try {
      const swipeFromElementToElement = new SwipeFromElementToElement(deviceId);

      const result = await swipeFromElementToElement.execute(
        args.from,
        args.to,
        { duration: args.duration || 500 },
        progress
      );

      return createJSONToolResponse({
        message: `Dragged from element at index ${args.from.index} to element at index ${args.to.index}`,
        fromElement: result.fromElement,
        toElement: result.toElement,
        observation: result.observation
      });
    } catch (error) {
      throw new ActionableError(`Failed to perform drag and drop: ${error}`);
    }
  };

  // Pull to refresh handler
  const pullToRefreshHandler = async (deviceId: string, args: PullToRefreshArgs, progress?: ProgressCallback) => {
    try {
      const observeScreen = new ObserveScreen(deviceId);
      const pullToRefresh = new PullToRefresh(deviceId);

      const observeResult = await observeScreen.execute();
      if (!observeResult.viewHierarchy || !observeResult.screenSize) {
        throw new ActionableError("Could not get view hierarchy for pull to refresh.");
      }

      let element = null;
      if (args.listId) {
        const elements = elementUtils.findElementsByResourceId(
          observeResult.viewHierarchy,
          args.listId,
          true // partial match
        );
        if (elements.length > 0) {
          element = elements[0];
        }
      } else {
        const scrollables = elementUtils.findScrollableElements(observeResult.viewHierarchy);
        if (scrollables.length > 0) {
          element = scrollables[0];
        }
      }

      if (!element) {
        // Fallback to root element if no specific scrollable is found
        element = elementUtils.parseNodeBounds(observeResult.viewHierarchy.node || observeResult.viewHierarchy); // Get root
        if (!element) {
          throw new ActionableError("Could not find any element for pull-to-refresh.");
        }
      }

      const result = await pullToRefresh.execute(
        element,
        300, // distance
        { duration: 300 },
        progress
      );

      return createJSONToolResponse({
        message: "Performed pull-to-refresh",
        observation: result.observation
      });
    } catch (error) {
      throw new ActionableError(`Failed to perform pull-to-refresh: ${error}`);
    }
  };

  // Open system tray handler
  const openSystemTrayHandler = async (deviceId: string, args: OpenSystemTrayArgs, progress?: ProgressCallback) => {
    try {
      const swipeOnScreen = new SwipeOnScreen(deviceId);

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

  // Pinch to zoom handler
  // const pinchToZoomHandler = async (deviceId: string, args: PinchToZoomArgs) => {
  //   try {
  //     const deviceId = getCurrentDeviceId();
  //     await verifyDeviceIsReady(deviceId);
  //
  //     const pinchToZoom = new PinchToZoom(deviceId);
  //
  //     const result = await pinchToZoom.execute(
  //       args.direction,
  //       args.magnitude,
  //       args.duration,
  //       args.elementId
  //     );
  //
  //     const elementMessage = args.elementId ? ` on element "${args.elementId}"` : "";
  //     return createJSONToolResponse({
  //       message: `Performed pinch ${args.direction} gesture with magnitude ${args.magnitude} pixels${elementMessage}`,
  //       observation: result.observation,
  //       ...result
  //     });
  //   } catch (error) {
  //     throw new ActionableError(`Failed to perform pinch to zoom: ${error}`);
  //   }
  // };

  // Scroll handler
  const scrollHandler = async (deviceId: string, args: ScrollArgs, progress?: ProgressCallback) => {
    // Element-specific scrolling
    const observeScreen = new ObserveScreen(deviceId);
    const swipe = new SwipeOnElement(deviceId);
    const observeResult = await observeScreen.execute();

    if (!observeResult.viewHierarchy) {
      throw new ActionableError("Could not get view hierarchy for element scrolling");
    }

    // Find the element by resource ID
    const elements = elementUtils.findElementsByResourceId(
      observeResult.viewHierarchy,
      args.containerElementId,
      true // partial match
    );

    if (elements.length === 0) {
      throw new ActionableError(`Container element not found with ID: ${args.containerElementId}`);
    }

    const containerElement = elements[0];

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
            "TextView",
            args.containerElementId, // Search within the specific container
            true, // fuzzy match
            false // case-sensitive
          );
        } else if (args.lookFor.elementId) {
          const elements = elementUtils.findElementsByResourceId(
            lastObservation.viewHierarchy,
            args.lookFor.elementId,
            true // partial match
          );
          foundElement = elements.length > 0 ? elements[0] : null;
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
  const pressKeyHandler = async (deviceId: string, args: PressKeyArgs, progress?: ProgressCallback) => {
    const pressButton = new PressButton(deviceId);
    const result = await pressButton.execute(args.key, progress);

    return createJSONToolResponse({
      message: `Pressed key ${args.key}`,
      observation: result.observation,
      ...result
    });
  };

  // Stop app handler
  const stopAppHandler = async (deviceId: string, args: StopAppArgs, progress?: ProgressCallback) => {
    const terminateApp = new TerminateApp(deviceId);
    const result = await terminateApp.execute(args.appId, progress);

    return createJSONToolResponse({
      message: `Stopped app ${args.appId}`,
      observation: result.observation,
      ...result
    });
  };

  // Clear state handler
  const clearStateHandler = async (deviceId: string, args: ClearStateArgs) => {
    const clearAppData = new ClearAppData(deviceId);
    const result = await clearAppData.execute(args.appId);

    return createJSONToolResponse({
      message: `Cleared state for app ${args.appId}`,
      observation: result.observation,
      ...result
    });
  };

  // Input text handler
  const inputTextHandler = async (deviceId: string, args: InputTextArgs) => {
    const sendText = new SendText(deviceId);
    const result = await sendText.execute(args.text, args.imeAction);

    const imeMessage = args.imeAction ? ` with IME action "${args.imeAction}"` : "";
    return createJSONToolResponse({
      message: `Input text "${args.text}"${imeMessage}`,
      observation: result.observation,
      ...result
    });
  };

  // Open link handler
  const openLinkHandler = async (deviceId: string, args: OpenLinkArgs) => {
    const openUrl = new OpenURL(deviceId);
    const result = await openUrl.execute(args.url);

    return createJSONToolResponse({
      message: `Opened link ${args.url}`,
      observation: result.observation,
      ...result
    });
  };

  // Shake handler
  const shakeHandler = async (deviceId: string, args: ShakeArgs, progress?: ProgressCallback) => {
    try {
      const shake = new Shake(deviceId);
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
  const imeActionHandler = async (deviceId: string, args: ImeActionArgs, progress?: ProgressCallback) => {
    try {
      const imeAction = new ImeAction(deviceId);
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
  const recentAppsHandler = async (deviceId: string, args: RecentAppsArgs, progress?: ProgressCallback) => {
    try {
      const recentApps = new RecentApps(deviceId);
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
  const homeScreenHandler = async (deviceId: string, args: any, progress?: ProgressCallback) => {
    try {
      const homeScreen = new HomeScreen(deviceId);
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
  const rotateHandler = async (deviceId: string, args: RotateArgs, progress?: ProgressCallback) => {
    try {
      const rotate = new Rotate(deviceId);
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
    "dragAndDrop",
    "Drag an element to another element using index-based selection",
    dragAndDropSchema,
    dragAndDropHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "pullToRefresh",
    "Perform a pull-to-refresh gesture on a list",
    pullToRefreshSchema,
    pullToRefreshHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "openSystemTray",
    "Open the system notification tray by swiping down from the status bar",
    openSystemTraySchema,
    openSystemTrayHandler,
    true // Supports progress notifications
  );

  // ToolRegistry.registerDeviceAware(
  //   "pinchToZoom",
  //   "Perform a pinch to zoom gesture in a specific direction",
  //   pinchToZoomSchema,
  //   pinchToZoomHandler
  // );

  // Register Maestro-aligned tools

  // Phase 1: Core Command Renames
  ToolRegistry.registerDeviceAware(
    "pressKey",
    "Press a hardware key on the device (Maestro equivalent of pressButton)",
    pressKeySchema,
    pressKeyHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "stopApp",
    "Stop a running app (Maestro equivalent of terminateApp)",
    stopAppSchema,
    stopAppHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "clearState",
    "Clear app state and data (Maestro equivalent of clearAppData)",
    clearStateSchema,
    clearStateHandler,
    false // Does not support progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "inputText",
    "Input text to the device (Maestro equivalent of sendText)",
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
    "Unified tap command supporting text, and selectors",
    tapOnSchema,
    tapOnHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "doubleTapOn",
    "Unified double tap command supporting text, and selectors",
    doubleTapOnSchema,
    doubleTapOnHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "longPressOn",
    "Unified long press command supporting text, and selectors",
    longPressOnSchema,
    longPressOnHandler,
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
    "focusOn",
    "Focus on a specific element",
    focusOnSchema,
    focusOnHandler,
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
