import type { WorkProfileMonitor, ProfileState } from "../../src/utils/WorkProfileMonitor";

/**
 * Fake implementation of WorkProfileMonitor for testing
 * Tracks calls and allows configuring profile states
 */
export class FakeWorkProfileMonitor implements WorkProfileMonitor {
  private profileStates: Map<number, ProfileState> = new Map();
  private running: boolean = false;
  private startCalls: number = 0;
  private stopCalls: number = 0;
  private refreshCalls: number[] = [];

  start(): void {
    this.running = true;
    this.startCalls++;
  }

  stop(): void {
    this.running = false;
    this.stopCalls++;
  }

  setProfileHasAccessibilityService(userId: number, hasService: boolean): void {
    const existing = this.profileStates.get(userId);
    if (existing) {
      existing.hasAccessibilityService = hasService;
    } else {
      this.profileStates.set(userId, {
        userId,
        hasAccessibilityService: hasService,
        lastRefreshMs: 0
      });
    }
  }

  getProfileStates(): ProfileState[] {
    return Array.from(this.profileStates.values());
  }

  async refreshProfile(userId: number): Promise<void> {
    this.refreshCalls.push(userId);
    const state = this.profileStates.get(userId);
    if (state) {
      state.lastRefreshMs = Date.now();
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  // Test helper methods

  /**
   * Get number of times start() was called
   */
  getStartCallCount(): number {
    return this.startCalls;
  }

  /**
   * Get number of times stop() was called
   */
  getStopCallCount(): number {
    return this.stopCalls;
  }

  /**
   * Get all user IDs that had refreshProfile() called
   */
  getRefreshCalls(): number[] {
    return [...this.refreshCalls];
  }

  /**
   * Check if refreshProfile was called for a specific user
   */
  wasRefreshCalled(userId: number): boolean {
    return this.refreshCalls.includes(userId);
  }

  /**
   * Clear all call history
   */
  clearHistory(): void {
    this.startCalls = 0;
    this.stopCalls = 0;
    this.refreshCalls = [];
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.profileStates.clear();
    this.running = false;
    this.clearHistory();
  }
}
