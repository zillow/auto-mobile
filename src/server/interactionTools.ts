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
import { ActionableError, BootedDevice, ViewHierarchyResult } from "../models";
import { createJSONToolResponse } from "../utils/toolUtils";
import { logger } from "../utils/logger";
import { Platform } from "../models";
import { createGlobalPerformanceTracker } from "../utils/PerformanceTracker";

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

export interface ScrollContainerArgs {
  elementId?: string;
  text?: string;
}

export interface ScrollArgs {
  container: ScrollContainerArgs;
  direction: "up" | "down" | "left" | "right";
  lookFor?: ScrollLookForArgs;
  speed?: "slow" | "normal" | "fast";
  scrollMode?: "adb" | "a11y";
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
  container: z.object({
    elementId: z.string().optional().describe("Resource ID of the container element (finds nearest scrollable parent if element is not scrollable)"),
    text: z.string().optional().describe("Text within the container (finds nearest scrollable parent of element containing this text)")
  }).describe("Container element to scroll within - specify elementId or text to locate it"),
  direction: z.enum(["up", "down", "left", "right"]).describe("Scroll direction"),
  lookFor: z.object({
    elementId: z.string().optional().describe("ID of the element to look for while scrolling"),
    text: z.string().optional().describe("Optional text to look for while scrolling"),
    maxTime: z.number().optional().describe("Maximum amount of time to spend scrolling, (default 15 seconds)")
  }).optional().describe("What we're searching for while scrolling"),
  speed: z.enum(["slow", "normal", "fast"]).optional().describe("Scroll speed"),
  scrollMode: z.enum(["adb", "a11y"]).optional().describe("Scroll execution mode: 'adb' (default, ~540ms) or 'a11y' (accessibility service, ~50-150ms)"),
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

  /**
   * Compute a simple fingerprint of view hierarchy for change detection.
   * Uses text content and bounds to detect if scroll actually changed the view.
   */
  const computeHierarchyFingerprint = (hierarchy: ViewHierarchyResult): string => {
    const extractTexts = (node: Record<string, unknown>): string[] => {
      const texts: string[] = [];
      if (node.text && typeof node.text === "string") {
        texts.push(`${node.text}@${node.bounds || ""}`);
      }
      if (node["resource-id"] && typeof node["resource-id"] === "string") {
        texts.push(`#${node["resource-id"]}@${node.bounds || ""}`);
      }
      if (node.node) {
        if (Array.isArray(node.node)) {
          for (const child of node.node) {
            texts.push(...extractTexts(child));
          }
        } else if (typeof node.node === "object") {
          texts.push(...extractTexts(node.node as Record<string, unknown>));
        }
      }
      return texts;
    };

    const root = hierarchy.hierarchy?.node || hierarchy.hierarchy;
    if (!root) {return "";}
    const texts = extractTexts(root as Record<string, unknown>);
    return texts.sort().join("|");
  };

  /**
   * Find scrollable container element. If the found element is not scrollable,
   * traverse up to find the nearest scrollable parent.
   */
  const findScrollableContainer = (
    viewHierarchy: ViewHierarchyResult,
    container: ScrollContainerArgs
  ): { element: ReturnType<typeof elementUtils.findElementByText>, searchedBy: string } => {
    if (!container.elementId && !container.text) {
      throw new ActionableError("Container must specify either elementId or text");
    }

    // Helper to check if node is scrollable
    const isScrollable = (node: Record<string, unknown>): boolean => {
      return node.scrollable === "true" || node.scrollable === true;
    };

    // Helper to parse bounds string to element bounds
    const parseBounds = (boundsStr: string): { left: number; top: number; right: number; bottom: number } | null => {
      const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      if (!match) {return null;}
      return {
        left: parseInt(match[1], 10),
        top: parseInt(match[2], 10),
        right: parseInt(match[3], 10),
        bottom: parseInt(match[4], 10)
      };
    };

    // Helper to find scrollable parent that contains given bounds
    const findScrollableParent = (
      node: Record<string, unknown>,
      targetBounds: { left: number; top: number; right: number; bottom: number }
    ): Record<string, unknown> | null => {
      const nodeBounds = node.bounds ? parseBounds(node.bounds as string) : null;

      // Check if this node contains the target bounds
      const containsTarget = nodeBounds &&
        nodeBounds.left <= targetBounds.left &&
        nodeBounds.top <= targetBounds.top &&
        nodeBounds.right >= targetBounds.right &&
        nodeBounds.bottom >= targetBounds.bottom;

      if (containsTarget && isScrollable(node)) {
        return node;
      }

      // Search children
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        for (const child of children) {
          if (typeof child === "object") {
            const result = findScrollableParent(child as Record<string, unknown>, targetBounds);
            if (result) {return result;}
          }
        }
      }

      return null;
    };

    // Find initial element
    let foundElement: ReturnType<typeof elementUtils.findElementByText> = null;
    let searchedBy = "";

    if (container.elementId) {
      foundElement = elementUtils.findElementByResourceId(
        viewHierarchy,
        container.elementId,
        undefined,
        true // partial match
      );
      searchedBy = `elementId "${container.elementId}"`;
    } else if (container.text) {
      foundElement = elementUtils.findElementByText(
        viewHierarchy,
        container.text,
        undefined,
        true, // fuzzy match
        false // case-insensitive
      );
      searchedBy = `text "${container.text}"`;
    }

    if (!foundElement) {
      throw new ActionableError(`Container element not found with ${searchedBy}`);
    }

    // If element is already scrollable, return it
    if (foundElement.scrollable) {
      logger.info(`[scroll] Found scrollable container directly via ${searchedBy}`);
      return { element: foundElement, searchedBy };
    }

    // Otherwise, find the nearest scrollable parent
    logger.info(`[scroll] Element found via ${searchedBy} is not scrollable, searching for scrollable parent`);

    const root = viewHierarchy.hierarchy?.node || viewHierarchy.hierarchy;
    if (!root) {
      throw new ActionableError(`Element found via ${searchedBy} is not scrollable and no parent hierarchy available`);
    }

    const scrollableParent = findScrollableParent(root as Record<string, unknown>, foundElement.bounds);

    if (!scrollableParent) {
      throw new ActionableError(`Element found via ${searchedBy} is not scrollable and no scrollable parent found`);
    }

    // Convert scrollable parent node to Element
    const parentBounds = parseBounds(scrollableParent.bounds as string);
    if (!parentBounds) {
      throw new ActionableError(`Could not parse bounds of scrollable parent`);
    }

    const scrollableElement = {
      bounds: parentBounds,
      text: scrollableParent.text as string | undefined,
      resourceId: scrollableParent["resource-id"] as string | undefined,
      scrollable: true,
      className: scrollableParent.className as string | undefined
    };

    logger.info(`[scroll] Found scrollable parent: bounds=${JSON.stringify(scrollableElement.bounds)}`);
    return { element: scrollableElement, searchedBy: `scrollable parent of ${searchedBy}` };
  };

  // Scroll handler
  const scrollHandler = async (device: BootedDevice, args: ScrollArgs, progress?: ProgressCallback) => {
    const perf = createGlobalPerformanceTracker();
    perf.serial("scroll");

    logger.info(`[scroll] Starting scroll: direction=${args.direction}, container=${JSON.stringify(args.container)}, lookFor=${JSON.stringify(args.lookFor)}`);

    // Element-specific scrolling
    const observeScreen = new ObserveScreen(device);
    const swipe = new SwipeOnElement(device);

    const observeResult = await perf.track("initialObserve", () => observeScreen.execute());

    if (!observeResult.viewHierarchy) {
      perf.end();
      throw new ActionableError("Could not get view hierarchy for element scrolling");
    }

    // Find the scrollable container element
    const { element, searchedBy } = perf.trackSync("findContainerElement", () =>
      findScrollableContainer(observeResult.viewHierarchy!, args.container)
    );

    if (!element) {
      perf.end();
      throw new ActionableError(`Container element not found`);
    }

    const containerElement = element;
    logger.info(`[scroll] Using container found via ${searchedBy}: bounds=${JSON.stringify(containerElement.bounds)}, scrollable=${containerElement.scrollable}`);

    if (!args.lookFor) {
      // Simple scroll without looking for element
      const duration = perf.trackSync("getSwipeDuration", () => elementUtils.getSwipeDurationFromSpeed(args.speed));
      const swipeDirection = perf.trackSync("getSwipeDirection", () => elementUtils.getSwipeDirectionForScroll(args.direction));

      // Compute fingerprint before scroll
      const beforeFingerprint = perf.trackSync("computeBeforeFingerprint", () =>
        computeHierarchyFingerprint(observeResult.viewHierarchy!)
      );

      logger.info(`[scroll] Executing simple scroll: direction=${swipeDirection}, duration=${duration}ms`);

      const result = await perf.track("swipeExecution", () => swipe.execute(
        containerElement!,
        swipeDirection, {
          duration: duration,
          easing: "accelerateDecelerate",
          fingers: 1,
          randomize: false,
          lift: true,
          pressure: 1,
          scrollMode: args.scrollMode
        },
        progress
      ));

      // Compute fingerprint after scroll to detect if anything changed
      const afterFingerprint = perf.trackSync("computeAfterFingerprint", () =>
        result.observation?.viewHierarchy ? computeHierarchyFingerprint(result.observation.viewHierarchy) : ""
      );

      const hierarchyChanged = beforeFingerprint !== afterFingerprint;
      logger.info(`[scroll] Scroll complete: hierarchyChanged=${hierarchyChanged}`);

      perf.end();
      const scrollTimings = perf.getTimings();
      return createJSONToolResponse({
        message: `Scrolled ${args.direction} within container (${searchedBy})`,
        hierarchyChanged,
        observation: result.observation,
        perfTiming: scrollTimings
      });

    } else if (!args.lookFor.text && !args.lookFor.elementId) {
      perf.end();
      throw new ActionableError("Either text or element id must be specified to look for something in a scrollable list.");
    } else {
      // Scroll with lookFor - search for element
      let lastObservation = await perf.track("lookForInitialObserve", () => observeScreen.execute());
      if (!lastObservation.viewHierarchy || !lastObservation.screenSize) {
        perf.end();
        throw new Error("Failed to get initial observation for scrolling until visible.");
      }

      const direction = args.direction;
      const maxTime = args.lookFor.maxTime ?? 15000; // Reduced from 120s to 15s default
      const startTime = Date.now();
      let foundElement = null;
      let scrollIteration = 0;
      let lastFingerprint = perf.trackSync("computeInitialFingerprint", () =>
        computeHierarchyFingerprint(lastObservation.viewHierarchy!)
      );
      let unchangedScrollCount = 0;
      const maxUnchangedScrolls = 3; // Stop after 3 consecutive unchanged scrolls

      const target = args.lookFor.text ? `text "${args.lookFor.text}"` : `element with id "${args.lookFor.elementId}"`;
      logger.info(`[scroll] Looking for ${target} with maxTime=${maxTime}ms`);

      // First check if element is already visible
      if (args.lookFor.text) {
        foundElement = perf.trackSync("initialFindByText", () => elementUtils.findElementByText(
          lastObservation.viewHierarchy!,
          args.lookFor!.text!,
          args.container.elementId, // Optionally restrict search to container
          true,
          false
        ));
      } else if (args.lookFor.elementId) {
        foundElement = perf.trackSync("initialFindById", () => elementUtils.findElementByResourceId(
          lastObservation.viewHierarchy!,
          args.lookFor!.elementId!,
          args.container.elementId, // Optionally restrict search to container
          true
        ));
      }

      if (foundElement) {
        logger.info(`[scroll] Element already visible, no scrolling needed`);
        perf.end();
        const scrollTimings = perf.getTimings();
        return createJSONToolResponse({
          message: `${target} was already visible`,
          found: true,
          scrollIterations: 0,
          observation: lastObservation,
          perfTiming: scrollTimings
        });
      }

      while (Date.now() - startTime < maxTime) {
        scrollIteration++;
        logger.info(`[scroll] Iteration ${scrollIteration}: elapsed=${Date.now() - startTime}ms`);

        // Perform scroll
        const swipeStartTime = Date.now();
        const swipeDuration = elementUtils.getSwipeDurationFromSpeed(args.speed);
        const result = await perf.track(`iteration${scrollIteration}_swipe`, () => swipe.execute(
          containerElement!,
          elementUtils.getSwipeDirectionForScroll(direction),
          { duration: swipeDuration, scrollMode: args.scrollMode },
          progress
        ));
        logger.info(`[scroll] Iteration ${scrollIteration}: swipe (duration=${swipeDuration}ms) took ${Date.now() - swipeStartTime}ms`);

        // Update observation from swipe result
        if (result.observation && result.observation.viewHierarchy) {
          lastObservation = result.observation;
        } else {
          perf.end();
          throw new Error("Lost observation after swipe during scroll until visible.");
        }

        // Check if hierarchy changed (detect scroll end)
        const currentFingerprint = perf.trackSync(`iteration${scrollIteration}_fingerprint`, () =>
          computeHierarchyFingerprint(lastObservation.viewHierarchy!)
        );

        if (currentFingerprint === lastFingerprint) {
          unchangedScrollCount++;
          logger.info(`[scroll] Iteration ${scrollIteration}: hierarchy unchanged (${unchangedScrollCount}/${maxUnchangedScrolls})`);

          if (unchangedScrollCount >= maxUnchangedScrolls) {
            perf.end();
            const elapsed = Date.now() - startTime;
            throw new ActionableError(
              `Scroll reached end of container (no change after ${maxUnchangedScrolls} scrolls). ` +
              `${target} not found after ${scrollIteration} iterations (${elapsed}ms).`
            );
          }
        } else {
          unchangedScrollCount = 0;
          lastFingerprint = currentFingerprint;
        }

        // Check if target element is now visible
        if (args.lookFor.text) {
          foundElement = perf.trackSync(`iteration${scrollIteration}_findByText`, () => elementUtils.findElementByText(
            lastObservation.viewHierarchy!,
            args.lookFor!.text!,
            args.container.elementId, // Optionally restrict search to container
            true,
            false
          ));
        } else if (args.lookFor.elementId) {
          foundElement = perf.trackSync(`iteration${scrollIteration}_findById`, () => elementUtils.findElementByResourceId(
            lastObservation.viewHierarchy!,
            args.lookFor!.elementId!,
            args.container.elementId, // Optionally restrict search to container
            true
          ));
        }

        if (foundElement) {
          const elapsed = Date.now() - startTime;
          logger.info(`[scroll] Found ${target} after ${scrollIteration} iterations (${elapsed}ms)`);
          break;
        }
      }

      if (!foundElement) {
        perf.end();
        const elapsed = Date.now() - startTime;
        throw new ActionableError(`${target} not found after scrolling for ${elapsed}ms (${scrollIteration} iterations, timeout=${maxTime}ms).`);
      }

      perf.end();
      const scrollTimings = perf.getTimings();
      return createJSONToolResponse({
        message: `Scrolled until ${target} became visible`,
        found: true,
        scrollIterations: scrollIteration,
        elapsedMs: Date.now() - startTime,
        observation: lastObservation,
        perfTiming: scrollTimings
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
