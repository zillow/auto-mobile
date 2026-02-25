import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ResourceRegistry } from "./resourceRegistry";
import { RESOURCE_URIS } from "./observationResources";
import { ActionableError } from "../models/ActionableError";
import { RealObserveScreen } from "../features/observe/ObserveScreen";
import { createJSONToolResponse, createStructuredToolResponse, throwIfAborted } from "../utils/toolUtils";
import { BootedDevice, Element, ObserveResult, ViewHierarchyResult } from "../models";
import { createGlobalPerformanceTracker } from "../utils/PerformanceTracker";
import { NavigationGraphManager } from "../features/navigation/NavigationGraphManager";
import { IdentifyInteractions, IdentifyInteractionsOptions } from "../features/observe/IdentifyInteractions";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import { DefaultElementFinder } from "../features/utility/ElementFinder";
import type { ElementFinder } from "../utils/interfaces/ElementFinder";
import { defaultTimer } from "../utils/SystemTimer";
import { consumeSetupTiming } from "./ToolExecutionContext";
import { AndroidCtrlProxyManager } from "../utils/CtrlProxyManager";
import { logger } from "../utils/logger";
import {
  accessibilityStateSchema,
  activeWindowSchema,
  elementSchema,
  freshnessSchema,
  predictionsSchema,
  screenSizeSchema,
  selectedElementSchema,
  systemInsetsSchema
} from "./toolOutputSchemas";
// Schema definitions
// waitFor accepts elementId OR text directly (oneOf), plus optional timeout
const waitForSchema = z.union([
  z.object({
    elementId: z.string().describe("Element resource ID / accessibility identifier"),
    timeout: z.number().optional().describe("Wait timeout ms (default: 5000)")
  }),
  z.object({
    text: z.string().describe("Element text"),
    timeout: z.number().optional().describe("Wait timeout ms (default: 5000)")
  })
]);

export const observeSchema = addDeviceTargetingToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Platform"),
  waitFor: waitForSchema.optional().describe("Wait for element to appear before returning observation"),
  raw: z.boolean().optional().describe("When true, include unprocessed view hierarchy in response alongside normal output (default: false)")
}));

const observeElementsSchema = z.object({
  clickable: z.array(elementSchema),
  scrollable: z.array(elementSchema),
  text: z.array(elementSchema)
});

const observeResultSchema = z.object({
  updatedAt: z.union([z.string(), z.number()]),
  screenSize: screenSizeSchema,
  systemInsets: systemInsetsSchema,
  rotation: z.number().int().optional(),
  viewHierarchy: z.any().optional(),
  activeWindow: activeWindowSchema.optional(),
  elements: observeElementsSchema.optional(),
  selectedElements: z.array(selectedElementSchema).optional(),
  focusedElement: elementSchema.optional(),
  accessibilityFocusedElement: elementSchema.optional(),
  intentChooserDetected: z.boolean().optional(),
  notificationPermissionDetected: z.boolean().optional(),
  wakefulness: z.enum(["Awake", "Asleep", "Dozing"]).optional(),
  userId: z.number().int().optional(),
  backStack: z.any().optional(),
  error: z.string().optional(),
  awaitedElement: elementSchema.optional(),
  awaitDuration: z.number().int().optional(),
  awaitTimeout: z.boolean().optional(),
  perfTiming: z.any().optional(),
  perfTimingTruncated: z.boolean().optional(),
  gfxMetrics: z.any().optional(),
  displayedTimeMetrics: z.array(z.any()).optional(),
  performanceAudit: z.any().optional(),
  accessibilityAudit: z.any().optional(),
  freshness: freshnessSchema.optional(),
  recompositionSummary: z.any().optional(),
  predictions: predictionsSchema.optional(),
  accessibilityState: accessibilityStateSchema.optional(),
  rawViewHierarchy: z.any().optional()
}).passthrough();

export const identifyInteractionsSchema = addDeviceTargetingToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Platform"),
  filter: z.object({
    types: z.array(z.enum(["navigation", "input", "action", "scroll", "toggle"]))
      .optional()
      .describe("Interaction types"),
    minConfidence: z.number().min(0).max(1).optional().describe("Min confidence (0-1)"),
    limit: z.number().int().positive().optional().describe("Max results")
  }).optional().describe("Filter options"),
  includeContext: z.object({
    navigationGraph: z.boolean().optional().describe("Include nav graph predictions"),
    elementDetails: z.boolean().optional().describe("Include element details"),
    suggestedParams: z.boolean().optional().describe("Include tool params")
  }).optional().describe("Context options")
}));

const WAIT_FOR_POLL_INTERVAL_MS = 100;

type ObserveWaitForOptions = z.infer<typeof waitForSchema>;
type ObserveArgs = z.infer<typeof observeSchema>;

const findWaitForElement = (
  finder: ElementFinder,
  waitFor: ObserveWaitForOptions,
  viewHierarchy: ViewHierarchyResult
): Element | null => {
  if ("elementId" in waitFor) {
    return finder.findElementByResourceId(
      viewHierarchy,
      waitFor.elementId,
      undefined
    );
  }

  if ("text" in waitFor) {
    return finder.findElementByText(
      viewHierarchy,
      waitFor.text,
      undefined,
      true,
      false
    );
  }

  return null;
};

const waitForObservation = async (
  observeScreen: ObserveScreen,
  waitFor: ObserveWaitForOptions,
  signal?: AbortSignal
): Promise<{
  observation: ObserveResult;
  awaitedElement?: Element;
  awaitDuration: number;
  awaitTimeout: boolean;
}> => {
  const startTime = defaultTimer.now();
  const timeoutMs = waitFor.timeout ?? 5000;
  const finder = new DefaultElementFinder();
  const queryOptions = {
    text: "text" in waitFor ? waitFor.text : undefined,
    elementId: "elementId" in waitFor ? waitFor.elementId : undefined
  };

  throwIfAborted(signal);
  let observation = await observeScreen.execute(
    queryOptions,
    createGlobalPerformanceTracker(),
    false,
    startTime,
    signal
  );
  let awaitedElement = observation.viewHierarchy
    ? findWaitForElement(finder, waitFor, observation.viewHierarchy)
    : null;

  if (awaitedElement) {
    return {
      observation,
      awaitedElement,
      awaitDuration: defaultTimer.now() - startTime,
      awaitTimeout: false
    };
  }

  if (defaultTimer.now() - startTime >= timeoutMs) {
    return {
      observation,
      awaitDuration: defaultTimer.now() - startTime,
      awaitTimeout: true
    };
  }

  while (defaultTimer.now() - startTime < timeoutMs) {
    await defaultTimer.sleep(WAIT_FOR_POLL_INTERVAL_MS);
    throwIfAborted(signal);

    observation = await observeScreen.execute(
      queryOptions,
      createGlobalPerformanceTracker(),
      false,
      startTime,
      signal
    );
    awaitedElement = observation.viewHierarchy
      ? findWaitForElement(finder, waitFor, observation.viewHierarchy)
      : null;

    if (awaitedElement) {
      return {
        observation,
        awaitedElement,
        awaitDuration: defaultTimer.now() - startTime,
        awaitTimeout: false
      };
    }
  }

  return {
    observation,
    awaitDuration: defaultTimer.now() - startTime,
    awaitTimeout: true
  };
};

// Register tools (this will be called when this file is imported)
export function registerObserveTools() {
  // Observe handler
  const observeHandler = async (device: BootedDevice, args: ObserveArgs, _progress?: unknown, signal?: AbortSignal) => {
    try {
      const observeScreen = new RealObserveScreen(device);
      const waitFor = args.waitFor;
      const waitOutcome = waitFor
        ? await waitForObservation(observeScreen, waitFor, signal)
        : null;
      const result = waitOutcome
        ? waitOutcome.observation
        : await observeScreen.execute(undefined, createGlobalPerformanceTracker(), true, 0, signal);

      if (args.raw) {
        await observeScreen.appendRawViewHierarchy(result, signal);
      }

      // Include setup timing if this is the first observe after accessibility service setup
      const setupTiming = consumeSetupTiming(device.deviceId);
      if (setupTiming && result.perfTiming) {
        // Prepend setup timing to the observe timing
        result.perfTiming = [setupTiming, ...result.perfTiming];
      } else if (setupTiming) {
        result.perfTiming = [setupTiming];
      }

      // Record back stack information in navigation graph if available
      if (result.backStack && result.activeWindow?.appId) {
        const navGraph = NavigationGraphManager.getInstance();
        // Only record if we have a current app and screen
        if (navGraph.getCurrentAppId() === result.activeWindow.appId && navGraph.getCurrentScreen()) {
          navGraph.recordBackStack(result.backStack);
        }
      }

      // If accessibility service reports as disabled, reset setup state to force reinstall on next attempt
      // This handles cases where the service was uninstalled externally
      if (device.platform === "android" && result.accessibilityState?.enabled === false) {
        logger.warn("[observe] Accessibility service not enabled, resetting setup state for next attempt");
        try {
          const manager = AndroidCtrlProxyManager.getInstance(device);
          manager.resetSetupState();
        } catch (error) {
          logger.warn("[observe] Failed to reset accessibility setup state", {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Notify MCP clients that observation resources have been updated
      await ResourceRegistry.notifyResourcesUpdated([
        RESOURCE_URIS.LATEST_OBSERVATION,
        RESOURCE_URIS.LATEST_SCREENSHOT
      ]);

      if (waitOutcome) {
        return createStructuredToolResponse({
          ...result,
          awaitedElement: waitOutcome.awaitedElement,
          awaitDuration: waitOutcome.awaitDuration,
          awaitTimeout: waitOutcome.awaitTimeout
        });
      }

      return createStructuredToolResponse(result);
    } catch (error) {
      throw new ActionableError(`Failed to execute observe: ${error}`);
    }
  };

  const identifyInteractionsHandler = async (
    device: BootedDevice,
    args: IdentifyInteractionsOptions
  ) => {
    try {
      const observeScreen = new RealObserveScreen(device);
      const cachedResult = await observeScreen.getMostRecentCachedObserveResult();
      const navigationGraph = NavigationGraphManager.getInstance();
      const currentScreen = navigationGraph.getCurrentScreen();
      const navigationEdges = args.includeContext?.navigationGraph !== false && currentScreen
        ? await navigationGraph.getEdgesFrom(currentScreen)
        : [];

      const analyzer = new IdentifyInteractions();
      const result = analyzer.analyze(cachedResult, args, currentScreen, navigationEdges);

      return createJSONToolResponse(result);
    } catch (error) {
      throw new ActionableError(`Failed to execute identifyInteractions: ${error}`);
    }
  };

  // Register with the tool registry using the new device-aware method
  ToolRegistry.registerDeviceAware(
    "observe",
    "Get screen view hierarchy",
    observeSchema,
    observeHandler,
    false,
    false,
    { outputSchema: observeResultSchema }
  );

  ToolRegistry.registerDeviceAware(
    "identifyInteractions",
    "Suggest likely interactions",
    identifyInteractionsSchema,
    identifyInteractionsHandler,
    false,
    true
  );
}
