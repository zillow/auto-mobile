import { ActionableError, BootedDevice, Element, ObserveResult } from "../../models";
import { BaseVisualChange, ProgressCallback } from "../action/BaseVisualChange";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { AxeClient } from "../../utils/ios-cmdline-tools/AxeClient";
import { createGlobalPerformanceTracker, PerformanceTracker } from "../../utils/PerformanceTracker";
import { logger } from "../../utils/logger";
import { NavigationGraphManager } from "./NavigationGraphManager";
import { ExportedGraph } from "../../utils/interfaces/NavigationGraph";
import { TapOnElement } from "../action/TapOnElement";
import { ElementParser } from "../utility/ElementParser";

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

  // Constants for safety limits
  private static readonly MAX_CONSECUTIVE_BACKS = 5;
  private static readonly MAX_CONSECUTIVE_NO_CHANGE = 10;
  private static readonly MAX_LOOP_ITERATIONS = 3;
  private static readonly DEFAULT_MAX_INTERACTIONS = 50;
  private static readonly DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly DEFAULT_RESET_INTERVAL = 15;

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
    progress?: ProgressCallback
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

      if (progress) {
        await progress(0, maxInteractions, "Starting exploration...");
      }

      // Capture initial graph state
      const initialGraph = this.navigationManager.exportGraph();
      const initialNodeCount = initialGraph.nodes.length;

      // Main exploration loop
      while (this.shouldContinue(maxInteractions, timeoutMs, startTime)) {
        // Get current screen state
        const observation = await this.observeScreen.execute();

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
        const interactionSuccess = await this.performInteraction(
          nextElement,
          observation,
          progress,
          perf
        );

        if (interactionSuccess) {
          this.interactionCount++;
          this.consecutiveNoChangeCount = 0;
        } else {
          this.consecutiveNoChangeCount++;
        }

        // Report progress
        if (progress) {
          const currentNodeCount = this.navigationManager.exportGraph().nodes.length;
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
      return this.generateReport(initialGraph, startTime);
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
      logger.info(`[Explore] Reached max interactions: ${maxInteractions}`);
      return false;
    }

    if (elapsed >= timeoutMs) {
      logger.info(`[Explore] Reached timeout: ${timeoutMs}ms`);
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
      logger.warn("[Explore] Too many consecutive backs");
      return true;
    }

    // Check for screen stuck (no changes)
    if (this.consecutiveNoChangeCount >= Explore.MAX_CONSECUTIVE_NO_CHANGE) {
      logger.warn("[Explore] Screen appears stuck (no changes detected)");
      return true;
    }

    // Check for loops
    const currentScreen = this.navigationManager.getCurrentScreen();
    if (currentScreen) {
      const loopCount = this.loopDetection.get(currentScreen) ?? 0;
      if (loopCount >= Explore.MAX_LOOP_ITERATIONS) {
        logger.warn(`[Explore] Detected loop on screen: ${currentScreen}`);
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

      // Extract navigation elements from view hierarchy
      const navigationElements = this.extractNavigationElements(viewHierarchy);

      if (navigationElements.length === 0) {
        return null;
      }

      // Filter out exhausted elements
      const unexhaustedElements = this.filterUnexhaustedElements(navigationElements);

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

  /**
   * Extract elements likely to be navigation controls
   */
  private extractNavigationElements(viewHierarchy: any): Element[] {
    const flatElements = this.elementParser.flattenViewHierarchy(viewHierarchy);
    const navigationElements: Element[] = [];

    for (const { element } of flatElements) {
      if (this.isNavigationCandidate(element)) {
        navigationElements.push(element);
      }
    }

    return navigationElements;
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

    const className = element["class"]?.toLowerCase() ?? "";
    const text = element.text?.toLowerCase() ?? "";
    const resourceId = element["resource-id"]?.toLowerCase() ?? "";
    const contentDesc = element["content-desc"]?.toLowerCase() ?? "";

    // Element type weights
    if (className.includes("button")) {
      score += 10;
    }
    if (className.includes("tab")) {
      score += 15;
    }
    if (className.includes("menuitem")) {
      score += 12;
    }
    if (className.includes("imagebutton")) {
      score += 8;
    }

    // Text analysis - navigation keywords
    const navKeywords = ["settings", "profile", "menu", "more", "details", "open", "next", "continue", "back", "close"];
    for (const keyword of navKeywords) {
      if (text.includes(keyword) || contentDesc.includes(keyword)) {
        score += 8;
        break;
      }
    }

    // Resource ID patterns
    if (resourceId.includes("nav_")) {
      score += 10;
    }
    if (resourceId.includes("menu_")) {
      score += 8;
    }
    if (resourceId.includes("tab_")) {
      score += 12;
    }
    if (resourceId.includes("btn_")) {
      score += 5;
    }

    // Penalize likely non-navigation elements
    const nonNavKeywords = ["like", "share", "favorite", "heart", "star"];
    for (const keyword of nonNavKeywords) {
      if (text.includes(keyword) || contentDesc.includes(keyword)) {
        score -= 5;
        break;
      }
    }

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
    perf?: PerformanceTracker
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

      // Update loop detection
      const loopCount = this.loopDetection.get(currentScreen) ?? 0;
      this.loopDetection.set(currentScreen, loopCount + 1);

      // Perform tap interaction
      const tapOn = new TapOnElement(this.device, this.adb, this.axe);

      const tapResult = await tapOn.execute(
        {
          text: element.text,
          elementId: element["resource-id"],
          action: "tap"
        },
        progress
      );

      // Reset consecutive back count since we did a tap
      this.consecutiveBackCount = 0;

      return tapResult.success;
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
  private generateReport(
    initialGraph: ExportedGraph,
    startTime: number
  ): ExploreResult {
    const finalGraph = this.navigationManager.exportGraph();
    const screensDiscovered = finalGraph.nodes.length - initialGraph.nodes.length;
    const edgesAdded = finalGraph.edges.length - initialGraph.edges.length;

    // Calculate coverage
    const totalScreens = finalGraph.nodes.length;
    const exploredScreens = new Set(this.explorationPath).size;
    const coveragePercentage =
      totalScreens > 0 ? (exploredScreens / totalScreens) * 100 : 0;

    return {
      success: true,
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
      durationMs: Date.now() - startTime
    };
  }
}
