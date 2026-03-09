import { ActionableError, BootedDevice, Element, ObserveResult } from "../../models";
import { BaseVisualChange, ProgressCallback } from "../action/BaseVisualChange";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { createGlobalPerformanceTracker, PerformanceTracker } from "../../utils/PerformanceTracker";
import { logger } from "../../utils/logger";
import { CtrlProxyClient as AndroidCtrlProxyClient } from "../observe/android";
import { defaultNavigationGraphManager, type NavigationEdge, type NavigationGraphService } from "./NavigationGraphManager";
import { ExportedGraph } from "../../utils/interfaces/NavigationGraph";
import { TapOnElement } from "../action/TapOnElement";
import { SwipeOnElement } from "../action/SwipeOnElement";
import { DefaultElementParser } from "../utility/ElementParser";
import type { ElementParser } from "../../utils/interfaces/ElementParser";
import { throwIfAborted } from "../../utils/toolUtils";
import { OPERATION_CANCELLED_MESSAGE } from "../../utils/constants";
import { Timer, defaultTimer } from "../../utils/SystemTimer";

// Re-export consumed types
export type { ExploreOptions } from "./ExploreTypes";

// Import types
import type {
  ExplorationMode,
  ExplorationStrategy,
  ExploreOptions,
  ExploreResult,
  ExploreDryRunResult,
  ExploreExecutionResult,
  ElementSelectionStats,
  TrackedElement,
  GraphTraversalState
} from "./ExploreTypes";

// Import element extraction functions
import {
  extractNavigationElements,
  extractScrollableContainers,
  extractAllElements,
  getElementKey,
  filterUnexhaustedElements
} from "./ExploreElementExtraction";

// Import element scoring functions
import {
  selectBreadthFirst,
  selectDepthFirst,
  selectWeighted,
  rankElementsForDryRun,
  getElementTarget,
  predictOutcomeForElement
} from "./ExploreElementScoring";

// Import blocker detection functions
import {
  detectAndHandleBlockers,
  isPermissionDialog,
  handlePermissionDialog
} from "./ExploreBlockerDetection";

// Import validate mode functions
import {
  initializeGraphTraversal,
  markNodeVisited,
  markEdgeTraversed,
  selectNextEdgeToTraverse,
  findElementMatchingEdge,
  validateNavigation
} from "./ExploreValidateMode";

/**
 * Explore implements intelligent app navigation exploration.
 * Perpetually explores until all navigation destinations have been reached by
 * automatically discovering navigation paths, prioritizing likely navigation elements,
 * avoiding redundant interactions, and efficiently covering unexplored screens.
 */
export class Explore extends BaseVisualChange {
  private navigationManager: NavigationGraphService;
  private exploredElements: Map<string, TrackedElement>;
  private interactionCount: number = 0;
  private explorationPath: string[] = [];
  private elementSelections: ElementSelectionStats[] = [];
  private consecutiveBackCount: number = 0;
  private consecutiveNoChangeCount: number = 0;
  private loopDetection: Map<string, number> = new Map();
  private elementParser: ElementParser;
  private stopReason: string = "";
  private previousScreen: string | null = null;
  private targetPackageName: string | null = null;
  private consecutiveOutOfAppCount: number = 0;
  private graphTraversalState: GraphTraversalState | null = null;
  private currentTargetEdge: NavigationEdge | null = null;
  private currentElementConfidence: number = 0;

  // Constants for safety limits
  private static readonly MAX_CONSECUTIVE_BACKS = 5;
  private static readonly MAX_CONSECUTIVE_NO_CHANGE = 40;
  private static readonly MAX_LOOP_ITERATIONS = 3;
  private static readonly DEFAULT_MAX_INTERACTIONS = 200;
  private static readonly DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly DEFAULT_RESET_INTERVAL = 15;
  private static readonly MAX_OUT_OF_APP_ATTEMPTS = 5;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    timer: Timer = defaultTimer,
    navigationManager?: NavigationGraphService
  ) {
    super(device, adb, timer);
    this.navigationManager = navigationManager ?? defaultNavigationGraphManager;
    this.exploredElements = new Map();
    this.elementParser = new DefaultElementParser();
  }

  /**
   * Execute exploration
   */
  async execute(
    options: ExploreOptions = {},
    progress?: ProgressCallback,
    signal?: AbortSignal
  ): Promise<ExploreExecutionResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("explore");
    const startTime = this.timer.now();

    try {
      if (options.dryRun) {
        return await this.executeDryRun(options, progress, signal, perf, startTime);
      }

      // Set defaults
      const maxInteractions = options.maxInteractions ?? Explore.DEFAULT_MAX_INTERACTIONS;
      const timeoutMs = options.timeoutMs ?? Explore.DEFAULT_TIMEOUT_MS;
      const strategy = options.strategy ?? "weighted";
      const mode = options.mode ?? "hybrid";
      const resetInterval = options.resetInterval ?? Explore.DEFAULT_RESET_INTERVAL;

      // Reset exploration state for fresh run
      this.exploredElements.clear();
      this.loopDetection.clear();
      this.elementSelections = [];
      this.explorationPath = [];
      this.interactionCount = 0;
      this.consecutiveBackCount = 0;
      this.consecutiveNoChangeCount = 0;
      this.stopReason = "";
      this.previousScreen = null;
      this.consecutiveOutOfAppCount = 0;
      this.targetPackageName = options.packageName?.trim() || null;

      if (progress) {
        await progress(0, maxInteractions, "Starting exploration...");
      }

      // Capture initial graph state
      const initialGraph = await this.navigationManager.exportGraph();
      const initialNodeCount = initialGraph.nodes.length;

      // Initialize graph traversal for validate mode
      if (mode === "validate") {
        this.graphTraversalState = await initializeGraphTraversal(this.navigationManager);
        logger.info(
          `[Explore] Validate mode: traversing ${this.graphTraversalState?.totalEdgesInGraph ?? 0} known edges`
        );
      }

      // Main exploration loop
      while (this.shouldContinue(maxInteractions, timeoutMs, startTime)) {
        if (signal?.aborted) {
          this.stopReason = OPERATION_CANCELLED_MESSAGE;
          break;
        }
        // Get current screen state
        const observation = await this.observeScreen.execute(undefined, perf, true, 0, signal);

        const viewHierarchy = observation.viewHierarchy;
        if (viewHierarchy && !viewHierarchy.hierarchy.error) {
          const elements = extractAllElements(viewHierarchy, this.elementParser);
          if (isPermissionDialog(elements)) {
            logger.info("[Explore] Detected permission dialog, attempting to dismiss");
            await handlePermissionDialog(elements, this.device, this.adb, progress);
            continue;
          }
        }

        if (!this.targetPackageName) {
          this.targetPackageName = this.getObservationPackageName(observation);
          if (this.targetPackageName) {
            logger.info(`[Explore] Defaulting to foreground package: ${this.targetPackageName}`);
          }
        }

        if (this.targetPackageName) {
          const enforcement = await this.enforceTargetApp(
            observation,
            this.targetPackageName,
            progress
          );
          if (enforcement === "handled") {
            continue;
          }
          if (enforcement === "stop") {
            break;
          }
        }

        // Check for blocker screens (auth, permissions, etc.) and handle them
        const blockerHandled = await detectAndHandleBlockers(
          observation,
          this.device,
          this.adb,
          this.elementParser,
          p => this.handleDeadEnd(p),
          progress
        );
        if (blockerHandled) {
          // Re-observe after handling blocker
          continue;
        }

        // Check for safety conditions
        if (this.shouldBreakForSafety(observation)) {
          logger.warn("[Explore] Safety condition triggered, stopping exploration");
          break;
        }

        // Update current screen in path
        const currentScreen = this.navigationManager.getCurrentScreen();
        if (currentScreen && !this.explorationPath.includes(currentScreen)) {
          this.explorationPath.push(currentScreen);
        }

        // Select next element to interact with
        const nextElement = await this.selectNextElement(
          observation,
          strategy,
          mode,
          perf
        );

        if (!nextElement) {
          logger.info("[Explore] No suitable element found, attempting back navigation");
          await this.handleDeadEnd(progress);
          continue;
        }

        // Perform interaction
        throwIfAborted(signal);
        const interactionSuccess = await this.performInteraction(
          nextElement,
          observation,
          progress,
          perf,
          signal
        );

        if (interactionSuccess) {
          this.interactionCount++;
          this.consecutiveNoChangeCount = 0;

          // Validate navigation in validate mode
          if (mode === "validate" && this.currentTargetEdge && this.graphTraversalState) {
            const validationSuccess = await validateNavigation(
              this.currentTargetEdge,
              this.graphTraversalState,
              this.navigationManager,
              this.timer,
              this.currentElementConfidence,
              reason => { this.stopReason = reason; }
            );

            if (!validationSuccess) {
              // Navigation validation failed - stop exploration
              logger.error("[Explore] Stopping exploration due to navigation validation failure");
              break;
            }
          }
        } else {
          this.consecutiveNoChangeCount++;
        }

        // Update loop detection - only increment when navigating back to a previously visited screen
        if (interactionSuccess) {
          const newScreen = this.navigationManager.getCurrentScreen();

          // Check if we navigated to a different screen
          if (this.previousScreen !== null && newScreen && newScreen !== this.previousScreen) {
            // We changed screens - check if we've been to this screen before
            const visitCount = this.loopDetection.get(newScreen) ?? 0;
            if (visitCount > 0) {
              // We're returning to a previously visited screen - increment loop counter
              this.loopDetection.set(newScreen, visitCount + 1);
              logger.debug(`[Explore] Returning to screen ${newScreen}, visit count: ${visitCount + 1}`);
            } else {
              // First visit to this screen - initialize counter
              this.loopDetection.set(newScreen, 1);
            }
          } else if (newScreen && this.previousScreen === null) {
            // First screen we're tracking
            this.loopDetection.set(newScreen, 1);
          }

          // Update previous screen for next iteration
          if (newScreen) {
            this.previousScreen = newScreen;
          }
        }

        // Report progress
        if (progress) {
          if (mode === "validate" && this.graphTraversalState) {
            // Report graph traversal progress
            const edgesTraversed = this.graphTraversalState.traversedEdges.size;
            const totalEdges = this.graphTraversalState.totalEdgesInGraph;
            const coveragePercent =
              totalEdges > 0 ? Math.round((edgesTraversed / totalEdges) * 100) : 0;
            await progress(
              this.interactionCount,
              maxInteractions,
              `Validating graph: ${edgesTraversed}/${totalEdges} edges traversed (${coveragePercent}%) - ${this.interactionCount}/${maxInteractions} interactions`
            );
          } else {
            // Report discovery progress
            const currentGraph = await this.navigationManager.exportGraph();
            const currentNodeCount = currentGraph.nodes.length;
            await progress(
              this.interactionCount,
              maxInteractions,
              `Explored ${currentNodeCount - initialNodeCount} new screens (${this.interactionCount}/${maxInteractions} interactions)`
            );
          }
        }

        // Periodic reset if configured
        if (options.resetToHome && this.interactionCount % resetInterval === 0) {
          await this.resetToHome(progress);
        }
      }

      perf.end();
      return await this.generateReport(initialGraph, startTime, signal?.aborted === true);
    } catch (error) {
      perf.end();
      throw new ActionableError(`Failed to execute exploration: ${error}`);
    }
  }

  private async executeDryRun(
    options: ExploreOptions,
    progress: ProgressCallback | undefined,
    signal: AbortSignal | undefined,
    perf: PerformanceTracker,
    startTime: number
  ): Promise<ExploreDryRunResult> {
    const strategy = options.strategy ?? "weighted";
    const mode = options.mode ?? "hybrid";
    const maxInteractions = options.maxInteractions ?? Explore.DEFAULT_MAX_INTERACTIONS;

    if (progress) {
      await progress(0, maxInteractions, "Starting exploration dry run...");
    }

    this.exploredElements.clear();
    this.elementSelections = [];
    this.explorationPath = [];
    this.interactionCount = 0;
    this.stopReason = "";
    this.previousScreen = null;
    this.consecutiveOutOfAppCount = 0;
    this.targetPackageName = options.packageName?.trim() || null;

    const warnings: string[] = [];

    const observation = await this.observeScreen.execute(undefined, perf, true, 0, signal);
    const viewHierarchy = observation.viewHierarchy;
    if (!viewHierarchy || viewHierarchy.hierarchy.error) {
      warnings.push("Unable to inspect view hierarchy for dry run planning.");
      return {
        success: true,
        dryRun: true,
        currentScreen: {
          name: "unknown",
          interactableElements: 0
        },
        plannedInteractions: [],
        estimatedCoverage: {
          screensToVisit: [],
          newScreensExpected: 0,
          existingScreensToRevisit: 0
        },
        warnings,
        observation,
        durationMs: this.timer.now() - startTime
      };
    }

    const currentPackage = this.getObservationPackageName(observation);
    if (this.targetPackageName && currentPackage && this.targetPackageName !== currentPackage) {
      warnings.push(
        `Foreground package '${currentPackage}' does not match target '${this.targetPackageName}'.`
      );
    }

    const currentScreen = this.navigationManager.getCurrentScreen() ?? "unknown";
    const edges =
      currentScreen !== "unknown"
        ? await this.navigationManager.getEdgesFrom(currentScreen)
        : [];

    const navigationElements = extractNavigationElements(viewHierarchy, this.elementParser);
    const scrollableContainers = extractScrollableContainers(viewHierarchy, this.elementParser);
    const allCandidates = [...navigationElements, ...scrollableContainers];

    if (allCandidates.length === 0) {
      warnings.push("No interactable elements were detected on the current screen.");
    }

    const scored = rankElementsForDryRun(allCandidates, strategy, mode, this.exploredElements);
    const plannedInteractions = scored.slice(0, maxInteractions).map((entry, index) => {
      const target = getElementTarget(entry.element);
      const predictedOutcome = predictOutcomeForElement(entry.element, edges);

      return {
        order: index + 1,
        action: entry.action,
        target,
        reason: entry.reason,
        predictedOutcome,
        whitelistStatus: entry.whitelistStatus
      };
    });

    const predictedScreens = plannedInteractions
      .map(interaction => interaction.predictedOutcome.screen)
      .filter(screen => screen && screen !== "unknown");
    const uniqueScreens = Array.from(new Set(predictedScreens));
    const knownScreens = await this.navigationManager.getKnownScreens();
    const knownScreenSet = new Set(knownScreens);

    const newScreensExpected = uniqueScreens.filter(screen => !knownScreenSet.has(screen)).length;
    const existingScreensToRevisit = uniqueScreens.filter(screen => knownScreenSet.has(screen)).length;

    if (currentScreen === "unknown") {
      warnings.push("Current screen is unknown; outcome predictions may be limited.");
    } else if (edges.length === 0) {
      warnings.push("No navigation edges recorded for the current screen.");
    }

    perf.end();
    return {
      success: true,
      dryRun: true,
      currentScreen: {
        name: currentScreen,
        interactableElements: allCandidates.length
      },
      plannedInteractions,
      estimatedCoverage: {
        screensToVisit: uniqueScreens,
        newScreensExpected,
        existingScreensToRevisit
      },
      warnings,
      observation,
      durationMs: this.timer.now() - startTime
    };
  }

  /**
   * Check if exploration should continue
   */
  private shouldContinue(
    maxInteractions: number,
    timeoutMs: number,
    startTime: number
  ): boolean {
    const elapsed = this.timer.now() - startTime;

    if (this.interactionCount >= maxInteractions) {
      this.stopReason = `Reached max interactions limit (${maxInteractions})`;
      logger.info(`[Explore] ${this.stopReason}`);
      return false;
    }

    if (elapsed >= timeoutMs) {
      this.stopReason = `Reached timeout limit (${timeoutMs}ms)`;
      logger.info(`[Explore] ${this.stopReason}`);
      return false;
    }

    return true;
  }

  /**
   * Check for safety conditions that should stop exploration
   */
  private shouldBreakForSafety(observation: ObserveResult): boolean {
    // Check for consecutive backs
    if (this.consecutiveBackCount >= Explore.MAX_CONSECUTIVE_BACKS) {
      this.stopReason = `Too many consecutive back navigations (${Explore.MAX_CONSECUTIVE_BACKS})`;
      logger.warn(`[Explore] ${this.stopReason}`);
      return true;
    }

    // Check for screen stuck (no changes)
    if (this.consecutiveNoChangeCount >= Explore.MAX_CONSECUTIVE_NO_CHANGE) {
      this.stopReason = `Screen appears stuck - no changes detected after ${Explore.MAX_CONSECUTIVE_NO_CHANGE} interactions`;
      logger.warn(`[Explore] ${this.stopReason}`);
      return true;
    }

    // Check for loops
    const currentScreen = this.navigationManager.getCurrentScreen();
    if (currentScreen) {
      const loopCount = this.loopDetection.get(currentScreen) ?? 0;
      if (loopCount >= Explore.MAX_LOOP_ITERATIONS) {
        this.stopReason = `Detected navigation loop on screen: ${currentScreen}`;
        logger.warn(`[Explore] ${this.stopReason}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Select the next element to interact with based on strategy
   */
  private async selectNextElement(
    observation: ObserveResult,
    strategy: ExplorationStrategy,
    mode: ExplorationMode,
    perf: PerformanceTracker
  ): Promise<Element | null> {
    return await perf.track("selectNextElement", async () => {
      const viewHierarchy = observation.viewHierarchy;
      if (!viewHierarchy || viewHierarchy.hierarchy.error) {
        return null;
      }

      // Extract both navigation elements and scrollable containers
      const navigationElements = extractNavigationElements(viewHierarchy, this.elementParser);
      const scrollableContainers = extractScrollableContainers(viewHierarchy, this.elementParser);

      // Combine all interaction candidates
      const allCandidates = [...navigationElements, ...scrollableContainers];

      if (allCandidates.length === 0) {
        return null;
      }

      // In validate mode, use graph-based navigation
      if (mode === "validate" && this.graphTraversalState) {
        const currentScreen = this.navigationManager.getCurrentScreen() ?? "unknown";

        // Mark current node as visited
        if (currentScreen !== "unknown") {
          markNodeVisited(this.graphTraversalState, currentScreen);
        }

        // Select next edge to traverse
        const targetEdge = selectNextEdgeToTraverse(this.graphTraversalState, currentScreen);
        if (!targetEdge) {
          logger.info("[Explore] No more edges to traverse in validate mode");
          this.stopReason = "All edges in navigation graph have been traversed";
          return null;
        }

        // Find element that matches the target edge
        const match = findElementMatchingEdge(allCandidates, targetEdge);
        if (!match) {
          const errorMsg =
            `Validate mode: Cannot find element matching edge ${targetEdge.from}->${targetEdge.to}. ` +
            `App may have diverged from known graph.`;
          logger.error(`[Explore] ${errorMsg}`);
          this.stopReason = errorMsg;

          // Mark edge as failed
          markEdgeTraversed(
            this.graphTraversalState,
            targetEdge,
            null,
            false,
            this.timer,
            "Element not found on screen"
          );

          return null;
        }

        logger.info(
          `[Explore] Validate mode: targeting edge ${targetEdge.from}->${targetEdge.to} ` +
            `(confidence: ${(match.confidence * 100).toFixed(0)}%)`
        );

        // Store target edge and confidence for post-interaction validation
        this.currentTargetEdge = targetEdge;
        this.currentElementConfidence = match.confidence;

        return match.element;
      }

      // Discovery and hybrid modes: use traditional element selection
      // Clear validate mode state
      this.currentTargetEdge = null;
      this.currentElementConfidence = 0;

      // Filter out exhausted elements
      const currentScreen = this.navigationManager.getCurrentScreen();
      const unexhaustedElements = filterUnexhaustedElements(
        allCandidates,
        this.exploredElements,
        currentScreen
      );

      if (unexhaustedElements.length === 0) {
        return null;
      }

      // Select based on strategy
      switch (strategy) {
        case "breadth-first":
          return selectBreadthFirst(unexhaustedElements);
        case "depth-first":
          return selectDepthFirst(unexhaustedElements, this.exploredElements);
        case "weighted":
        default: {
          const result = selectWeighted(unexhaustedElements, mode, this.exploredElements);
          if (result) {
            // Record selection stats
            this.elementSelections.push(result.stats);
            return result.element;
          }
          return null;
        }
      }
    });
  }

  private getObservationPackageName(observation: ObserveResult): string | null {
    const packageName =
      observation.viewHierarchy?.packageName ??
      observation.activeWindow?.appId ??
      null;

    if (!packageName) {
      return null;
    }

    const trimmed = packageName.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private async enforceTargetApp(
    observation: ObserveResult,
    targetPackageName: string,
    progress?: ProgressCallback
  ): Promise<"ok" | "handled" | "stop"> {
    const currentPackage = this.getObservationPackageName(observation);

    if (!currentPackage || currentPackage === targetPackageName) {
      this.consecutiveOutOfAppCount = 0;
      return "ok";
    }

    this.consecutiveOutOfAppCount++;
    logger.warn(
      `[Explore] Foreground package '${currentPackage}' is outside target '${targetPackageName}', attempting to return`
    );

    await this.handleDeadEnd(progress);

    if (this.consecutiveOutOfAppCount >= Explore.MAX_OUT_OF_APP_ATTEMPTS) {
      this.stopReason =
        `Left target app (${targetPackageName}) and could not return after ` +
        `${Explore.MAX_OUT_OF_APP_ATTEMPTS} attempts`;
      logger.warn(`[Explore] ${this.stopReason}`);
      return "stop";
    }

    return "handled";
  }

  /**
   * Perform interaction with selected element
   */
  private async performInteraction(
    element: Element,
    observation: ObserveResult,
    progress?: ProgressCallback,
    perf?: PerformanceTracker,
    signal?: AbortSignal
  ): Promise<boolean> {
    const elementKey = getElementKey(element);
    const currentScreen = this.navigationManager.getCurrentScreen() ?? "unknown";

    try {
      // Update tracking
      const tracked = this.exploredElements.get(elementKey) ?? {
        text: element.text,
        resourceId: element["resource-id"],
        contentDesc: element["content-desc"],
        className: element["class"],
        interactionCount: 0,
        lastInteractionScreen: currentScreen
      };

      tracked.interactionCount++;
      tracked.lastInteractionScreen = currentScreen;
      this.exploredElements.set(elementKey, tracked);

      // Check if element is scrollable - perform swipe instead of tap
      const isScrollable = element.scrollable === true || (element.scrollable as any) === "true";

      if (isScrollable) {
        // Perform swipe on scrollable container
        logger.info(`[Explore] Swiping on scrollable container: ${element["resource-id"] || element["class"]}`);
        const swipeOn = new SwipeOnElement(this.device, this.adb);

        const swipeResult = await swipeOn.execute(
          element,
          "up",
          { duration: 600 }, // Slow swipe
          progress,
          signal
        );

        // Reset consecutive back count since we did a swipe
        this.consecutiveBackCount = 0;

        return swipeResult.success;
      } else {
        // Perform tap interaction
        const tapOn = new TapOnElement(this.device, this.adb);

        const tapResult = await tapOn.execute(
          {
            text: element.text,
            elementId: element["resource-id"],
            action: "tap"
          },
          progress,
          signal
        );

        // Reset consecutive back count since we did a tap
        this.consecutiveBackCount = 0;

        return tapResult.success;
      }
    } catch (error) {
      logger.warn(`[Explore] Failed to interact with element: ${error}`);
      return false;
    }
  }

  /**
   * Handle dead-end situation by going back
   */
  private async handleDeadEnd(progress?: ProgressCallback): Promise<void> {
    try {
      if (progress) {
        await progress(
          this.interactionCount,
          this.interactionCount + 1,
          "Dead end detected, navigating back..."
        );
      }

      // Press back button via accessibility service, fall back to ADB
      let backSuccess = false;
      try {
        const client = AndroidCtrlProxyClient.getInstance(this.device, this.adbFactory);
        const result = await client.requestGlobalAction("back", 3000);
        backSuccess = result.success;
      } catch {
        // Fall through to ADB
      }
      if (!backSuccess) {
        await this.adb.executeCommand("shell input keyevent KEYCODE_BACK");
      }
      this.consecutiveBackCount++;

      // Wait briefly for navigation
      await this.timer.sleep(1000);
    } catch (error) {
      logger.warn(`[Explore] Failed to navigate back: ${error}`);
    }
  }

  /**
   * Reset to home screen
   */
  private async resetToHome(progress?: ProgressCallback): Promise<void> {
    try {
      if (progress) {
        await progress(
          this.interactionCount,
          this.interactionCount + 1,
          "Resetting to home screen..."
        );
      }

      // Press home button via accessibility service, fall back to ADB
      let homeSuccess = false;
      try {
        const client = AndroidCtrlProxyClient.getInstance(this.device, this.adbFactory);
        const result = await client.requestGlobalAction("home", 3000);
        homeSuccess = result.success;
      } catch {
        // Fall through to ADB
      }
      if (!homeSuccess) {
        await this.adb.executeCommand("shell input keyevent KEYCODE_HOME");
      }

      // Wait for home screen
      await this.timer.sleep(2000);

      // Reset consecutive back count
      this.consecutiveBackCount = 0;
    } catch (error) {
      logger.warn(`[Explore] Failed to reset to home: ${error}`);
    }
  }

  /**
   * Generate final report
   */
  private async generateReport(
    initialGraph: ExportedGraph,
    startTime: number,
    cancelled: boolean
  ): Promise<ExploreResult> {
    const finalGraph = await this.navigationManager.exportGraph();
    const screensDiscovered = finalGraph.nodes.length - initialGraph.nodes.length;
    const edgesAdded = finalGraph.edges.length - initialGraph.edges.length;

    // Calculate coverage
    const totalScreens = finalGraph.nodes.length;
    const exploredScreens = new Set(this.explorationPath).size;
    const coveragePercentage =
      totalScreens > 0 ? (exploredScreens / totalScreens) * 100 : 0;

    // Build graph traversal metrics if in validate mode
    let graphTraversal: ExploreResult["graphTraversal"];
    if (this.graphTraversalState) {
      const traversalCoverage =
        this.graphTraversalState.totalEdgesInGraph > 0
          ? (this.graphTraversalState.traversedEdges.size /
              this.graphTraversalState.totalEdgesInGraph) *
            100
          : 0;

      graphTraversal = {
        nodesVisited: this.graphTraversalState.visitedNodes.size,
        totalNodes: this.graphTraversalState.totalNodesInGraph,
        edgesTraversed: this.graphTraversalState.traversedEdges.size,
        totalEdges: this.graphTraversalState.totalEdgesInGraph,
        edgeValidationResults: Array.from(this.graphTraversalState.edgeValidationResults.values()),
        coveragePercentage: Math.round(traversalCoverage * 100) / 100
      };
    }

    return {
      success: true,
      cancelled,
      interactionsPerformed: this.interactionCount,
      screensDiscovered,
      edgesAdded,
      navigationGraph: finalGraph,
      explorationPath: this.explorationPath,
      coverage: {
        totalScreens,
        exploredScreens,
        percentage: Math.round(coveragePercentage * 100) / 100
      },
      elementSelections: this.elementSelections,
      durationMs: this.timer.now() - startTime,
      stopReason: this.stopReason || "Exploration completed successfully",
      graphTraversal
    };
  }
}
