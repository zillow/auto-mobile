import { Simulator, SimulatorInfo } from "../../src/utils/interfaces/Simulator";

/**
 * Fake implementation of Simulator for testing
 * Allows configuring responses for each method and asserting method calls
 */
export class FakeSimulator implements Simulator {
  // Configuration state
  private simulatorNames: string[] = [];
  private simulatorInfoList: SimulatorInfo[] = [];
  private runningSimulators: SimulatorInfo[] = [];
  private startSimulatorResult: {
    success: boolean;
    simulatorName: string;
    udid?: string;
    error?: string;
  } = {
      success: true,
      simulatorName: "iPhone 14"
    };
  private shutdownSimulatorResult: {
    success: boolean;
    simulatorName: string;
    error?: string;
  } = {
      success: true,
      simulatorName: "iPhone 14"
    };
  private runningSimulatorCheck: boolean = false;
  private installedApps: string[] = [];
  private launchAppError: Error | null = null;

  // Call tracking
  private methodCalls: Map<string, Array<Record<string, unknown>>> = new Map();

  /**
   * Configure simulator names list
   */
  setSimulatorNames(names: string[]): void {
    this.simulatorNames = names;
  }

  /**
   * Configure simulator info list
   */
  setSimulatorInfo(info: SimulatorInfo[]): void {
    this.simulatorInfoList = info;
  }

  /**
   * Configure running simulators list
   */
  setRunningSimulators(simulators: SimulatorInfo[]): void {
    this.runningSimulators = simulators;
  }

  /**
   * Configure startSimulator response
   */
  setStartSimulatorResult(result: {
    success: boolean;
    simulatorName: string;
    udid?: string;
    error?: string;
  }): void {
    this.startSimulatorResult = result;
  }

  /**
   * Configure shutdownSimulator response
   */
  setShutdownSimulatorResult(result: {
    success: boolean;
    simulatorName: string;
    error?: string;
  }): void {
    this.shutdownSimulatorResult = result;
  }

  /**
   * Configure isSimulatorRunning response
   */
  setIsSimulatorRunning(isRunning: boolean): void {
    this.runningSimulatorCheck = isRunning;
  }

  /**
   * Configure installed apps list
   */
  setInstalledApps(apps: string[]): void {
    this.installedApps = apps;
  }

  /**
   * Configure launchApp error (null for success)
   */
  setLaunchAppError(error: Error | null): void {
    this.launchAppError = error;
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

  // Implementation of Simulator interface

  async listSimulators(): Promise<string[]> {
    this.recordCall("listSimulators", {});
    return this.simulatorNames;
  }

  async getSimulatorInfo(): Promise<SimulatorInfo[]> {
    this.recordCall("getSimulatorInfo", {});
    return this.simulatorInfoList;
  }

  async getRunningSimulators(): Promise<SimulatorInfo[]> {
    this.recordCall("getRunningSimulators", {});
    return this.runningSimulators;
  }

  async startSimulator(simulatorName: string, timeoutMs: number = 120000): Promise<{
    success: boolean;
    simulatorName: string;
    udid?: string;
    error?: string;
  }> {
    this.recordCall("startSimulator", { simulatorName, timeoutMs });
    return this.startSimulatorResult;
  }

  async shutdownSimulator(simulatorName: string): Promise<{
    success: boolean;
    simulatorName: string;
    error?: string;
  }> {
    this.recordCall("shutdownSimulator", { simulatorName });
    return this.shutdownSimulatorResult;
  }

  async isSimulatorRunning(simulatorName: string): Promise<boolean> {
    this.recordCall("isSimulatorRunning", { simulatorName });
    return this.runningSimulatorCheck;
  }

  async listInstalledApps(udid: string): Promise<string[]> {
    this.recordCall("listInstalledApps", { udid });
    return this.installedApps;
  }

  async launchApp(udid: string, appBundleId: string): Promise<void> {
    this.recordCall("launchApp", { udid, appBundleId });
    if (this.launchAppError) {
      throw this.launchAppError;
    }
  }
}
