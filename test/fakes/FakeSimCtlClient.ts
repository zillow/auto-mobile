import type { ExecResult } from "../../src/models";
import type { AppleDevice, AppleDeviceRuntime, AppleDeviceType } from "../../src/utils/ios-cmdline-tools/SimCtlClient";

const buildExecResult = (stdout: string): ExecResult => ({
  stdout,
  stderr: "",
  toString: () => stdout,
  trim: () => stdout.trim(),
  includes: (value: string) => stdout.includes(value),
});

export class FakeSimCtlClient {
  private deviceInfo = new Map<string, AppleDevice | null>();
  private runtimes: AppleDeviceRuntime[] = [];
  private installedApps: any[] = [];
  private containerPaths = new Map<string, string>();
  private containerErrors = new Map<string, Error>();
  private methodCalls = new Map<string, Array<Record<string, unknown>>>();

  setDeviceInfo(udid: string, info: AppleDevice | null): void {
    this.deviceInfo.set(udid, info);
  }

  setRuntimes(runtimes: AppleDeviceRuntime[]): void {
    this.runtimes = runtimes;
  }

  setInstalledApps(apps: any[]): void {
    this.installedApps = apps;
  }

  setContainerPath(bundleId: string, containerPath: string): void {
    this.containerPaths.set(bundleId, containerPath);
  }

  setContainerError(bundleId: string, error: Error): void {
    this.containerErrors.set(bundleId, error);
  }

  getMethodCalls(methodName: string): Array<Record<string, unknown>> {
    return this.methodCalls.get(methodName) ?? [];
  }

  private recordCall(methodName: string, params: Record<string, unknown>): void {
    if (!this.methodCalls.has(methodName)) {
      this.methodCalls.set(methodName, []);
    }
    this.methodCalls.get(methodName)!.push(params);
  }

  async executeCommand(command: string, timeoutMs?: number): Promise<ExecResult> {
    this.recordCall("executeCommand", { command, timeoutMs });
    const match = command.match(/get_app_container\s+\"([^\"]+)\"\s+\"([^\"]+)\"\s+data/);
    const bundleId = match?.[2];
    if (bundleId) {
      const error = this.containerErrors.get(bundleId);
      if (error) {
        throw error;
      }
      const containerPath = this.containerPaths.get(bundleId) ?? "";
      return buildExecResult(containerPath);
    }

    return buildExecResult("");
  }

  async getDeviceInfo(udid: string): Promise<AppleDevice | null> {
    this.recordCall("getDeviceInfo", { udid });
    return this.deviceInfo.get(udid) ?? null;
  }

  async getDeviceTypes(): Promise<AppleDeviceType[]> {
    this.recordCall("getDeviceTypes", {});
    return [];
  }

  async getRuntimes(): Promise<AppleDeviceRuntime[]> {
    this.recordCall("getRuntimes", {});
    return this.runtimes;
  }

  async listApps(deviceId?: string): Promise<any[]> {
    this.recordCall("listApps", { deviceId });
    return this.installedApps;
  }

  async terminateApp(bundleId: string, deviceId?: string): Promise<void> {
    this.recordCall("terminateApp", { bundleId, deviceId });
  }

  async openSimulatorApp(): Promise<void> {
    this.recordCall("openSimulatorApp", {});
  }
}
