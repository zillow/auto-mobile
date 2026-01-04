import { ActionableError, BootedDevice, Element, ObserveResult } from "../../models";
import { BaseVisualChange, ProgressCallback } from "../action/BaseVisualChange";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { AxeClient } from "../../utils/ios-cmdline-tools/AxeClient";
import { createGlobalPerformanceTracker, PerformanceTracker } from "../../utils/PerformanceTracker";
import { logger } from "../../utils/logger";
import { NavigationGraphManager } from "./NavigationGraphManager";
import { ExportedGraph } from "../../utils/interfaces/NavigationGraph";
import { TapOnElement } from "../action/TapOnElement";
import { SwipeOnElement } from "../action/SwipeOnElement";
import { ElementParser } from "../utility/ElementParser";
import { throwIfAborted } from "../../utils/toolUtils";
import { OPERATION_CANCELLED_MESSAGE } from "../../utils/constants";

/**
 * Exploration strategies for explore
 */
export type ExplorationStrategy = "breadth-first" | "depth-first" | "weighted";

/**
 * Exploration modes for explore
 */
export type ExplorationMode = "discover" | "validate" | "hybrid";

/**
 * Options for Explore execution
 */
export interface ExploreOptions {
  /** Maximum number of interactions to perform */
  maxInteractions?: number;

  /** Maximum time in milliseconds */
  timeoutMs?: number;

  /** Strategy for selecting next interaction */
  strategy?: ExplorationStrategy;

  /** Whether to reset to home screen periodically */
  resetToHome?: boolean;

  /** How often to reset (every N interactions) */
  resetInterval?: number;

  /** Exploration mode */
  mode?: ExplorationMode;

  /** Package name to limit exploration to */
  packageName?: string;
}

/**
 * Statistics about element selection during exploration
 */
export interface ElementSelectionStats {
  text?: string;
  resourceId?: string;
  className?: string;
  score: number;
  novelty: number;
  coverage: number;
  finalScore: number;
}

/**
 * Result of Explore execution
 */
export interface ExploreResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
  interactionsPerformed: number;
  screensDiscovered: number;
  edgesAdded: number;
  navigationGraph: ExportedGraph;
  explorationPath: string[];
  coverage: {
    totalScreens: number;
    exploredScreens: number;
    percentage: number;
  };
  elementSelections?: ElementSelectionStats[];
  observation?: ObserveResult;
  durationMs: number;
  stopReason?: string;
}

/**
 * Tracked element interaction state
 */
interface TrackedElement {
  text?: string;
  resourceId?: string;
  contentDesc?: string;
  className?: string;
  interactionCount: number;
  lastInteractionScreen: string;
}

/**
 * Explore implements intelligent app navigation exploration.
 * Perpetually explores until all navigation destinations have been reached by
 * automatically discovering navigation paths, prioritizing likely navigation elements,
 * avoiding redundant interactions, and efficiently covering unexplored screens.
 */
export class Explore extends BaseVisualChange {
  private navigationManager: NavigationGraphManager;
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

  // Constants for safety limits
  private static readonly MAX_CONSECUTIVE_BACKS = 5;
  private static readonly MAX_CONSECUTIVE_NO_CHANGE = 40; // Increased to allow more exploration
  private static readonly MAX_LOOP_ITERATIONS = 3;
  private static readonly DEFAULT_MAX_INTERACTIONS = 200; // Increased to allow thorough exploration
  private static readonly DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly DEFAULT_RESET_INTERVAL = 15;
  private static readonly MAX_OUT_OF_APP_ATTEMPTS = 5;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    axe: AxeClient | null = null
  ) {
    super(device, adb, axe);
    this.navigationManager = NavigationGraphManager.getInstance();
    this.exploredElements = new Map();
    this.elementParser = new ElementParser();
  }

  /**
   * Execute exploration
   */
  async execute(
    options: ExploreOptions = {},
    progress?: ProgressCallback,
    signal?: AbortSignal
  ): Promise<ExploreResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("explore");
    const startTime = Date.now();

    try {
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
          const elements = this.extractAllElements(viewHierarchy);
          if (this.isPermissionDialog(elements)) {
            logger.info("[Explore] Detected permission dialog, attempting to dismiss");
            await this.handlePermissionDialog(elements, progress);
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
        const blockerHandled = await this.detectAndHandleBlockers(observation, progress);
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
          const currentGraph = await this.navigationManager.exportGraph();
          const currentNodeCount = currentGraph.nodes.length;
          await progress(
            this.interactionCount,
            maxInteractions,
            `Explored ${currentNodeCount - initialNodeCount} new screens (${this.interactionCount}/${maxInteractions} interactions)`
          );
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

  /**
   * Check if exploration should continue
   */
  private shouldContinue(
    maxInteractions: number,
    timeoutMs: number,
    startTime: number
  ): boolean {
    const elapsed = Date.now() - startTime;

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
      const navigationElements = this.extractNavigationElements(viewHierarchy);
      const scrollableContainers = this.extractScrollableContainers(viewHierarchy);

      // Combine all interaction candidates
      const allCandidates = [...navigationElements, ...scrollableContainers];

      if (allCandidates.length === 0) {
        return null;
      }

      // Filter out exhausted elements
      const unexhaustedElements = this.filterUnexhaustedElements(allCandidates);

      if (unexhaustedElements.length === 0) {
        return null;
      }

      // Select based on strategy
      switch (strategy) {
        case "breadth-first":
          return this.selectBreadthFirst(unexhaustedElements);
        case "depth-first":
          return this.selectDepthFirst(unexhaustedElements);
        case "weighted":
        default:
          return this.selectWeighted(unexhaustedElements, mode);
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
   * Extract elements likely to be navigation controls
   */
  private extractNavigationElements(viewHierarchy: any): Element[] {
    const flatElements = this.elementParser.flattenViewHierarchy(viewHierarchy);
    const navigationElements: Element[] = [];
    const targetPackage = viewHierarchy.packageName;

    for (const { element, depth } of flatElements) {
      if (this.isNavigationCandidate(element)) {
        // Filter by package name if available (keep only elements from target app)
        if (targetPackage && element.package && element.package !== targetPackage) {
          continue;
        }

        // Enrich element with properties from child nodes (for Compose UI)
        const enrichedElement = this.enrichElementWithChildProperties(element);

        // Store depth information for scoring
        (enrichedElement as any).hierarchyDepth = depth;

        navigationElements.push(enrichedElement);
      }
    }

    return navigationElements;
  }

  /**
   * Enrich element with properties from child nodes (for Compose UI elements)
   */
  private enrichElementWithChildProperties(element: Element): Element {
    const enriched = { ...element };

    // For Compose elements, text and className might be on child nodes
    if ((element as any).node) {
      const children = Array.isArray((element as any).node) ? (element as any).node : [(element as any).node];

      for (const child of children) {
        // Extract text from first child with text
        if (!enriched.text && child.text) {
          enriched.text = child.text;
        }

        // Extract className from first child with className
        if (!enriched["class"] && child.className) {
          enriched["class"] = child.className;
        }

        // Extract content-desc from first child with content-desc
        if (!enriched["content-desc"] && child["content-desc"]) {
          enriched["content-desc"] = child["content-desc"];
        }
      }
    }

    return enriched;
  }

  /**
   * Extract scrollable containers for swiping
   */
  private extractScrollableContainers(viewHierarchy: any): Element[] {
    const flatElements = this.elementParser.flattenViewHierarchy(viewHierarchy);
    const scrollableContainers: Element[] = [];
    const targetPackage = viewHierarchy.packageName;

    for (const { element, depth } of flatElements) {
      // Must be scrollable
      const isScrollable = element.scrollable === true || (element.scrollable as any) === "true";
      if (!isScrollable) {
        continue;
      }

      // Filter by package name if available
      if (targetPackage && element.package && element.package !== targetPackage) {
        continue;
      }

      // Must have reasonable size for scrolling
      if (element.bounds) {
        const width = element.bounds.right - element.bounds.left;
        const height = element.bounds.bottom - element.bounds.top;
        if (width < 50 || height < 50) {
          continue;
        }
      }

      // Store depth information for scoring
      (element as any).hierarchyDepth = depth;

      scrollableContainers.push(element);
    }

    return scrollableContainers;
  }

  /**
   * Check if element is a navigation candidate
   */
  private isNavigationCandidate(element: Element): boolean {
    // Must be clickable (handle both boolean and string values from XML parsing)
    const isClickable = element.clickable === true || (element.clickable as any) === "true";
    if (!isClickable) {
      return false;
    }

    // Must be enabled (handle both boolean and string values from XML parsing)
    const isEnabled = element.enabled !== false && (element.enabled as any) !== "false";
    if (!isEnabled) {
      return false;
    }

    // Must have reasonable size
    if (element.bounds) {
      const width = element.bounds.right - element.bounds.left;
      const height = element.bounds.bottom - element.bounds.top;
      if (width < 10 || height < 10) {
        return false;
      }
    }

    // Check if it looks like a navigation element
    const className = element["class"]?.toLowerCase() ?? "";

    // Avoid input elements
    if (className.includes("edittext") || className.includes("textfield")) {
      return false;
    }

    // Avoid checkboxes and switches
    if (className.includes("checkbox") || className.includes("switch")) {
      return false;
    }

    return true;
  }

  /**
   * Calculate navigation score for an element
   */
  private calculateNavigationScore(element: Element): number {
    let score = 0;

    const clickable = element.clickable === true || (element.clickable as any) === "true";
    const scrollable = element.scrollable === true || (element.scrollable as any) === "true";

    // Clickable bonus - clickable elements are more likely to be interactive
    if (clickable) {
      score += 5;
    }

    // Scrollable bonus - scrollable containers can reveal new content
    if (scrollable) {
      score += 3;
    }

    // Hierarchy depth bonus - linear function where closer to root = higher score
    // Formula: max(0, 25 - depth * 2)
    // depth 0: +25, depth 3: +19, depth 6: +13, depth 10: +5, depth 12+: 0
    const depth = (element as any).hierarchyDepth ?? 99;
    const depthBonus = Math.max(0, 25 - depth * 2);
    score += depthBonus;

    return Math.max(0, score);
  }

  /**
   * Calculate novelty score based on previous interactions
   */
  private calculateNoveltyScore(element: Element): number {
    const elementKey = this.getElementKey(element);
    const tracked = this.exploredElements.get(elementKey);

    // High score for never-explored elements
    if (!tracked) {
      return 10;
    }

    // Reduce score based on interaction count
    return Math.max(1, 10 - tracked.interactionCount);
  }

  /**
   * Estimate coverage gain from interacting with element
   */
  private estimateCoverageGain(element: Element): number {
    // For now, use a simple heuristic based on navigation score
    // Future: could use ML or historical data
    const navScore = this.calculateNavigationScore(element);
    return Math.max(1, navScore / 10);
  }

  /**
   * Filter out elements that have been exhausted
   */
  private filterUnexhaustedElements(elements: Element[]): Element[] {
    const currentScreen = this.navigationManager.getCurrentScreen();

    return elements.filter(element => {
      const elementKey = this.getElementKey(element);
      const tracked = this.exploredElements.get(elementKey);

      // Allow if never tried
      if (!tracked) {
        return true;
      }

      // Allow if tried on different screen
      if (tracked.lastInteractionScreen !== currentScreen) {
        return true;
      }

      // Filter out if tried too many times from this screen
      return tracked.interactionCount < 2;
    });
  }

  /**
   * Breadth-first selection: prefer unexplored elements on current screen
   */
  private selectBreadthFirst(elements: Element[]): Element | null {
    if (elements.length === 0) {
      return null;
    }

    // Sort by navigation score
    const sorted = elements.sort((a, b) => {
      return this.calculateNavigationScore(b) - this.calculateNavigationScore(a);
    });

    return sorted[0];
  }

  /**
   * Depth-first selection: follow promising paths deeply
   */
  private selectDepthFirst(elements: Element[]): Element | null {
    if (elements.length === 0) {
      return null;
    }

    // Prefer elements we haven't tried yet, then by score
    const sorted = elements.sort((a, b) => {
      const aNever = !this.exploredElements.has(this.getElementKey(a));
      const bNever = !this.exploredElements.has(this.getElementKey(b));

      if (aNever && !bNever) {
        return -1;
      }
      if (!aNever && bNever) {
        return 1;
      }

      return this.calculateNavigationScore(b) - this.calculateNavigationScore(a);
    });

    return sorted[0];
  }

  /**
   * Weighted selection: balance navigation score, novelty, and coverage
   */
  private selectWeighted(
    elements: Element[],
    mode: ExplorationMode
  ): Element | null {
    if (elements.length === 0) {
      return null;
    }

    // Calculate scores for each element
    const scored = elements.map(element => {
      const navScore = this.calculateNavigationScore(element);
      const novelty = this.calculateNoveltyScore(element);
      const coverage = this.estimateCoverageGain(element);

      // Adjust weights based on mode
      let finalScore: number;
      if (mode === "discover") {
        // Heavily favor novelty and coverage
        finalScore = navScore * 0.3 + novelty * 0.4 + coverage * 0.3;
      } else if (mode === "validate") {
        // Favor previously explored elements
        finalScore = navScore * 0.5 + (10 - novelty) * 0.3 + coverage * 0.2;
      } else {
        // Hybrid: balanced approach
        finalScore = navScore * 0.4 + novelty * 0.4 + coverage * 0.2;
      }

      return {
        element,
        navScore,
        novelty,
        coverage,
        finalScore
      };
    });

    // Sort by final score
    scored.sort((a, b) => b.finalScore - a.finalScore);

    // Record selection stats
    const selected = scored[0];
    this.elementSelections.push({
      text: selected.element.text,
      resourceId: selected.element["resource-id"],
      className: selected.element["class"],
      score: selected.navScore,
      novelty: selected.novelty,
      coverage: selected.coverage,
      finalScore: selected.finalScore
    });

    return selected.element;
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
    const elementKey = this.getElementKey(element);
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
        const swipeOn = new SwipeOnElement(this.device, this.adb, this.axe);

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
        const tapOn = new TapOnElement(this.device, this.adb, this.axe);

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
   * Detect and handle blocker screens (login, permissions, dialogs)
   */
  private async detectAndHandleBlockers(
    observation: ObserveResult,
    progress?: ProgressCallback
  ): Promise<boolean> {
    const viewHierarchy = observation.viewHierarchy;
    if (!viewHierarchy || viewHierarchy.hierarchy.error) {
      return false;
    }

    // Look for common blocker patterns
    const elements = this.extractAllElements(viewHierarchy);

    // Check for permission dialogs
    if (this.isPermissionDialog(elements)) {
      logger.info("[Explore] Detected permission dialog, attempting to dismiss");
      return await this.handlePermissionDialog(elements, progress);
    }

    // Check for login/signup screens
    if (this.isLoginScreen(elements)) {
      logger.info("[Explore] Detected login screen, skipping by going back");
      await this.handleDeadEnd(progress);
      return true;
    }

    // Check for app rating/review dialogs
    if (this.isRatingDialog(elements)) {
      logger.info("[Explore] Detected rating dialog, attempting to dismiss");
      return await this.dismissDialog(elements, progress);
    }

    return false;
  }

  /**
   * Extract all elements from hierarchy (including non-clickable)
   */
  private extractAllElements(viewHierarchy: any): Element[] {
    const flatElements = this.elementParser.flattenViewHierarchy(viewHierarchy);
    return flatElements.map(({ element }) => element);
  }

  /**
   * Check if screen is a permission dialog
   */
  private isPermissionDialog(elements: Element[]): boolean {
    const permissionKeywords = [
      "allow",
      "permission",
      "access",
      "deny",
      "don't allow",
      "while using",
      "only this time"
    ];

    return elements.some(el => {
      const text = (el.text?.toLowerCase() ?? "") + (el["content-desc"]?.toLowerCase() ?? "");
      return permissionKeywords.some(keyword => text.includes(keyword));
    });
  }

  /**
   * Check if screen is a login/signup screen
   */
  private isLoginScreen(elements: Element[]): boolean {
    const loginKeywords = ["login", "sign in", "sign up", "username", "password", "email"];
    const hasEditText = elements.some(el => el["class"]?.toLowerCase().includes("edittext"));

    const hasLoginText = elements.some(el => {
      const text = (el.text?.toLowerCase() ?? "") + (el["content-desc"]?.toLowerCase() ?? "");
      return loginKeywords.some(keyword => text.includes(keyword));
    });

    // Login screen typically has text fields and login-related text
    return hasEditText && hasLoginText;
  }

  /**
   * Check if screen is a rating/review dialog
   */
  private isRatingDialog(elements: Element[]): boolean {
    const ratingKeywords = ["rate", "review", "feedback", "enjoy", "star"];

    return elements.some(el => {
      const text = (el.text?.toLowerCase() ?? "") + (el["content-desc"]?.toLowerCase() ?? "");
      return ratingKeywords.some(keyword => text.includes(keyword));
    });
  }

  /**
   * Handle permission dialog by clicking "Allow" or similar
   */
  private async handlePermissionDialog(
    elements: Element[],
    progress?: ProgressCallback
  ): Promise<boolean> {
    // Look for "Allow" or "While using" buttons
    const allowKeywords = ["allow", "while using", "only this time", "ok"];

    for (const element of elements) {
      if (!element.clickable) {
        continue;
      }

      const text = (element.text?.toLowerCase() ?? "") + (element["content-desc"]?.toLowerCase() ?? "");

      if (allowKeywords.some(keyword => text.includes(keyword))) {
        try {
          const tapOn = new TapOnElement(this.device, this.adb, this.axe);
          await tapOn.execute(
            {
              text: element.text,
              elementId: element["resource-id"],
              action: "tap"
            },
            progress
          );
          await new Promise(resolve => setTimeout(resolve, 1000));
          return true;
        } catch (error) {
          logger.warn(`[Explore] Failed to handle permission dialog: ${error}`);
        }
      }
    }

    return false;
  }

  /**
   * Dismiss dialog by clicking dismiss/close/later buttons
   */
  private async dismissDialog(
    elements: Element[],
    progress?: ProgressCallback
  ): Promise<boolean> {
    const dismissKeywords = ["not now", "later", "no thanks", "dismiss", "close", "skip"];

    for (const element of elements) {
      if (!element.clickable) {
        continue;
      }

      const text = (element.text?.toLowerCase() ?? "") + (element["content-desc"]?.toLowerCase() ?? "");

      if (dismissKeywords.some(keyword => text.includes(keyword))) {
        try {
          const tapOn = new TapOnElement(this.device, this.adb, this.axe);
          await tapOn.execute(
            {
              text: element.text,
              elementId: element["resource-id"],
              action: "tap"
            },
            progress
          );
          await new Promise(resolve => setTimeout(resolve, 1000));
          return true;
        } catch (error) {
          logger.warn(`[Explore] Failed to dismiss dialog: ${error}`);
        }
      }
    }

    return false;
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

      // Press back button
      await this.adb.executeCommand("shell input keyevent KEYCODE_BACK");
      this.consecutiveBackCount++;

      // Wait briefly for navigation
      await new Promise(resolve => setTimeout(resolve, 1000));
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

      // Press home button
      await this.adb.executeCommand("shell input keyevent KEYCODE_HOME");

      // Wait for home screen
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Reset consecutive back count
      this.consecutiveBackCount = 0;
    } catch (error) {
      logger.warn(`[Explore] Failed to reset to home: ${error}`);
    }
  }

  /**
   * Generate unique key for element tracking
   */
  private getElementKey(element: Element): string {
    const parts: string[] = [];

    if (element["resource-id"]) {
      parts.push(`id:${element["resource-id"]}`);
    }
    if (element.text) {
      parts.push(`text:${element.text}`);
    }
    if (element["content-desc"]) {
      parts.push(`desc:${element["content-desc"]}`);
    }
    if (element["class"]) {
      parts.push(`class:${element["class"]}`);
    }

    return parts.join("|") || "unknown";
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
      durationMs: Date.now() - startTime,
      stopReason: this.stopReason || "Exploration completed successfully"
    };
  }
}
