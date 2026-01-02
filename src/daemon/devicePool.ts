import { logger } from "../utils/logger";
import { SessionManager } from "./sessionManager";

/**
 * Pooled Device Status
 */
export type DeviceStatus = "idle" | "busy" | "error";

/**
 * Pooled Device
 *
 * Represents a device in the pool with assignment info
 */
export interface PooledDevice {
  id: string;                    // Device ID (e.g., "emulator-5554")
  sessionId: string | null;      // Session currently using it, null if idle
  status: DeviceStatus;          // Current status
  lastUsedAt: number;            // Last usage timestamp
  assignmentCount: number;       // How many times assigned
  errorCount: number;            // Consecutive errors
}

/**
 * Device Pool
 *
 * Manages a pool of Android devices for parallel test execution:
 * - Tracks which devices are available vs assigned to sessions
 * - Ensures each session gets a unique device
 * - Enables multiple tests to run in parallel
 *
 * Works with SessionManager to maintain bidirectional mappings.
 */
export class DevicePool {
  private devices: Map<string, PooledDevice> = new Map();
  private sessionManager: SessionManager;

  // Max consecutive errors before marking device as failed
  private readonly MAX_DEVICE_ERRORS = 5;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  /**
   * Initialize pool with available devices
   *
   * Call this once after daemon starts to populate the device list.
   * Typically gets devices from --device-list or by querying emulator status.
   */
  async initializeWithDevices(deviceIds: string[]): Promise<void> {
    const now = Date.now();

    for (const deviceId of deviceIds) {
      this.devices.set(deviceId, {
        id: deviceId,
        sessionId: null,
        status: "idle",
        lastUsedAt: now,
        assignmentCount: 0,
        errorCount: 0,
      });
    }

    logger.info(`Device pool initialized with ${deviceIds.length} devices`);
  }

  /**
   * Add a new device to the pool
   */
  addDevice(deviceId: string): void {
    if (this.devices.has(deviceId)) {
      logger.warn(`Device ${deviceId} already in pool`);
      return;
    }

    this.devices.set(deviceId, {
      id: deviceId,
      sessionId: null,
      status: "idle",
      lastUsedAt: Date.now(),
      assignmentCount: 0,
      errorCount: 0,
    });

    logger.info(`Added device ${deviceId} to pool`);
  }

  /**
   * Remove device from pool
   */
  removeDevice(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (!device) {
      return;
    }

    if (device.sessionId) {
      logger.warn(`Cannot remove device ${deviceId}: assigned to session ${device.sessionId}`);
      return;
    }

    this.devices.delete(deviceId);
    logger.info(`Removed device ${deviceId} from pool`);
  }

  /**
   * Assign a device to a session
   *
   * Called when a new session is created or when a session needs to pick a device.
   * Returns the device ID assigned to the session.
   */
  async assignDeviceToSession(sessionId: string): Promise<string> {
    // Find first idle device
    const device = Array.from(this.devices.values()).find(d => d.status === "idle");

    if (!device) {
      throw new Error(
        `No available devices to assign to session ${sessionId}. ` +
        `All ${this.devices.size} devices are currently in use.`
      );
    }

    // Assign to session
    device.sessionId = sessionId;
    device.status = "busy";
    device.lastUsedAt = Date.now();
    device.assignmentCount++;
    device.errorCount = 0; // Reset errors on successful assignment

    // Create session in SessionManager
    await this.sessionManager.createSession(sessionId, device.id);

    logger.info(`Assigned device ${device.id} to session ${sessionId}`);

    return device.id;
  }

  /**
   * Release device from session
   *
   * Called when a session completes or times out.
   * Frees the device so it can be assigned to other sessions.
   */
  async releaseDevice(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      logger.warn(`Cannot release device ${deviceId}: not in pool`);
      return;
    }

    if (!device.sessionId) {
      logger.debug(`Device ${deviceId} is already idle`);
      return;
    }

    const sessionId = device.sessionId;
    device.sessionId = null;
    device.status = "idle";
    device.errorCount = 0;

    logger.info(`Released device ${deviceId} from session ${sessionId}`);
  }

  /**
   * Mark device as having an error
   *
   * Track consecutive errors. If errors exceed threshold, mark device as failed.
   */
  recordDeviceError(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (!device) {
      return;
    }

    device.errorCount++;

    if (device.errorCount >= this.MAX_DEVICE_ERRORS) {
      device.status = "error";
      logger.error(
        `Device ${deviceId} marked as error ` +
        `(${device.errorCount} consecutive errors)`
      );
    } else {
      logger.warn(
        `Device ${deviceId} error count: ${device.errorCount}/${this.MAX_DEVICE_ERRORS}`
      );
    }
  }

  /**
   * Clear error count for device (after successful operation)
   */
  clearDeviceError(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.errorCount = 0;
    }
  }

  /**
   * Get device by ID
   */
  getDevice(deviceId: string): PooledDevice | null {
    return this.devices.get(deviceId) || null;
  }

  /**
   * Get device assigned to session
   */
  getDeviceForSession(sessionId: string): PooledDevice | null {
    return (
      Array.from(this.devices.values()).find(d => d.sessionId === sessionId) || null
    );
  }

  /**
   * Get all idle devices (available for assignment)
   */
  getIdleDevices(): PooledDevice[] {
    return Array.from(this.devices.values()).filter(d => d.status === "idle");
  }

  /**
   * Get all devices currently assigned to sessions
   */
  getAssignedDevices(): PooledDevice[] {
    return Array.from(this.devices.values()).filter(
      d => d.status === "busy" && d.sessionId !== null
    );
  }

  /**
   * Get all devices in error state
   */
  getErrorDevices(): PooledDevice[] {
    return Array.from(this.devices.values()).filter(d => d.status === "error");
  }

  /**
   * Get count of available devices (can be assigned to new sessions)
   */
  getAvailableDeviceCount(): number {
    return this.getIdleDevices().length;
  }

  /**
   * Get total device count
   */
  getTotalDeviceCount(): number {
    return this.devices.size;
  }

  /**
   * Get all devices in pool
   */
  getAllDevices(): PooledDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get pool statistics for monitoring
   */
  getStats(): {
    total: number;
    idle: number;
    assigned: number;
    error: number;
    avgAssignments: number;
    } {
    const all = this.getAllDevices();
    const idle = this.getIdleDevices().length;
    const assigned = this.getAssignedDevices().length;
    const error = this.getErrorDevices().length;
    const avgAssignments = all.length > 0
      ? Math.round(
        all.reduce((sum, d) => sum + d.assignmentCount, 0) / all.length
      )
      : 0;

    return {
      total: all.length,
      idle,
      assigned,
      error,
      avgAssignments,
    };
  }

  /**
   * Get detailed status report
   */
  getStatusReport(): string {
    const stats = this.getStats();
    const lines = [
      "\n=== Device Pool Status ===",
      `Total Devices: ${stats.total}`,
      `  Idle:       ${stats.idle}`,
      `  Assigned:   ${stats.assigned}`,
      `  Error:      ${stats.error}`,
      `Avg Assignments: ${stats.avgAssignments}`,
      "",
      "Device Details:",
    ];

    for (const device of this.getAllDevices()) {
      const status = device.status === "error" ? "❌" : device.sessionId ? "🔴" : "🟢";
      const session = device.sessionId ? ` (${device.sessionId})` : "";
      lines.push(
        `  ${status} ${device.id}: ${device.status}${session} (${device.assignmentCount} uses, ${device.errorCount} errors)`
      );
    }

    lines.push("=== End Report ===\n");
    return lines.join("\n");
  }
}
