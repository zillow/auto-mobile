import type { FocusNavigationDriver } from "../../src/features/talkback/FocusNavigationExecutor";
import type { A11ySwipeResult } from "../../src/features/observe/AccessibilityServiceClient";
import type { CurrentFocusResult, ScreenSize, TraversalOrderResult } from "../../src/models";
import type { Element } from "../../src/models/Element";

type SwipeDirection = "forward" | "backward";

export class FakeFocusNavigationDriver implements FocusNavigationDriver {
  screenSize: ScreenSize = { width: 1000, height: 2000 };
  elements: Element[] = [];
  focusedIndex: number | null = null;
  swipeResult: A11ySwipeResult = { success: true, totalTimeMs: 1 };
  swipeHistory: Array<{ x1: number; y1: number; x2: number; y2: number; duration: number }> = [];
  autoAdvanceOnSwipe = true;
  onSwipe: ((direction: SwipeDirection) => void) | null = null;
  private traversalOverrides: TraversalOrderResult[] = [];
  private currentFocusOverrides: CurrentFocusResult[] = [];

  setElements(elements: Element[], focusedIndex: number | null): void {
    this.elements = elements;
    this.focusedIndex = focusedIndex;
  }

  replaceElements(elements: Element[], preserveFocus: boolean = true): void {
    const focusedElement = preserveFocus ? this.getFocusedElement() : null;
    this.elements = elements;
    if (focusedElement) {
      const focusedKey = this.getElementKey(focusedElement);
      const index = focusedKey
        ? elements.findIndex(element => this.getElementKey(element) === focusedKey)
        : -1;
      this.focusedIndex = index === -1 ? null : index;
    }
  }

  setScreenSize(size: ScreenSize): void {
    this.screenSize = size;
  }

  setSwipeResult(result: A11ySwipeResult): void {
    this.swipeResult = result;
  }

  queueTraversalResult(result: TraversalOrderResult): void {
    this.traversalOverrides.push(result);
  }

  queueCurrentFocusResult(result: CurrentFocusResult): void {
    this.currentFocusOverrides.push(result);
  }

  getSwipeCount(): number {
    return this.swipeHistory.length;
  }

  getFocusedElement(): Element | null {
    if (this.focusedIndex === null || this.focusedIndex === undefined) {
      return null;
    }
    return this.elements[this.focusedIndex] ?? null;
  }

  async requestTraversalOrder(): Promise<TraversalOrderResult> {
    if (this.traversalOverrides.length > 0) {
      return this.traversalOverrides.shift()!;
    }
    return {
      elements: this.elements,
      focusedIndex: this.focusedIndex,
      totalCount: this.elements.length,
      totalTimeMs: 1
    };
  }

  async requestCurrentFocus(): Promise<CurrentFocusResult> {
    if (this.currentFocusOverrides.length > 0) {
      return this.currentFocusOverrides.shift()!;
    }
    return {
      focusedElement: this.getFocusedElement(),
      totalTimeMs: 1
    };
  }

  async requestSwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    durationMs: number
  ): Promise<A11ySwipeResult> {
    this.swipeHistory.push({ x1, y1, x2, y2, duration: durationMs });
    const direction = this.getDirection(x1, x2);

    if (this.autoAdvanceOnSwipe) {
      this.advanceFocus(direction);
    }

    if (this.onSwipe) {
      this.onSwipe(direction);
    }

    return this.swipeResult;
  }

  async getScreenSize(): Promise<ScreenSize> {
    return this.screenSize;
  }

  private getDirection(startX: number, endX: number): SwipeDirection {
    return endX > startX ? "forward" : "backward";
  }

  private advanceFocus(direction: SwipeDirection): void {
    if (this.elements.length === 0) {
      return;
    }
    if (this.focusedIndex === null || this.focusedIndex === undefined) {
      this.focusedIndex = 0;
      return;
    }
    const nextIndex = direction === "forward"
      ? Math.min(this.elements.length - 1, this.focusedIndex + 1)
      : Math.max(0, this.focusedIndex - 1);
    this.focusedIndex = nextIndex;
  }

  private getElementKey(element: Element): string | null {
    const resourceId = element["resource-id"];
    if (typeof resourceId === "string" && resourceId.length > 0) {
      return `resource:${resourceId}`;
    }
    if (typeof element.text === "string" && element.text.length > 0) {
      return `text:${element.text}`;
    }
    return null;
  }
}
