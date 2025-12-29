import { WebDriver, WebDriverAgentOptions } from "../../src/utils/interfaces/WebDriver";
import { BootedDevice, ExecResult, ViewHierarchyResult } from "../../src/models";

/**
 * Fake implementation of WebDriver for testing
 * Allows configuring responses for each method and asserting method calls
 */
export class FakeWebDriver implements WebDriver {
  // Configuration state
  device: BootedDevice | null = null;
  private startResult: WebDriverAgentOptions = {
    wdaHost: "http://localhost",
    wdaPort: 8100
  };
  private stopError: Error | null = null;
  private isRunningResult: boolean = false;
  private statusResult: any = { value: { ready: true } };
  private createSessionResult: any = { value: { sessionId: "test-session-id" } };
  private deleteSessionError: Error | null = null;
  private viewHierarchyResult: ViewHierarchyResult = { hierarchy: {} };
  private parseIOSXmlResult: ViewHierarchyResult = { hierarchy: {} };
  private executeCommandResult: ExecResult = {
    stdout: "",
    stderr: "",
    toString: () => "",
    trim: () => "",
    includes: () => false
  };
  private isAvailableResult: boolean = true;

  // Call tracking
  private methodCalls: Map<string, Array<Record<string, unknown>>> = new Map();

  /**
   * Configure start response
   */
  setStartResult(result: WebDriverAgentOptions): void {
    this.startResult = result;
  }

  /**
   * Configure stop error (null for success)
   */
  setStopError(error: Error | null): void {
    this.stopError = error;
  }

  /**
   * Configure isRunning response
   */
  setIsRunningResult(isRunning: boolean): void {
    this.isRunningResult = isRunning;
  }

  /**
   * Configure getStatus response
   */
  setStatusResult(status: any): void {
    this.statusResult = status;
  }

  /**
   * Configure createSession response
   */
  setCreateSessionResult(result: any): void {
    this.createSessionResult = result;
  }

  /**
   * Configure deleteSession error (null for success)
   */
  setDeleteSessionError(error: Error | null): void {
    this.deleteSessionError = error;
  }

  /**
   * Configure getViewHierarchy response
   */
  setViewHierarchyResult(result: ViewHierarchyResult): void {
    this.viewHierarchyResult = result;
  }

  /**
   * Configure parseIOSXmlToViewHierarchy response
   */
  setParseIOSXmlResult(result: ViewHierarchyResult): void {
    this.parseIOSXmlResult = result;
  }

  /**
   * Configure executeCommand response
   */
  setExecuteCommandResult(result: ExecResult): void {
    this.executeCommandResult = result;
  }

  /**
   * Configure isAvailable response
   */
  setIsAvailableResult(available: boolean): void {
    this.isAvailableResult = available;
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

  // Implementation of WebDriver interface

  setDevice(device: BootedDevice): void {
    this.recordCall("setDevice", { device });
    this.device = device;
  }

  async start(timeoutMs: number = 120000): Promise<WebDriverAgentOptions> {
    this.recordCall("start", { timeoutMs });
    return this.startResult;
  }

  async stop(): Promise<void> {
    this.recordCall("stop", {});
    if (this.stopError) {
      throw this.stopError;
    }
  }

  async isRunning(): Promise<boolean> {
    this.recordCall("isRunning", {});
    return this.isRunningResult;
  }

  async getStatus(): Promise<any> {
    this.recordCall("getStatus", {});
    return this.statusResult;
  }

  async createSession(capabilities: any = {}): Promise<any> {
    this.recordCall("createSession", { capabilities });
    return this.createSessionResult;
  }

  async deleteSession(sessionId: string): Promise<any> {
    this.recordCall("deleteSession", { sessionId });
    if (this.deleteSessionError) {
      throw this.deleteSessionError;
    }
  }

  async getViewHierarchy(device: BootedDevice): Promise<ViewHierarchyResult> {
    this.recordCall("getViewHierarchy", { device });
    return this.viewHierarchyResult;
  }

  async parseIOSXmlToViewHierarchy(xmlData: string): Promise<ViewHierarchyResult> {
    this.recordCall("parseIOSXmlToViewHierarchy", { xmlDataLength: xmlData.length });
    return this.parseIOSXmlResult;
  }

  async executeCommand(command: string, timeoutMs?: number): Promise<ExecResult> {
    this.recordCall("executeCommand", { command, timeoutMs });
    return this.executeCommandResult;
  }

  async isAvailable(): Promise<boolean> {
    this.recordCall("isAvailable", {});
    return this.isAvailableResult;
  }
}
