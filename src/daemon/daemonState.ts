import { SessionManager } from "./sessionManager";
import { DevicePool } from "./devicePool";

/**
 * Singleton for accessing daemon state
 *
 * Provides access to SessionManager and DevicePool instances
 * for both the daemon process and internal command handlers.
 */
export class DaemonState {
  private static instance: DaemonState;
  private sessionManager: SessionManager | null = null;
  private devicePool: DevicePool | null = null;

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): DaemonState {
    if (!DaemonState.instance) {
      DaemonState.instance = new DaemonState();
    }
    return DaemonState.instance;
  }

  /**
   * Initialize daemon state
   * Called by Daemon after creating SessionManager and DevicePool
   */
  initialize(sessionManager: SessionManager, devicePool: DevicePool): void {
    this.sessionManager = sessionManager;
    this.devicePool = devicePool;
  }

  /**
   * Get the SessionManager
   */
  getSessionManager(): SessionManager {
    if (!this.sessionManager) {
      throw new Error("DaemonState not initialized");
    }
    return this.sessionManager;
  }

  /**
   * Get the DevicePool
   */
  getDevicePool(): DevicePool {
    if (!this.devicePool) {
      throw new Error("DaemonState not initialized");
    }
    return this.devicePool;
  }

  /**
   * Check if daemon state is initialized
   */
  isInitialized(): boolean {
    return this.sessionManager !== null && this.devicePool !== null;
  }

  /**
   * Reset state (for testing or shutdown)
   */
  reset(): void {
    this.sessionManager = null;
    this.devicePool = null;
  }
}
