import { Element } from "../../models";
import type { ViewHierarchyResult } from "../../models";
import type { ObserveScreen } from "../observe/interfaces/ObserveScreen";
import type { ElementFinder } from "../../utils/interfaces/ElementFinder";
import { throwIfAborted } from "../../utils/toolUtils";
import type { Timer } from "../../utils/SystemTimer";
import { defaultTimer } from "../../utils/SystemTimer";

export interface AssertVisibleOptions {
  text?: string;
  id?: string;
  containerElementId?: string;
  timeout?: number;
}

export interface AssertVisibleResult {
  success: boolean;
  message?: string;
  element?: Element;
  elapsedMs?: number;
  error?: string;
}

const DEFAULT_TIMEOUT = 3000;
const POLL_INTERVAL = 500;

export class AssertVisible {
  constructor(
    private readonly observeScreen: ObserveScreen,
    private readonly finder: ElementFinder,
    private readonly timer: Timer = defaultTimer
  ) {}

  async execute(options: AssertVisibleOptions, signal?: AbortSignal): Promise<AssertVisibleResult> {
    if (!options.text && !options.id) {
      return { success: false, error: "Either 'text' or 'id' must be specified to find an element" };
    }

    const timeout = Math.max(options.timeout ?? DEFAULT_TIMEOUT, POLL_INTERVAL);
    const maxAttempts = Math.ceil(timeout / POLL_INTERVAL);
    const startTime = this.timer.now();
    const target = options.text ? `text "${options.text}"` : `id "${options.id}"`;
    const container = options.containerElementId
      ? { elementId: options.containerElementId }
      : null;

    let lastError: string | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      throwIfAborted(signal);
      try {
        const observeResult = await this.observeScreen.execute(undefined, undefined, true, 0, signal);

        if (!observeResult.viewHierarchy) {
          lastError = "Could not get view hierarchy";
          if (attempt < maxAttempts - 1) await this.timer.sleep(POLL_INTERVAL);
          continue;
        }

        const foundElement = this.findElement(observeResult.viewHierarchy, options, container);

        if (foundElement) {
          return {
            success: true,
            message: `Element with ${target} is visible`,
            element: foundElement,
            elapsedMs: Math.round(this.timer.now() - startTime),
          };
        }

        lastError = `Element with ${target} not found`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      if (attempt < maxAttempts - 1) {
        throwIfAborted(signal);
        await this.timer.sleep(POLL_INTERVAL);
      }
    }

    return {
      success: false,
      error: `Element with ${target} not found within ${timeout}ms. ${lastError || ""}`.trim(),
      elapsedMs: Math.round(this.timer.now() - startTime),
    };
  }

  private findElement(
    viewHierarchy: ViewHierarchyResult,
    options: AssertVisibleOptions,
    container: { elementId: string } | null
  ): Element | null {
    if (options.text) {
      return this.finder.findElementByText(viewHierarchy, options.text, container, true, false);
    }
    if (options.id) {
      return this.finder.findElementByResourceId(viewHierarchy, options.id, container, true);
    }
    return null;
  }
}
