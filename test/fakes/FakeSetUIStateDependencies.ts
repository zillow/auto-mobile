import { Element, ObserveResult, ViewHierarchyResult } from "../../src/models";
import { TapOnElementResult } from "../../src/models/TapOnElementResult";
import { SendTextResult } from "../../src/models/SendTextResult";
import { ClearTextResult } from "../../src/models/ClearTextResult";
import { SwipeOnResult } from "../../src/models/SwipeOnResult";
import { FieldType } from "../../src/models/SetUIStateResult";
import { FieldTypeDetector } from "../../src/features/action/FieldTypeDetector";
import type { ObserveScreen } from "../../src/features/observe/interfaces/ObserveScreen";

/**
 * Interface for TapOnElement dependency
 */
export interface TapOnElementLike {
  execute(
    options: { text?: string; elementId?: string; action: string },
    progress?: any,
    signal?: AbortSignal
  ): Promise<TapOnElementResult>;
}

/**
 * Interface for InputText dependency
 */
export interface InputTextLike {
  execute(text: string, imeAction?: string): Promise<SendTextResult>;
}

/**
 * Interface for ClearText dependency
 */
export interface ClearTextLike {
  execute(progress?: any): Promise<ClearTextResult>;
}

/**
 * Interface for SwipeOn dependency
 */
export interface SwipeOnLike {
  execute(
    options: { direction: string; lookFor?: { text?: string; elementId?: string } },
    progress?: any
  ): Promise<SwipeOnResult>;
}

/**
 * Recorded tap call for assertions
 */
export interface TapCall {
  options: { text?: string; elementId?: string; action: string };
}

/**
 * Recorded input text call for assertions
 */
export interface InputTextCall {
  text: string;
  imeAction?: string;
}

/**
 * Recorded swipe call for assertions
 */
export interface SwipeCall {
  options: { direction: string; lookFor?: { text?: string; elementId?: string } };
}

/**
 * Fake TapOnElement for testing
 */
export class FakeTapOnElement implements TapOnElementLike {
  private calls: TapCall[] = [];
  private results: Map<string, TapOnElementResult> = new Map();
  private defaultResult: TapOnElementResult = {
    success: true,
    action: "tap",
    element: { bounds: { left: 0, top: 0, right: 100, bottom: 50 } }
  };

  async execute(
    options: { text?: string; elementId?: string; action: string },
    _progress?: any,
    _signal?: AbortSignal
  ): Promise<TapOnElementResult> {
    this.calls.push({ options });
    const key = options.text ?? options.elementId ?? "";
    return this.results.get(key) ?? this.defaultResult;
  }

  setResult(selector: string, result: TapOnElementResult): void {
    this.results.set(selector, result);
  }

  setDefaultResult(result: TapOnElementResult): void {
    this.defaultResult = result;
  }

  getCalls(): TapCall[] {
    return [...this.calls];
  }

  getCallCount(): number {
    return this.calls.length;
  }

  reset(): void {
    this.calls = [];
    this.results.clear();
  }
}

/**
 * Fake InputText for testing
 */
export class FakeInputText implements InputTextLike {
  private calls: InputTextCall[] = [];
  private result: SendTextResult = { success: true, text: "" };

  async execute(text: string, imeAction?: string): Promise<SendTextResult> {
    this.calls.push({ text, imeAction });
    return { ...this.result, text };
  }

  setResult(result: SendTextResult): void {
    this.result = result;
  }

  getCalls(): InputTextCall[] {
    return [...this.calls];
  }

  getCallCount(): number {
    return this.calls.length;
  }

  reset(): void {
    this.calls = [];
  }
}

/**
 * Fake ClearText for testing
 */
export class FakeClearText implements ClearTextLike {
  private callCount: number = 0;
  private result: ClearTextResult = { success: true };

  async execute(_progress?: any): Promise<ClearTextResult> {
    this.callCount++;
    return this.result;
  }

  setResult(result: ClearTextResult): void {
    this.result = result;
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset(): void {
    this.callCount = 0;
  }
}

/**
 * Fake SwipeOn for testing
 */
export class FakeSwipeOn implements SwipeOnLike {
  private calls: SwipeCall[] = [];
  private results: Map<string, SwipeOnResult> = new Map();
  private elementAppearsAfterSwipe: Map<string, Element> = new Map();
  private swipeCount: number = 0;
  private defaultResult: SwipeOnResult = {
    success: true,
    targetType: "screen",
    x1: 0,
    y1: 500,
    x2: 0,
    y2: 100,
    duration: 300
  };

  async execute(
    options: { direction: string; lookFor?: { text?: string; elementId?: string } },
    _progress?: any
  ): Promise<SwipeOnResult> {
    this.calls.push({ options });
    this.swipeCount++;

    // Check if lookFor element should appear after this swipe
    if (options.lookFor) {
      const key = options.lookFor.text ?? options.lookFor.elementId ?? "";
      const element = this.elementAppearsAfterSwipe.get(key);
      if (element && this.swipeCount >= 1) {
        return {
          ...this.defaultResult,
          found: true,
          element,
          scrollIterations: this.swipeCount
        };
      }
    }

    const key = options.lookFor?.text ?? options.lookFor?.elementId ?? "default";
    return this.results.get(key) ?? this.defaultResult;
  }

  setResult(selector: string, result: SwipeOnResult): void {
    this.results.set(selector, result);
  }

  setDefaultResult(result: SwipeOnResult): void {
    this.defaultResult = result;
  }

  /**
   * Configure an element to appear after scrolling
   */
  setElementAppearsAfterSwipe(selector: string, element: Element): void {
    this.elementAppearsAfterSwipe.set(selector, element);
  }

  getCalls(): SwipeCall[] {
    return [...this.calls];
  }

  getCallCount(): number {
    return this.calls.length;
  }

  reset(): void {
    this.calls = [];
    this.results.clear();
    this.elementAppearsAfterSwipe.clear();
    this.swipeCount = 0;
  }
}

/**
 * Fake ObserveScreen for testing SetUIState
 */
export class FakeObserveScreenForSetUIState implements ObserveScreen {
  private result: ObserveResult;
  private callCount: number = 0;
  private resultFactory: (() => ObserveResult) | null = null;

  constructor() {
    this.result = this.createDefaultResult();
  }

  private createDefaultResult(): ObserveResult {
    return {
      updatedAt: Date.now(),
      screenSize: { width: 1080, height: 1920 },
      systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
    };
  }

  async execute(
    _queryOptions?: any,
    _perf?: any,
    _skipWaitForFresh?: boolean,
    _minTimestamp?: number,
    _signal?: AbortSignal
  ): Promise<ObserveResult> {
    this.callCount++;
    if (this.resultFactory) {
      return this.resultFactory();
    }
    return this.result;
  }

  setResult(result: ObserveResult): void {
    this.result = result;
    this.resultFactory = null;
  }

  setResultFactory(factory: () => ObserveResult): void {
    this.resultFactory = factory;
  }

  setViewHierarchy(hierarchy: ViewHierarchyResult): void {
    this.result = {
      ...this.result,
      viewHierarchy: hierarchy
    };
  }

  getCallCount(): number {
    return this.callCount;
  }

  async getMostRecentCachedObserveResult(): Promise<ObserveResult> {
    if (this.resultFactory) {
      return this.resultFactory();
    }
    return this.result;
  }

  reset(): void {
    this.callCount = 0;
    this.result = this.createDefaultResult();
    this.resultFactory = null;
  }
}

/**
 * Fake FieldTypeDetector for testing
 */
export class FakeFieldTypeDetector {
  private typeOverrides: Map<string, FieldType> = new Map();
  private checkedOverrides: Map<string, boolean> = new Map();
  private textOverrides: Map<string, string> = new Map();
  private skipVerificationOverrides: Map<string, boolean> = new Map();
  private realDetector: FieldTypeDetector = new FieldTypeDetector();

  detect(element: Element): FieldType {
    const key = element["resource-id"] ?? element.text ?? "";
    return this.typeOverrides.get(key) ?? this.realDetector.detect(element);
  }

  isChecked(element: Element): boolean {
    const key = element["resource-id"] ?? element.text ?? "";
    const override = this.checkedOverrides.get(key);
    if (override !== undefined) {
      return override;
    }
    return this.realDetector.isChecked(element);
  }

  getTextValue(element: Element): string {
    const key = element["resource-id"] ?? element.text ?? "";
    return this.textOverrides.get(key) ?? this.realDetector.getTextValue(element);
  }

  isIOSElement(element: Element): boolean {
    return this.realDetector.isIOSElement(element);
  }

  shouldSkipVerification(element: Element, fieldType: FieldType): boolean {
    const key = element["resource-id"] ?? element.text ?? "";
    const override = this.skipVerificationOverrides.get(key);
    if (override !== undefined) {
      return override;
    }
    return this.realDetector.shouldSkipVerification(element, fieldType);
  }

  setFieldType(selector: string, type: FieldType): void {
    this.typeOverrides.set(selector, type);
  }

  setChecked(selector: string, checked: boolean): void {
    this.checkedOverrides.set(selector, checked);
  }

  setTextValue(selector: string, text: string): void {
    this.textOverrides.set(selector, text);
  }

  setSkipVerification(selector: string, skip: boolean): void {
    this.skipVerificationOverrides.set(selector, skip);
  }

  reset(): void {
    this.typeOverrides.clear();
    this.checkedOverrides.clear();
    this.textOverrides.clear();
    this.skipVerificationOverrides.clear();
  }
}
