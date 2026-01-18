import { ISimCtl, AppleDevice, AppleDeviceRuntime, AppleDeviceType } from "../../src/utils/interfaces/Simctl";
import { BootedDevice, ExecResult, DeviceInfo, ScreenSize } from "../../src/models";

/**
 * Fake implementation of ISimCtl for testing
 * Allows configuring responses for each method and asserting method calls
 */
export class FakeSimctl implements ISimCtl {
  // Configuration state
  private currentDevice: BootedDevice | null = null;
  private availableSimulators: DeviceInfo[] = [];
  private bootedSimulators: BootedDevice[] = [];
  private deviceInfoMap: Map<string, AppleDevice | null> = new Map();
  private deviceTypes: AppleDeviceType[] = [];
  private runtimes: AppleDeviceRuntime[] = [];
  private installedApps: any[] = [];
  private launchAppResult: {
    success: boolean;
    pid?: number;
    error?: string;
  } = {
      success: true,
      pid: 12345
    };
  private screenSize: ScreenSize = {
    width: 1179,
    height: 2556
  };
  private isAvailableResult: boolean = true;
  private isSimulatorRunningResult: boolean = false;
  private executeCommandResult: ExecResult = {
    stdout: "",
    stderr: "",
    toString: () => "",
    trim: () => "",
    includes: () => false
  };
  private createdSimulatorUdid: string = "created-simulator-udid-123";

  // Call tracking
  private methodCalls: Map<string, Array<Record<string, unknown>>> = new Map();

  /**
   * Configure available simulators
   */
  setAvailableSimulators(simulators: DeviceInfo[]): void {
    this.availableSimulators = simulators;
  }

  /**
   * Configure booted simulators
   */
  setBootedSimulators(simulators: BootedDevice[]): void {
    this.bootedSimulators = simulators;
  }

  /**
   * Configure device info for a specific UDID
   */
  setDeviceInfo(udid: string, info: AppleDevice | null): void {
    this.deviceInfoMap.set(udid, info);
  }

  /**
   * Configure device types
   */
  setDeviceTypes(types: AppleDeviceType[]): void {
    this.deviceTypes = types;
  }

  /**
   * Configure runtimes
   */
  setRuntimes(runtimes: AppleDeviceRuntime[]): void {
    this.runtimes = runtimes;
  }

  /**
   * Configure installed apps
   */
  setInstalledApps(apps: any[]): void {
    this.installedApps = apps;
  }

  /**
   * Configure launchApp response
   */
  setLaunchAppResult(result: {
    success: boolean;
    pid?: number;
    error?: string;
  }): void {
    this.launchAppResult = result;
  }

  /**
   * Configure screen size
   */
  setScreenSize(size: ScreenSize): void {
    this.screenSize = size;
  }

  /**
   * Configure isAvailable response
   */
  setIsAvailable(available: boolean): void {
    this.isAvailableResult = available;
  }

  /**
   * Configure isSimulatorRunning response
   */
  setIsSimulatorRunning(running: boolean): void {
    this.isSimulatorRunningResult = running;
  }

  /**
   * Configure executeCommand response
   */
  setExecuteCommandResult(result: ExecResult): void {
    this.executeCommandResult = result;
  }

  /**
   * Configure created simulator UDID
   */
  setCreatedSimulatorUdid(udid: string): void {
    this.createdSimulatorUdid = udid;
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

  // Implementation of ISimCtl interface

  setDevice(device: BootedDevice): void {
    this.recordCall("setDevice", { deviceId: device.deviceId });
    this.currentDevice = device;
  }

  async executeCommand(command: string, timeoutMs?: number): Promise<ExecResult> {
    this.recordCall("executeCommand", { command, timeoutMs });
    return this.executeCommandResult;
  }

  async isAvailable(): Promise<boolean> {
    this.recordCall("isAvailable", {});
    return this.isAvailableResult;
  }

  async isSimulatorRunning(name: string): Promise<boolean> {
    this.recordCall("isSimulatorRunning", { name });
    return this.isSimulatorRunningResult;
  }

  async startSimulator(udid: string): Promise<any> {
    this.recordCall("startSimulator", { udid });
    return {
      pid: Date.now(),
      kill: () => false,
      killed: false,
      connected: false,
      exitCode: 0,
      signalCode: null
    };
  }

  async killSimulator(device: BootedDevice): Promise<void> {
    this.recordCall("killSimulator", { deviceId: device.deviceId });
  }

  async waitForSimulatorReady(udid: string): Promise<BootedDevice> {
    this.recordCall("waitForSimulatorReady", { udid });
    const simulator = this.bootedSimulators.find(s => s.deviceId === udid);
    if (simulator) {
      return simulator;
    }
    return {
      deviceId: udid,
      name: "Unknown Simulator",
      platform: "ios"
    } as BootedDevice;
  }

  async listSimulatorImages(): Promise<DeviceInfo[]> {
    this.recordCall("listSimulatorImages", {});
    return this.availableSimulators;
  }

  async getBootedSimulators(): Promise<BootedDevice[]> {
    this.recordCall("getBootedSimulators", {});
    return this.bootedSimulators;
  }

  async getDeviceInfo(udid: string): Promise<AppleDevice | null> {
    this.recordCall("getDeviceInfo", { udid });
    return this.deviceInfoMap.get(udid) || null;
  }

  async bootSimulator(udid: string): Promise<BootedDevice> {
    this.recordCall("bootSimulator", { udid });
    const simulator = this.bootedSimulators.find(s => s.deviceId === udid);
    if (simulator) {
      return simulator;
    }
    return {
      deviceId: udid,
      name: "Booted Simulator",
      platform: "ios"
    } as BootedDevice;
  }

  async getDeviceTypes(): Promise<AppleDeviceType[]> {
    this.recordCall("getDeviceTypes", {});
    return this.deviceTypes;
  }

  async getRuntimes(): Promise<AppleDeviceRuntime[]> {
    this.recordCall("getRuntimes", {});
    return this.runtimes;
  }

  async createSimulator(name: string, deviceType: string, runtime: string): Promise<string> {
    this.recordCall("createSimulator", { name, deviceType, runtime });
    return this.createdSimulatorUdid;
  }

  async deleteSimulator(udid: string): Promise<void> {
    this.recordCall("deleteSimulator", { udid });
  }

  async listApps(deviceId?: string): Promise<any[]> {
    this.recordCall("listApps", { deviceId });
    return this.installedApps;
  }

  async launchApp(
    bundleId: string,
    options?: { foregroundIfRunning?: boolean },
    deviceId?: string
  ): Promise<{
    success: boolean;
    pid?: number;
    error?: string;
  }> {
    this.recordCall("launchApp", { bundleId, options, deviceId });
    return this.launchAppResult;
  }

  async terminateApp(bundleId: string, deviceId?: string): Promise<void> {
    this.recordCall("terminateApp", { bundleId, deviceId });
  }

  async installApp(appPath: string, deviceId?: string): Promise<void> {
    this.recordCall("installApp", { appPath, deviceId });
  }

  async uninstallApp(bundleId: string, deviceId?: string): Promise<void> {
    this.recordCall("uninstallApp", { bundleId, deviceId });
  }

  async getScreenSize(deviceId?: string): Promise<ScreenSize> {
    this.recordCall("getScreenSize", { deviceId });
    return this.screenSize;
  }
}
