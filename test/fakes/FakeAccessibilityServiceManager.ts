import { AccessibilityServiceManager } from "../../src/utils/AccessibilityServiceManager";

/**
 * Fake implementation of AccessibilityServiceManager for testing
 * Allows configuring service state and asserting operations
 */
export class FakeAccessibilityServiceManager implements AccessibilityServiceManager {
  private installedState: boolean = false;
  private enabledState: boolean = false;
  private availableState: boolean = false;
  private executedOperations: string[] = [];
  private mockDownloadApkPath: string = "/tmp/mock-accessibility-service.apk";
  private shouldInstallFail: boolean = false;
  private shouldEnableFail: boolean = false;
  private shouldSetupFail: boolean = false;
  private shouldDownloadFail: boolean = false;
  private shouldCleanupFail: boolean = false;
  private installedSha256: string | null = null;
  private versionCompatible: boolean = true;
  private enabledForUsers: Map<number, boolean> = new Map();

  /**
   * Set whether the accessibility service is installed
   * @param installed - Whether the service is installed
   */
  setInstalled(installed: boolean): void {
    this.installedState = installed;
  }

  /**
   * Set whether the accessibility service is enabled
   * @param enabled - Whether the service is enabled
   */
  setEnabled(enabled: boolean): void {
    this.enabledState = enabled;
  }

  /**
   * Set whether the accessibility service is available (installed AND enabled)
   * @param available - Whether the service is available
   */
  setAvailable(available: boolean): void {
    this.availableState = available;
  }

  /**
   * Set the path that downloadApk should return
   * @param path - The APK path to return
   */
  setMockDownloadApkPath(path: string): void {
    this.mockDownloadApkPath = path;
  }

  /**
   * Configure install() to fail
   * @param shouldFail - Whether install should fail
   */
  setInstallShouldFail(shouldFail: boolean): void {
    this.shouldInstallFail = shouldFail;
  }

  /**
   * Configure enable() to fail
   * @param shouldFail - Whether enable should fail
   */
  setEnableShouldFail(shouldFail: boolean): void {
    this.shouldEnableFail = shouldFail;
  }

  /**
   * Configure setup() to fail
   * @param shouldFail - Whether setup should fail
   */
  setSetupShouldFail(shouldFail: boolean): void {
    this.shouldSetupFail = shouldFail;
  }

  /**
   * Configure downloadApk() to fail
   * @param shouldFail - Whether downloadApk should fail
   */
  setDownloadShouldFail(shouldFail: boolean): void {
    this.shouldDownloadFail = shouldFail;
  }

  /**
   * Configure cleanupApk() to fail
   * @param shouldFail - Whether cleanupApk should fail
   */
  setCleanupShouldFail(shouldFail: boolean): void {
    this.shouldCleanupFail = shouldFail;
  }

  /**
   * Set the installed APK SHA256 for version compatibility checks.
   * @param sha256 - The SHA256 to return
   */
  setInstalledApkSha256(sha256: string | null): void {
    this.installedSha256 = sha256;
  }

  /**
   * Configure version compatibility result.
   * @param compatible - Whether version is compatible
   */
  setVersionCompatible(compatible: boolean): void {
    this.versionCompatible = compatible;
  }

  /**
   * Set whether the accessibility service is enabled for a specific user
   * @param userId - The user ID
   * @param enabled - Whether the service is enabled for this user
   */
  setEnabledForUser(userId: number, enabled: boolean): void {
    this.enabledForUsers.set(userId, enabled);
  }

  /**
   * Get history of executed operations (for test assertions)
   * @returns Array of operation strings that were executed
   */
  getExecutedOperations(): string[] {
    return [...this.executedOperations];
  }

  /**
   * Check if a specific method was called
   * @param operationName - Name of the operation to check
   * @returns true if the operation was called at least once
   */
  wasMethodCalled(operationName: string): boolean {
    return this.executedOperations.some(op => op.includes(operationName));
  }

  /**
   * Get count of times a specific method was called
   * @param operationName - Name of the operation to count
   * @returns Number of times the operation was called
   */
  getCallCount(operationName: string): number {
    return this.executedOperations.filter(op => op.includes(operationName))
      .length;
  }

  /**
   * Clear operation history
   */
  clearHistory(): void {
    this.executedOperations = [];
  }

  // Implementation of AccessibilityServiceManager interface

  async isInstalled(): Promise<boolean> {
    this.executedOperations.push("isInstalled");
    return this.installedState;
  }

  async isEnabled(): Promise<boolean> {
    this.executedOperations.push("isEnabled");
    return this.enabledState;
  }

  async isEnabledForUser(userId: number): Promise<boolean> {
    this.executedOperations.push(`isEnabledForUser:${userId}`);
    return this.enabledForUsers.get(userId) ?? false;
  }

  async isAvailable(): Promise<boolean> {
    this.executedOperations.push("isAvailable");
    return this.availableState;
  }

  async getInstalledApkSha256(): Promise<string | null> {
    this.executedOperations.push("getInstalledApkSha256");
    return this.installedSha256;
  }

  async isVersionCompatible(): Promise<boolean> {
    this.executedOperations.push("isVersionCompatible");
    return this.versionCompatible;
  }

  async ensureCompatibleVersion(): Promise<{
    status: "skipped" | "not_installed" | "compatible" | "upgraded" | "installed" | "reinstalled" | "failed";
    expectedSha256?: string;
    installedSha256?: string | null;
    installedShaSource?: "device" | "host" | "none";
    installedApkPath?: string | null;
    attemptedDownload?: boolean;
    attemptedInstall?: boolean;
    attemptedReinstall?: boolean;
    downloadUnavailable?: boolean;
    error?: string;
    upgradeError?: string;
    reinstallError?: string;
  }> {
    this.executedOperations.push("ensureCompatibleVersion");
    return {
      status: this.versionCompatible ? "compatible" : "failed",
      installedSha256: this.installedSha256
    };
  }

  clearAvailabilityCache(): void {
    this.executedOperations.push("clearAvailabilityCache");
  }

  resetSetupState(): void {
    this.executedOperations.push("resetSetupState");
    this.clearAvailabilityCache();
  }

  async downloadApk(): Promise<string> {
    this.executedOperations.push("downloadApk");

    if (this.shouldDownloadFail) {
      throw new Error("Failed to download APK");
    }

    return this.mockDownloadApkPath;
  }

  async install(apkPath: string): Promise<void> {
    this.executedOperations.push(`install:${apkPath}`);

    if (this.shouldInstallFail) {
      throw new Error("Failed to install APK");
    }
  }

  async enable(): Promise<void> {
    this.executedOperations.push("enable");

    if (this.shouldEnableFail) {
      throw new Error("Failed to enable accessibility service");
    }
  }

  async enableForUser(userId: number): Promise<void> {
    this.executedOperations.push(`enableForUser:${userId}`);

    if (this.shouldEnableFail) {
      throw new Error(`Failed to enable accessibility service for user ${userId}`);
    }

    this.enabledForUsers.set(userId, true);
  }

  async cleanupApk(apkPath: string): Promise<void> {
    this.executedOperations.push(`cleanupApk:${apkPath}`);

    if (this.shouldCleanupFail) {
      throw new Error("Failed to cleanup APK");
    }
  }

  async setup(force: boolean = false): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }> {
    this.executedOperations.push(`setup:force=${force}`);

    if (this.shouldSetupFail) {
      return {
        success: false,
        message: "Failed to setup Accessibility Service",
        error: "Mock setup failure"
      };
    }

    if (force || !this.installedState || !this.enabledState) {
      return {
        success: true,
        message: "Accessibility Service installed and activated successfully",
      };
    }

    return {
      success: true,
      message: "Accessibility Service was already installed and has been activated",
    };
  }
}
