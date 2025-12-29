import {
  IAxe,
  AxeButton,
  IdbTargetInfo,
  TargetDescription,
} from "../../src/utils/interfaces/Axe";
import { ExecResult, BootedDevice, ScreenSize, SwipeResult } from "../../src/models";

/**
 * Fake implementation of IAxe for testing
 * Allows configuring responses for each method and asserting method calls
 */
export class FakeAxe implements IAxe {
  // Configuration state
  private device: BootedDevice | null = null;
  private baseCommand: string = "axe";
  private executeCommandResult: ExecResult = {
    stdout: "",
    stderr: "",
    toString: () => "",
    trim: () => "",
    includes: (searchString: string) => false
  };
  private listTargetsResult: IdbTargetInfo[] = [];
  private describeResult: TargetDescription = {
    udid: "test-udid",
    name: "Test Device",
    target_type: "simulator",
    state: "booted",
    os_version: "17.0",
    architecture: "x86_64",
    companion_info: null,
    screen_dimensions: null,
    model: null,
    device: null,
    extended: {},
    diagnostics: {},
    metadata: {}
  };
  private tapResult: ExecResult = {
    stdout: "",
    stderr: "",
    toString: () => "",
    trim: () => "",
    includes: (searchString: string) => false
  };
  private swipeResult: SwipeResult = {
    success: true,
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    duration: 300,
    easing: "linear"
  };
  private pressButtonResult: ExecResult = {
    stdout: "",
    stderr: "",
    toString: () => "",
    trim: () => "",
    includes: (searchString: string) => false
  };
  private inputTextResult: ExecResult = {
    stdout: "",
    stderr: "",
    toString: () => "",
    trim: () => "",
    includes: (searchString: string) => false
  };
  private screenSize: ScreenSize = {
    width: 1080,
    height: 1920
  };
  private openUrlError: Error | null = null;
  private focusResult: ExecResult = {
    stdout: "Focus not supported by axe",
    stderr: "",
    toString: () => "Focus not supported by axe",
    trim: () => "Focus not supported by axe",
    includes: (searchString: string) => false
  };
  private killResult: ExecResult = {
    stdout: "Kill not applicable for axe",
    stderr: "",
    toString: () => "Kill not applicable for axe",
    trim: () => "Kill not applicable for axe",
    includes: (searchString: string) => false
  };
  private isAvailableResult: boolean = true;
  private gestureResult: ExecResult = {
    stdout: "",
    stderr: "",
    toString: () => "",
    trim: () => "",
    includes: (searchString: string) => false
  };

  // Call tracking
  private methodCalls: Map<string, Array<Record<string, unknown>>> = new Map();

  // Configuration methods

  /**
   * Configure setDevice response
   */
  setDevice(device: BootedDevice): void {
    this.device = device;
    this.recordCall("setDevice", { device });
  }

  /**
   * Configure getBaseCommand response
   */
  setBaseCommand(command: string): void {
    this.baseCommand = command;
  }

  /**
   * Configure executeCommand response
   */
  setExecuteCommandResult(result: ExecResult): void {
    this.executeCommandResult = result;
  }

  /**
   * Configure listTargets response
   */
  setListTargetsResult(targets: IdbTargetInfo[]): void {
    this.listTargetsResult = targets;
  }

  /**
   * Configure describe response
   */
  setDescribeResult(result: TargetDescription): void {
    this.describeResult = result;
  }

  /**
   * Configure tap response
   */
  setTapResult(result: ExecResult): void {
    this.tapResult = result;
  }

  /**
   * Configure swipe response
   */
  setSwipeResult(result: SwipeResult): void {
    this.swipeResult = result;
  }

  /**
   * Configure pressButton response
   */
  setPressButtonResult(result: ExecResult): void {
    this.pressButtonResult = result;
  }

  /**
   * Configure inputText response
   */
  setInputTextResult(result: ExecResult): void {
    this.inputTextResult = result;
  }

  /**
   * Configure getScreenSize response
   */
  setScreenSize(size: ScreenSize): void {
    this.screenSize = size;
  }

  /**
   * Configure openUrl error (null for success)
   */
  setOpenUrlError(error: Error | null): void {
    this.openUrlError = error;
  }

  /**
   * Configure focus response
   */
  setFocusResult(result: ExecResult): void {
    this.focusResult = result;
  }

  /**
   * Configure kill response
   */
  setKillResult(result: ExecResult): void {
    this.killResult = result;
  }

  /**
   * Configure isAvailable response
   */
  setIsAvailableResult(available: boolean): void {
    this.isAvailableResult = available;
  }

  /**
   * Configure executeGesture response
   */
  setGestureResult(result: ExecResult): void {
    this.gestureResult = result;
  }

  /**
   * Get list of method calls for a specific method (for test assertions)
   */
  getMethodCalls(methodName: string): Array<Record<string, unknown>> {
    return this.methodCalls.get(methodName) || [];
  }

  /**
   * Check if a method was called
   */
  wasMethodCalled(methodName: string): boolean {
    const calls = this.methodCalls.get(methodName);
    return calls ? calls.length > 0 : false;
  }

  /**
   * Get count of method calls
   */
  getMethodCallCount(methodName: string): number {
    const calls = this.methodCalls.get(methodName);
    return calls ? calls.length : 0;
  }

  /**
   * Clear all call history
   */
  clearCallHistory(): void {
    this.methodCalls.clear();
  }

  /**
   * Record a method call with parameters
   */
  private recordCall(methodName: string, params: Record<string, unknown>): void {
    if (!this.methodCalls.has(methodName)) {
      this.methodCalls.set(methodName, []);
    }
    this.methodCalls.get(methodName)!.push(params);
  }

  // Implementation of Axe interface

  getBaseCommand(): string {
    this.recordCall("getBaseCommand", {});
    return this.baseCommand;
  }

  async executeCommand(command: string, timeoutMs?: number): Promise<ExecResult> {
    this.recordCall("executeCommand", { command, timeoutMs });
    return this.executeCommandResult;
  }

  async listTargets(): Promise<IdbTargetInfo[]> {
    this.recordCall("listTargets", {});
    return this.listTargetsResult;
  }

  async describe(): Promise<TargetDescription> {
    this.recordCall("describe", {});
    return this.describeResult;
  }

  async tap(x: number, y: number, duration?: number): Promise<ExecResult> {
    this.recordCall("tap", { x, y, duration });
    return this.tapResult;
  }

  async swipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    stepSize?: number,
    duration?: number
  ): Promise<SwipeResult> {
    this.recordCall("swipe", { startX, startY, endX, endY, stepSize, duration });
    return this.swipeResult;
  }

  async pressButton(buttonType: AxeButton): Promise<ExecResult> {
    this.recordCall("pressButton", { buttonType });
    return this.pressButtonResult;
  }

  async inputText(text: string): Promise<ExecResult> {
    this.recordCall("inputText", { text });
    return this.inputTextResult;
  }

  async getScreenSize(): Promise<ScreenSize> {
    this.recordCall("getScreenSize", {});
    return this.screenSize;
  }

  async openUrl(url: string): Promise<ExecResult> {
    this.recordCall("openUrl", { url });
    if (this.openUrlError) {
      throw this.openUrlError;
    }
    return {
      stdout: "",
      stderr: "",
      toString: () => "",
      trim: () => "",
      includes: (searchString: string) => false
    };
  }

  async focus(): Promise<ExecResult> {
    this.recordCall("focus", {});
    return this.focusResult;
  }

  async kill(): Promise<ExecResult> {
    this.recordCall("kill", {});
    return this.killResult;
  }

  async isAvailable(): Promise<boolean> {
    this.recordCall("isAvailable", {});
    return this.isAvailableResult;
  }

  async executeGesture(
    preset: string,
    options?: {
      preDelay?: number;
      postDelay?: number;
      screenWidth?: number;
      screenHeight?: number;
    }
  ): Promise<ExecResult> {
    this.recordCall("executeGesture", { preset, options });
    return this.gestureResult;
  }

  async scrollUp(options?: { preDelay?: number; postDelay?: number }): Promise<ExecResult> {
    this.recordCall("scrollUp", { options });
    return this.gestureResult;
  }

  async scrollDown(options?: { preDelay?: number; postDelay?: number }): Promise<ExecResult> {
    this.recordCall("scrollDown", { options });
    return this.gestureResult;
  }

  async scrollLeft(options?: { preDelay?: number; postDelay?: number }): Promise<ExecResult> {
    this.recordCall("scrollLeft", { options });
    return this.gestureResult;
  }

  async scrollRight(options?: { preDelay?: number; postDelay?: number }): Promise<ExecResult> {
    this.recordCall("scrollRight", { options });
    return this.gestureResult;
  }

  async swipeFromLeftEdge(options?: { preDelay?: number; postDelay?: number }): Promise<ExecResult> {
    this.recordCall("swipeFromLeftEdge", { options });
    return this.gestureResult;
  }

  async swipeFromRightEdge(options?: { preDelay?: number; postDelay?: number }): Promise<ExecResult> {
    this.recordCall("swipeFromRightEdge", { options });
    return this.gestureResult;
  }

  async swipeFromTopEdge(options?: { preDelay?: number; postDelay?: number }): Promise<ExecResult> {
    this.recordCall("swipeFromTopEdge", { options });
    return this.gestureResult;
  }

  async swipeFromBottomEdge(options?: { preDelay?: number; postDelay?: number }): Promise<ExecResult> {
    this.recordCall("swipeFromBottomEdge", { options });
    return this.gestureResult;
  }
}
