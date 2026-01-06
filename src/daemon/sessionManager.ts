import { defaultTimer, Timer } from "../utils/SystemTimer";
import { logger } from "../utils/logger";

/**
 * Session Cache Data
 *
 * Stores data that can be reused across multiple tool calls
 * within the same test session, reducing redundant API calls.
 */
export interface SessionCacheData {
  lastHierarchy?: string;      // Last observed view hierarchy
  lastScreenshot?: string;     // Base64 encoded last screenshot
  lastObserveTime?: number;    // Timestamp of last hierarchy observation
  customData?: Record<string, any>; // Custom data set by tools
}

/**
 * Session Record
 *
 * Represents a single test session with an assigned device.
 * Each JUnitRunner test process gets a unique session UUID.
 */
export interface Session {
  sessionId: string;           // UUID provided by JUnitRunner
  assignedDevice: string;      // Device ID this session is using
  createdAt: number;           // Timestamp when session was created
  lastUsedAt: number;          // Last activity timestamp
  expiresAt: number;           // When session will expire (for cleanup)
  cacheData: SessionCacheData; // Cached data for this session
  lastHeartbeat: number;       // Timestamp of last heartbeat
  heartbeatTimeoutMs: number;  // Heartbeat timeout for this session
  hasReceivedHeartbeat: boolean; // Whether any heartbeat has been received
}

/**
 * Session Manager
 *
 * Manages test session lifecycle:
 * - Create sessions with device assignment
 * - Track cache data per session
 * - Release sessions and free up devices
 * - Auto-cleanup expired sessions
 *
 * This enables parallel tests to each have their own device
 * while sharing centralized state in the daemon.
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private sessionDeviceMap: Map<string, string> = new Map(); // sessionId -> deviceId
  private deviceSessionMap: Map<string, string> = new Map(); // deviceId -> sessionId (reverse lookup)
  private cleanupTimer: NodeJS.Timeout | null = null;
  private timer: Timer;

  // Session timeout: 30 minutes
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000;

  // Cleanup interval: every 5 minutes
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

  static readonly DEFAULT_HEARTBEAT_TIMEOUT_MS = 10 * 1000;

  constructor(timer: Timer = defaultTimer) {
    this.timer = timer;
    // Start periodic cleanup of expired sessions
    this.startCleanupTimer();
  }

  /**
   * Create a new session with an assigned device
   *
   * This is called by the daemon when a session UUID is first used.
   * The DevicePool will assign an available device to this session.
   */
  async createSession(
    sessionId: string,
    assignedDevice: string
  ): Promise<Session> {
    if (this.sessions.has(sessionId)) {
      logger.warn(`Session ${sessionId} already exists, returning existing session`);
      return this.sessions.get(sessionId)!;
    }

    const now = this.timer.now();
    const session: Session = {
      sessionId,
      assignedDevice,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: now + this.SESSION_TIMEOUT_MS,
      cacheData: {},
      lastHeartbeat: now,
      heartbeatTimeoutMs: SessionManager.DEFAULT_HEARTBEAT_TIMEOUT_MS,
      hasReceivedHeartbeat: false,
    };

    this.sessions.set(sessionId, session);
    this.sessionDeviceMap.set(sessionId, assignedDevice);
    this.deviceSessionMap.set(assignedDevice, sessionId);

    logger.info(`Created session ${sessionId} with device ${assignedDevice}`);
    return session;
  }

  /**
   * Get existing session
   */
  getSession(sessionId: string): Session | null {
    const session = this.sessions.get(sessionId);
    if (session && this.isSessionExpired(session)) {
      logger.info(`Session ${sessionId} has expired, removing`);
      this.removeSession(sessionId);
      return null;
    }
    return session || null;
  }

  /**
   * Get or create session with device assignment
   *
   * Automatically creates a session if it doesn't exist.
   * Called when --session-uuid is provided to a CLI command.
   *
   * @param sessionId - The session UUID
   * @param devicePool - DevicePool instance for automatic device assignment
   */
  async getOrCreateSession(
    sessionId: string,
    devicePool?: import("./devicePool").DevicePool
  ): Promise<Session> {
    const existing = this.getSession(sessionId);
    if (existing) {
      logger.info(`[SessionManager] Found existing session ${sessionId} with device ${existing.assignedDevice}`);
      // Update last used time
      existing.lastUsedAt = this.timer.now();
      existing.expiresAt = this.timer.now() + this.SESSION_TIMEOUT_MS;
      return existing;
    }

    logger.info(`[SessionManager] Creating new session ${sessionId}, calling devicePool.assignDeviceToSession()`);

    // Need to create new session - assign device from pool
    if (!devicePool) {
      throw new Error(
        `Session ${sessionId} not found and no device pool provided for auto-assignment.`
      );
    }

    // DevicePool will call createSession() with assigned device
    await devicePool.assignDeviceToSession(sessionId);

    // Session now exists, return it
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(
        `Session ${sessionId} creation failed after device assignment`
      );
    }

    logger.info(`[SessionManager] Successfully created session ${sessionId} with device ${session.assignedDevice}`);
    return session;
  }

  /**
   * Get device assigned to a session
   */
  getDeviceForSession(sessionId: string): string | null {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }
    return session.assignedDevice;
  }

  /**
   * Release a session and free its device
   *
   * Called when a test completes or times out.
   * Returns the device ID so DevicePool can mark it as available.
   */
  async releaseSession(sessionId: string): Promise<string | null> {
    const session = this.getSession(sessionId);
    if (!session) {
      logger.warn(`Cannot release session ${sessionId}: not found`);
      return null;
    }

    const deviceId = session.assignedDevice;
    this.removeSession(sessionId);
    logger.info(`Released session ${sessionId}, freeing device ${deviceId}`);

    return deviceId;
  }

  /**
   * Update session cache data
   *
   * Allows tools to store data (screenshots, hierarchies) that can be
   * reused by other tools in the same session without re-fetching.
   */
  updateSessionCache(
    sessionId: string,
    updates: Partial<SessionCacheData>
  ): void {
    const session = this.getSession(sessionId);
    if (!session) {
      logger.warn(`Cannot update cache for session ${sessionId}: not found`);
      return;
    }

    session.cacheData = {
      ...session.cacheData,
      ...updates,
    };
    session.lastUsedAt = this.timer.now();
    session.lastHeartbeat = this.timer.now();

    logger.debug(`Updated cache for session ${sessionId}`);
  }

  /**
   * Get session cache data
   */
  getSessionCache(sessionId: string): SessionCacheData | null {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    // Update last used time when accessing cache
    session.lastUsedAt = this.timer.now();
    session.lastHeartbeat = this.timer.now();

    return session.cacheData;
  }

  /**
   * Record a heartbeat for a session
   */
  recordHeartbeat(sessionId: string): void {
    const session = this.getSession(sessionId);
    if (!session) {
      logger.warn(`Cannot record heartbeat for session ${sessionId}: not found`);
      return;
    }
    const now = this.timer.now();
    session.lastHeartbeat = now;
    session.lastUsedAt = now;
    session.expiresAt = now + this.SESSION_TIMEOUT_MS;
    session.hasReceivedHeartbeat = true;
  }

  /**
   * Clear session cache (for specific key or all)
   */
  clearSessionCache(sessionId: string, key?: string): void {
    const session = this.getSession(sessionId);
    if (!session) {
      return;
    }

    if (key) {
      delete session.cacheData[key as keyof SessionCacheData];
    } else {
      session.cacheData = {};
    }

    logger.debug(
      `Cleared cache for session ${sessionId}${key ? ` (key: ${key})` : " (all)"}`
    );
  }

  /**
   * Get count of active sessions
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(
      s => !this.isSessionExpired(s)
    );
  }

  /**
   * Get all devices currently assigned to sessions
   */
  getAssignedDevices(): Set<string> {
    return new Set(
      Array.from(this.sessions.values())
        .filter(s => !this.isSessionExpired(s))
        .map(s => s.assignedDevice)
    );
  }

  /**
   * Check if session is expired
   */
  private isSessionExpired(session: Session): boolean {
    return this.timer.now() > session.expiresAt;
  }

  /**
   * Remove session from all maps
   */
  private removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.deviceSessionMap.delete(session.assignedDevice);
    }
    this.sessions.delete(sessionId);
    this.sessionDeviceMap.delete(sessionId);
  }

  /**
   * Start periodic cleanup of expired sessions
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = this.timer.setInterval(() => {
      const expiredSessions: string[] = [];

      for (const [sessionId, session] of this.sessions) {
        if (this.isSessionExpired(session)) {
          expiredSessions.push(sessionId);
        }
      }

      if (expiredSessions.length > 0) {
        logger.info(
          `Cleaning up ${expiredSessions.length} expired sessions: ` +
          expiredSessions.join(", ")
        );

        for (const sessionId of expiredSessions) {
          this.removeSession(sessionId);
        }
      }
    }, this.CLEANUP_INTERVAL_MS);

    // Allow process to exit even if timer is running
    if (this.cleanupTimer && typeof (this.cleanupTimer as { unref?: () => void }).unref === "function") {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop cleanup timer (called on daemon shutdown)
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      this.timer.clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Get statistics for monitoring
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
    assignedDevices: number;
    } {
    const activeSessions = this.getAllSessions().length;
    const expiredSessions = this.sessions.size - activeSessions;

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      expiredSessions,
      assignedDevices: this.getAssignedDevices().size,
    };
  }
}
