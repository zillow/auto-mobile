export class FakeHostControlDeviceAppInspector {
  private useHostControl = false;
  private runningInDocker = false;
  private available = false;
  private appHash: string | null = null;
  private uninstallError: string | null = null;

  setUseHostControl(value: boolean): void {
    this.useHostControl = value;
  }

  setRunningInDocker(value: boolean): void {
    this.runningInDocker = value;
  }

  setAvailable(value: boolean): void {
    this.available = value;
  }

  setAppHash(hash: string | null): void {
    this.appHash = hash;
  }

  setUninstallError(message: string | null): void {
    this.uninstallError = message;
  }

  shouldUseHostControl(): boolean {
    return this.useHostControl;
  }

  isRunningInDocker(): boolean {
    return this.runningInDocker;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async getAppBundleHash(): Promise<{ success: boolean; error?: string; data?: { hash: string | null } }> {
    if (!this.available) {
      return { success: false, error: "Host control unavailable" };
    }
    return { success: true, data: { hash: this.appHash } };
  }

  async uninstallApp(): Promise<{ success: boolean; error?: string }> {
    if (this.uninstallError) {
      return { success: false, error: this.uninstallError };
    }
    return { success: true };
  }
}
