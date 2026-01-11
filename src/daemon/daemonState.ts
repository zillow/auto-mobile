import { SessionManager } from "./sessionManager";
import { DevicePool } from "./devicePool";
import { logger } from "../utils/logger";

export interface DaemonStateLike {
  isInitialized(): boolean;
  getSessionManager(): SessionManager;
  getDevicePool(): DevicePool;
}

/**
 * Singleton for accessing daemon state
 *
 * Provides access to SessionManager and DevicePool instances
 * for both the daemon process and internal command handlers.
 */
export class DaemonState implements DaemonStateLike {
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
      logger.error("[DAEMON-STATE-DEBUG] getDevicePool called but devicePool is null!");
      throw new Error("DaemonState not initialized");
    }
    const stats = this.devicePool.getStats();
    const poolInstanceId = (this.devicePool as any).instanceId;
    logger.info(`[DAEMON-STATE-DEBUG] getDevicePool returning pool instance #${poolInstanceId} with ${stats.total} devices`);
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
