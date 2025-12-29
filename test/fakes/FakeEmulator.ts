import { ChildProcess } from "child_process";
import { AndroidEmulator } from "../../src/utils/interfaces/AndroidEmulator";
import { BootedDevice, DeviceInfo, ExecResult } from "../../src/models";

/**
 * Fake implementation of AndroidEmulator for testing
 * Allows configuring responses for each method and asserting method calls
 */
export class FakeEmulator implements AndroidEmulator {
  // Configuration state
  private avdList: DeviceInfo[] = [];
  private bootedDevices: BootedDevice[] = [];
  private isAvdRunningResult: boolean = false;
  private startEmulatorResult: ChildProcess | null = null;
  private startEmulatorError: Error | null = null;
  private killDeviceError: Error | null = null;
  private waitForEmulatorReadyResult: BootedDevice | null = null;
  private waitForEmulatorReadyError: Error | null = null;
  private executeCommandResult: ExecResult = {
    stdout: "",
    stderr: "",
    toString() {
      return this.stdout;
    },
    trim() {
      return this.stdout.trim();
    },
    includes(searchString: string) {
      return this.stdout.includes(searchString);
    }
  };
  private executeCommandError: Error | null = null;

  // Call tracking
  private methodCalls: Map<string, Array<Record<string, unknown>>> = new Map();

  /**
   * Configure AVD list
   */
  setAvdList(avds: DeviceInfo[]): void {
    this.avdList = avds;
  }

  /**
   * Configure booted devices list
   */
  setBootedDevices(devices: BootedDevice[]): void {
    this.bootedDevices = devices;
  }

  /**
   * Configure isAvdRunning response
   */
  setIsAvdRunning(isRunning: boolean): void {
    this.isAvdRunningResult = isRunning;
  }

  /**
   * Configure startEmulator response
   */
  setStartEmulatorResult(childProcess: ChildProcess | null): void {
    this.startEmulatorResult = childProcess;
    this.startEmulatorError = null;
  }

  /**
   * Configure startEmulator error
   */
  setStartEmulatorError(error: Error | null): void {
    this.startEmulatorError = error;
    this.startEmulatorResult = null;
  }

  /**
   * Configure killDevice error (null for success)
   */
  setKillDeviceError(error: Error | null): void {
    this.killDeviceError = error;
  }

  /**
   * Configure waitForEmulatorReady response
   */
  setWaitForEmulatorReadyResult(device: BootedDevice | null): void {
    this.waitForEmulatorReadyResult = device;
    this.waitForEmulatorReadyError = null;
  }

  /**
   * Configure waitForEmulatorReady error
   */
  setWaitForEmulatorReadyError(error: Error | null): void {
    this.waitForEmulatorReadyError = error;
    this.waitForEmulatorReadyResult = null;
  }

  /**
   * Configure executeCommand response
   */
  setExecuteCommandResult(result: ExecResult): void {
    this.executeCommandResult = result;
    this.executeCommandError = null;
  }

  /**
   * Configure executeCommand error
   */
  setExecuteCommandError(error: Error | null): void {
    this.executeCommandError = error;
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

  // Implementation of AndroidEmulator interface

  async executeCommand(command: string, timeoutMs?: number): Promise<ExecResult> {
    this.recordCall("executeCommand", { command, timeoutMs });
    if (this.executeCommandError) {
      throw this.executeCommandError;
    }
    return this.executeCommandResult;
  }

  async listAvds(): Promise<DeviceInfo[]> {
    this.recordCall("listAvds", {});
    return this.avdList;
  }

  async isAvdRunning(avdName: string): Promise<boolean> {
    this.recordCall("isAvdRunning", { avdName });
    return this.isAvdRunningResult;
  }

  async getBootedDevices(onlyEmulators?: boolean): Promise<BootedDevice[]> {
    this.recordCall("getBootedDevices", { onlyEmulators });
    if (onlyEmulators) {
      return this.bootedDevices.filter(d => d.deviceId?.startsWith("emulator-"));
    }
    return this.bootedDevices;
  }

  async startEmulator(avdName: string): Promise<ChildProcess> {
    this.recordCall("startEmulator", { avdName });
    if (this.startEmulatorError) {
      throw this.startEmulatorError;
    }
    if (!this.startEmulatorResult) {
      throw new Error("startEmulator not configured with a result");
    }
    return this.startEmulatorResult;
  }

  async killDevice(device: BootedDevice): Promise<void> {
    this.recordCall("killDevice", { device });
    if (this.killDeviceError) {
      throw this.killDeviceError;
    }
  }

  async waitForEmulatorReady(avdName: string, timeoutMs?: number): Promise<BootedDevice> {
    this.recordCall("waitForEmulatorReady", { avdName, timeoutMs });
    if (this.waitForEmulatorReadyError) {
      throw this.waitForEmulatorReadyError;
    }
    if (!this.waitForEmulatorReadyResult) {
      throw new Error("waitForEmulatorReady not configured with a result");
    }
    return this.waitForEmulatorReadyResult;
  }
}
