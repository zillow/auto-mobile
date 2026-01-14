import { InstalledAppsProvider } from "../../src/features/action/LaunchApp";
import { Timer } from "../../src/utils/SystemTimer";

type FakeInstalledAppsProviderOptions = {
  delayMs?: number;
  installedApps?: string[];
  shouldThrow?: boolean;
  error?: Error;
};

export class FakeInstalledAppsProvider implements InstalledAppsProvider {
  private timer: Timer;
  private delayMs: number;
  private installedApps: string[];
  private shouldThrow: boolean;
  private error: Error;
  private callCount = 0;
  private completedCount = 0;

  constructor(timer: Timer, options: FakeInstalledAppsProviderOptions = {}) {
    this.timer = timer;
    this.delayMs = options.delayMs ?? 0;
    this.installedApps = options.installedApps ?? [];
    this.shouldThrow = options.shouldThrow ?? false;
    this.error = options.error ?? new Error("Fake installed apps provider error");
  }

  async listInstalledApps(): Promise<string[]> {
    this.callCount += 1;
    await this.timer.sleep(this.delayMs);
    this.completedCount += 1;
    if (this.shouldThrow) {
      throw this.error;
    }
    return this.installedApps;
  }

  getCallCount(): number {
    return this.callCount;
  }

  getCompletedCount(): number {
    return this.completedCount;
  }
}
