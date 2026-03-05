import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import {
  BootedDevice,
  Element,
  ObserveResult,
  ViewHierarchyResult
} from "../../models";
import { SetUIStateOptions, FieldSpec, ElementSelector } from "../../models/SetUIStateOptions";
import { SetUIStateResult, FieldResult, FieldType } from "../../models/SetUIStateResult";
import { FieldTypeDetector } from "./FieldTypeDetector";
import type { ElementFinder } from "../../utils/interfaces/ElementFinder";
import { DefaultElementFinder } from "../utility/ElementFinder";
import { logger } from "../../utils/logger";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import type { ObserveScreen } from "../observe/interfaces/ObserveScreen";

/**
 * Interface for TapOnElement dependency
 */
interface TapOnElementLike {
  execute(
    options: { text?: string; elementId?: string; action: string; container?: { text?: string; elementId?: string } },
    progress?: ProgressCallback,
    signal?: AbortSignal
  ): Promise<{ success: boolean; element?: Element; observation?: ObserveResult; error?: string }>;
}

/**
 * Interface for InputText dependency
 */
interface InputTextLike {
  execute(text: string, imeAction?: string): Promise<{ success: boolean; text: string; observation?: ObserveResult; error?: string }>;
}

/**
 * Interface for ClearText dependency
 */
interface ClearTextLike {
  execute(progress?: ProgressCallback): Promise<{ success: boolean; observation?: ObserveResult; error?: string }>;
}

/**
 * Interface for SwipeOn dependency
 */
interface SwipeOnLike {
  execute(
    options: { direction: string; lookFor?: { text?: string; elementId?: string }; scrollToFind?: boolean },
    progress?: ProgressCallback
  ): Promise<{ success: boolean; found?: boolean; element?: Element; observation?: ObserveResult; error?: string }>;
}

/**
 * Dependencies that can be injected for testing
 */
interface SetUIStateDependencies {
  tapOnElement?: TapOnElementLike;
  inputText?: InputTextLike;
  clearText?: ClearTextLike;
  swipeOn?: SwipeOnLike;
  observeScreen?: ObserveScreen;
  fieldTypeDetector?: FieldTypeDetector;
  timer?: Timer;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_SCROLL_DIRECTION = "down";
const MAX_FUTILE_SCROLLS = 3;

/**
 * SetUIState - Declarative form field population tool
 *
 * Populates form fields by specifying desired end-state rather than procedural steps.
 * Orchestrates existing tools (TapOnElement, InputText, ClearText, SwipeOn, ObserveScreen)
 * with automatic retry and verification.
 *
 * Fields are processed in screen order (top-to-bottom by bounds.top) as the form is scrolled,
 * regardless of the order provided by the caller.
 */
export class SetUIState extends BaseVisualChange {
  private fieldTypeDetector: FieldTypeDetector;
  private finder: ElementFinder;
  private dependencies: SetUIStateDependencies;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    dependencies: SetUIStateDependencies = {},
    finder: ElementFinder = new DefaultElementFinder()
  ) {
    super(device, adb, dependencies.timer ?? defaultTimer);
    this.fieldTypeDetector = dependencies.fieldTypeDetector ?? new FieldTypeDetector();
    this.finder = finder;
    this.dependencies = dependencies;
  }

  /**
   * Execute the setUIState operation
   * @param options - Configuration options
   * @param progress - Optional progress callback
   * @param signal - Optional abort signal
   * @returns Result of the operation
   */
  async execute(
    options: SetUIStateOptions,
    progress?: ProgressCallback,
    signal?: AbortSignal
  ): Promise<SetUIStateResult> {
    const scrollDirection = options.scrollDirection ?? DEFAULT_SCROLL_DIRECTION;

    const fieldResults: FieldResult[] = new Array(options.fields.length);
    const processed = new Set<number>();
    let totalAttempts = 0;

    // Get initial observation
    let lastObservation = await this.getObserveScreen().execute(undefined, undefined, false, 0, signal);

    let scrollsWithoutProgress = 0;
    let currentDirection: "up" | "down" = scrollDirection;
    let triedReverse = false;

    while (processed.size < options.fields.length) {
      // Find all unprocessed fields visible in the current hierarchy, sorted by bounds.top
      const visibleFields = this.findVisibleFieldsInScreenOrder(
        options.fields,
        processed,
        lastObservation?.viewHierarchy
      );

      if (visibleFields.length > 0) {
        scrollsWithoutProgress = 0;

        // Process only the topmost visible field, then re-evaluate.
        // Each edit may change layout (keyboard, reflow, dynamic fields),
        // so we re-find visible fields from a fresh observation each iteration.
        const { fieldSpec, fieldIndex, element } = visibleFields[0];
        const result = await this.processField(
          fieldSpec,
          element,
          progress,
          signal
        );

        fieldResults[fieldIndex] = result;
        processed.add(fieldIndex);
        totalAttempts += result.attempts;

        // Refresh observation after each success
        if (result.success) {
          const freshObs = await this.getObserveScreen().execute(undefined, undefined, false, 0, signal);
          if (freshObs) {
            lastObservation = freshObs;
          }
        }

        // Fail fast on failure
        if (!result.success) {
          logger.warn(`[SetUIState] Field failed, stopping: ${this.describeSelector(fieldSpec.selector)}`);
          return {
            success: false,
            fields: this.collectResults(fieldResults, options.fields, processed),
            totalAttempts,
            observation: lastObservation,
            error: result.error ?? `Failed to set field: ${this.describeSelector(fieldSpec.selector)}`
          };
        }
      } else {
        // No visible matches — scroll to find more
        scrollsWithoutProgress++;

        if (scrollsWithoutProgress > MAX_FUTILE_SCROLLS) {
          if (!triedReverse) {
            // Try reverse direction
            currentDirection = currentDirection === "down" ? "up" : "down";
            triedReverse = true;
            scrollsWithoutProgress = 0;
          } else {
            // Exhausted both directions
            break;
          }
        }

        // Scroll one step without lookFor to avoid jumping past intermediate fields.
        // Using lookFor would enable scroll-until-visible mode which can skip over
        // fields that need to be processed first in screen order.
        await this.getSwipeOn().execute(
          { direction: currentDirection },
          progress
        );

        // Re-observe after scroll
        const freshObs = await this.getObserveScreen().execute(undefined, undefined, false, 0, signal);
        if (freshObs) {
          lastObservation = freshObs;
        }
      }
    }

    // Check for any unprocessed fields
    if (processed.size < options.fields.length) {
      const missing = options.fields
        .filter((_, i) => !processed.has(i))
        .map(f => this.describeSelector(f.selector));

      return {
        success: false,
        fields: this.collectResults(fieldResults, options.fields, processed),
        totalAttempts,
        observation: lastObservation,
        error: `Fields not found after scrolling: ${missing.join(", ")}`
      };
    }

    return {
      success: true,
      fields: fieldResults,
      totalAttempts,
      observation: lastObservation
    };
  }

  /**
   * Find all unprocessed fields visible in the current hierarchy, sorted by bounds.top ascending
   */
  private findVisibleFieldsInScreenOrder(
    fields: FieldSpec[],
    processed: Set<number>,
    viewHierarchy?: ViewHierarchyResult
  ): Array<{ fieldSpec: FieldSpec; fieldIndex: number; element: Element }> {
    const matches: Array<{ fieldSpec: FieldSpec; fieldIndex: number; element: Element }> = [];

    for (let i = 0; i < fields.length; i++) {
      if (processed.has(i)) {continue;}

      const element = this.findElement(fields[i].selector, viewHierarchy);
      if (element) {
        matches.push({ fieldSpec: fields[i], fieldIndex: i, element });
      }
    }

    // Sort by bounds.top ascending (screen order)
    matches.sort((a, b) => a.element.bounds.top - b.element.bounds.top);

    return matches;
  }

  /**
   * Collect results array, filling in empty slots for unprocessed fields
   */
  private collectResults(
    results: FieldResult[],
    fields: FieldSpec[],
    processed: Set<number>
  ): FieldResult[] {
    const out: FieldResult[] = [];
    for (let i = 0; i < fields.length; i++) {
      if (processed.has(i) && results[i]) {
        out.push(results[i]);
      } else {
        out.push({
          selector: fields[i].selector,
          success: false,
          attempts: 0,
          error: `Element not found: ${this.describeSelector(fields[i].selector)}`
        });
      }
    }
    return out;
  }

  /**
   * Process a single field that has already been found
   */
  private async processField(
    fieldSpec: FieldSpec,
    initialElement: Element,
    progress?: ProgressCallback,
    signal?: AbortSignal
  ): Promise<FieldResult> {
    let attempts = 0;
    let lastError: string | undefined;
    let fieldType: FieldType | undefined;
    let element = initialElement;

    while (attempts < DEFAULT_MAX_RETRIES) {
      attempts++;

      try {
        // On retry, re-find the element via scroll
        if (attempts > 1) {
          const freshObs = await this.getObserveScreen().execute(undefined, undefined, false, 0, signal);
          const found = freshObs?.viewHierarchy
            ? this.findElement(fieldSpec.selector, freshObs.viewHierarchy)
            : null;
          if (found) {
            element = found;
          }
        }

        // Detect field type
        fieldType = this.fieldTypeDetector.detect(element);
        logger.info(`[SetUIState] Field type detected: ${fieldType} for ${this.describeSelector(fieldSpec.selector)}`);

        // Check if field already has correct value
        const alreadyCorrect = this.isFieldAlreadyCorrect(element, fieldSpec, fieldType);
        if (alreadyCorrect) {
          logger.info(`[SetUIState] Field already has correct value, skipping`);
          return {
            selector: fieldSpec.selector,
            success: true,
            attempts,
            verified: true,
            fieldType,
            skipped: true
          };
        }

        // Apply the value based on field type
        const applyResult = await this.applyFieldValue(
          element,
          fieldSpec,
          fieldType,
          progress,
          signal
        );

        if (!applyResult.success) {
          lastError = applyResult.error;
          continue;
        }

        // Skip verification when:
        // - Password field (value is masked)
        // - iOS element without value attribute
        // - Text-only selector on a mutable field type (typing replaces the label text
        //   used as the selector, so re-lookup by original text fails)
        let verified: boolean | undefined;
        const hasTextOnlySelector = fieldSpec.selector.text !== undefined && fieldSpec.selector.elementId === undefined;
        const isMutableTextField = fieldType === "text" || fieldType === "dropdown";
        const shouldSkipVerify = this.fieldTypeDetector.isPasswordField(element) ||
          this.fieldTypeDetector.shouldSkipVerification(element, fieldType) ||
          (hasTextOnlySelector && isMutableTextField);
        if (!shouldSkipVerify) {
          verified = await this.verifyFieldValue(fieldSpec, fieldType, signal);
          if (!verified) {
            lastError = `Verification failed for ${this.describeSelector(fieldSpec.selector)}`;
            continue;
          }
        }

        return {
          selector: fieldSpec.selector,
          success: true,
          attempts,
          verified,
          fieldType
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        logger.warn(`[SetUIState] Attempt ${attempts} failed: ${lastError}`);
      }
    }

    return {
      selector: fieldSpec.selector,
      success: false,
      attempts,
      error: lastError,
      fieldType
    };
  }

  /**
   * Find element in view hierarchy
   */
  private findElement(selector: ElementSelector, viewHierarchy?: ViewHierarchyResult): Element | null {
    if (!viewHierarchy) {
      return null;
    }

    if (selector.text) {
      return this.finder.findElementByText(viewHierarchy, selector.text, undefined, true, false);
    }

    if (selector.elementId) {
      return this.finder.findElementByResourceId(viewHierarchy, selector.elementId);
    }

    return null;
  }

  /**
   * Check if field already has the correct value
   */
  private isFieldAlreadyCorrect(element: Element, fieldSpec: FieldSpec, fieldType: FieldType): boolean {
    switch (fieldType) {
      case "text":
        if (fieldSpec.value !== undefined) {
          const currentValue = this.fieldTypeDetector.getTextValue(element);
          return currentValue === fieldSpec.value;
        }
        return false;

      case "checkbox":
      case "toggle":
        if (fieldSpec.selected !== undefined) {
          const isChecked = this.fieldTypeDetector.isChecked(element);
          return isChecked === fieldSpec.selected;
        }
        return false;

      case "dropdown":
        if (fieldSpec.value !== undefined) {
          const currentValue = this.fieldTypeDetector.getTextValue(element);
          return currentValue === fieldSpec.value;
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Apply value to field based on type
   */
  private async applyFieldValue(
    element: Element,
    fieldSpec: FieldSpec,
    fieldType: FieldType,
    progress?: ProgressCallback,
    signal?: AbortSignal
  ): Promise<{ success: boolean; error?: string }> {
    const tapOnElement = this.getTapOnElement();
    const inputText = this.getInputText();
    const clearText = this.getClearText();

    try {
      switch (fieldType) {
        case "text": {
          if (fieldSpec.value === undefined) {
            return { success: false, error: "value is required for text fields" };
          }

          // Tap to focus
          const tapResult = await tapOnElement.execute(
            this.buildTapOptions(fieldSpec.selector, "tap"),
            progress,
            signal
          );
          if (!tapResult.success) {
            return { success: false, error: `Failed to tap on field: ${tapResult.error}` };
          }

          // Clear existing text
          const clearResult = await clearText.execute(progress);
          if (!clearResult.success) {
            return { success: false, error: `Failed to clear text: ${clearResult.error}` };
          }

          // Input new text
          const inputResult = await inputText.execute(fieldSpec.value);
          if (!inputResult.success) {
            return { success: false, error: `Failed to input text: ${inputResult.error}` };
          }

          return { success: true };
        }

        case "checkbox":
        case "toggle": {
          if (fieldSpec.selected === undefined) {
            return { success: false, error: "selected is required for checkbox/toggle fields" };
          }

          // Check current state
          const isChecked = this.fieldTypeDetector.isChecked(element);

          // Only tap if state needs to change
          if (isChecked !== fieldSpec.selected) {
            const tapResult = await tapOnElement.execute(
              this.buildTapOptions(fieldSpec.selector, "tap"),
              progress,
              signal
            );
            if (!tapResult.success) {
              return { success: false, error: `Failed to tap checkbox/toggle: ${tapResult.error}` };
            }
          }

          return { success: true };
        }

        case "dropdown": {
          if (fieldSpec.value === undefined) {
            return { success: false, error: "value is required for dropdown fields" };
          }

          // Tap to open dropdown
          const openResult = await tapOnElement.execute(
            this.buildTapOptions(fieldSpec.selector, "tap"),
            progress,
            signal
          );
          if (!openResult.success) {
            return { success: false, error: `Failed to open dropdown: ${openResult.error}` };
          }

          // Wait a bit for dropdown to open
          await this.timer.sleep(200);

          // Tap on the desired value
          const selectResult = await tapOnElement.execute(
            { text: fieldSpec.value, action: "tap" },
            progress,
            signal
          );
          if (!selectResult.success) {
            return { success: false, error: `Failed to select dropdown value: ${selectResult.error}` };
          }

          return { success: true };
        }

        default:
          return { success: false, error: `Unknown field type: ${fieldType}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Verify field value after setting
   */
  private async verifyFieldValue(
    fieldSpec: FieldSpec,
    fieldType: FieldType,
    signal?: AbortSignal
  ): Promise<boolean> {
    // Get fresh observation
    const observation = await this.getObserveScreen().execute(undefined, undefined, false, 0, signal);
    if (!observation?.viewHierarchy) {
      return false;
    }

    // Find the element again
    const element = this.findElement(fieldSpec.selector, observation.viewHierarchy);
    if (!element) {
      return false;
    }

    // Verify based on field type
    switch (fieldType) {
      case "text":
        if (fieldSpec.value !== undefined) {
          const currentValue = this.fieldTypeDetector.getTextValue(element);
          return currentValue === fieldSpec.value;
        }
        return true;

      case "checkbox":
      case "toggle":
        if (fieldSpec.selected !== undefined) {
          const isChecked = this.fieldTypeDetector.isChecked(element);
          return isChecked === fieldSpec.selected;
        }
        return true;

      case "dropdown":
        if (fieldSpec.value !== undefined) {
          const currentValue = this.fieldTypeDetector.getTextValue(element);
          return currentValue === fieldSpec.value;
        }
        return true;

      default:
        return true;
    }
  }

  /**
   * Build tap options from selector
   */
  private buildTapOptions(
    selector: ElementSelector,
    action: string
  ): { text?: string; elementId?: string; action: string } {
    if (selector.text) {
      return { text: selector.text, action };
    }
    return { elementId: selector.elementId, action };
  }

  /**
   * Describe a selector for error messages
   */
  private describeSelector(selector: ElementSelector): string {
    if (selector.text) {
      return `text="${selector.text}"`;
    }
    if (selector.elementId) {
      return `elementId="${selector.elementId}"`;
    }
    return "unknown selector";
  }

  // Dependency getters with lazy initialization

  private getTapOnElement(): TapOnElementLike {
    if (this.dependencies.tapOnElement) {
      return this.dependencies.tapOnElement;
    }
    // Lazy import to avoid circular dependencies
    const { TapOnElement } = require("./TapOnElement");
    return new TapOnElement(this.device, this.adb);
  }

  private getInputText(): InputTextLike {
    if (this.dependencies.inputText) {
      return this.dependencies.inputText;
    }
    const { InputText } = require("./InputText");
    return new InputText(this.device, this.adb);
  }

  private getClearText(): ClearTextLike {
    if (this.dependencies.clearText) {
      return this.dependencies.clearText;
    }
    const { ClearText } = require("./ClearText");
    return new ClearText(this.device, this.adb);
  }

  private getSwipeOn(): SwipeOnLike {
    if (this.dependencies.swipeOn) {
      return this.dependencies.swipeOn;
    }
    const { SwipeOn } = require("./swipeon");
    return new SwipeOn(this.device, this.adb);
  }

  private getObserveScreen(): ObserveScreen {
    if (this.dependencies.observeScreen) {
      return this.dependencies.observeScreen;
    }
    return this.observeScreen;
  }
}
