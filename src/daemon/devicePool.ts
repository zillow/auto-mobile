import { logger } from "../utils/logger";
import { SessionManager } from "./sessionManager";
import { ActionableError } from "../models";
import { Mutex } from "async-mutex";
import { MultiPlatformDeviceManager } from "../utils/deviceUtils";
import { Timer, defaultTimer } from "../utils/SystemTimer";

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
  private static instanceCounter = 0;
  private readonly instanceId: number;
  private devices: Map<string, PooledDevice> = new Map();
  private sessionManager: SessionManager;
  private assignmentMutex = new Mutex();
  private timer: Timer;
  private lastUsedAtMarker = 0;
  private lastReleasedDeviceId: string | null = null;

  // Max consecutive errors before marking device as failed
  private readonly MAX_DEVICE_ERRORS = 5;

  // Device wait configuration for parallel test execution
  private readonly DEVICE_WAIT_TIMEOUT_MS = 60000; // 60 seconds max wait
  private readonly DEVICE_WAIT_INTERVAL_MS = 1000; // Check every 1 second

  constructor(sessionManager: SessionManager, timer: Timer = defaultTimer) {
    this.instanceId = ++DevicePool.instanceCounter;
    logger.info(`[DEVICE-POOL-DEBUG] Creating DevicePool instance #${this.instanceId}`);
    this.sessionManager = sessionManager;
    this.timer = timer;
  }

  /**
   * Initialize pool with available devices
   *
   * Call this once after daemon starts to populate the device list.
   * Typically gets devices from --device-list or by querying emulator status.
   */
  async initializeWithDevices(deviceIds: string[]): Promise<void> {
    const now = this.seedLastUsedAt(this.timer.now());

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
   * Refresh device pool by discovering connected devices
   *
   * Automatically called when pool is empty and a session requests a device.
   * This handles race conditions during daemon startup where device discovery
   * may not have completed before tests begin.
   *
   * Only adds new devices - does not remove existing devices that may be assigned.
   */
  async refreshDevices(): Promise<number> {
    const startTime = Date.now();
    try {
      logger.info("Refreshing device pool - discovering connected devices...");

      // Log environment for debugging CI issues
      const androidHome = process.env.ANDROID_HOME || "(not set)";
      const androidSdkRoot = process.env.ANDROID_SDK_ROOT || "(not set)";
      logger.info(`Environment: ANDROID_HOME=${androidHome}, ANDROID_SDK_ROOT=${androidSdkRoot}`);

      const deviceManager = new MultiPlatformDeviceManager();
      const bootedDevices = await deviceManager.getBootedDevices("android");
      const discoveryTime = Date.now() - startTime;
      logger.info(`Device discovery completed in ${discoveryTime}ms, found ${bootedDevices.length} devices`);

      const now = this.seedLastUsedAt(this.timer.now());
      let addedCount = 0;

      for (const device of bootedDevices) {
        if (!this.devices.has(device.deviceId)) {
          this.devices.set(device.deviceId, {
            id: device.deviceId,
            sessionId: null,
            status: "idle",
            lastUsedAt: now,
            assignmentCount: 0,
            errorCount: 0,
          });
          addedCount++;
          logger.info(`Added device ${device.deviceId} to pool during refresh`);
        }
      }

      if (addedCount > 0) {
        logger.info(`Device pool refreshed: added ${addedCount} new devices (total: ${this.devices.size})`);
      } else if (bootedDevices.length === 0) {
        logger.warn("No devices found during pool refresh. Is an emulator running?");
        logger.warn("Ensure 'adb devices' returns connected devices in the daemon process environment.");
      } else {
        logger.debug(`Device pool refresh: all ${bootedDevices.length} devices already in pool`);
      }

      return addedCount;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      logger.error(`Failed to refresh device pool after ${elapsed}ms: ${error}`);
      if (error instanceof Error) {
        logger.error(`Stack trace: ${error.stack}`);
      }
      return 0;
    }
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
      lastUsedAt: this.seedLastUsedAt(this.timer.now()),
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
   * Assign multiple devices to sessions upfront with a shared timeout
   *
   * This is used for multi-device plans where we want to allocate all devices
   * before execution begins, ensuring we fail fast if not enough devices are available.
   *
   * @param sessionIds Array of session IDs to assign devices to
   * @param timeoutMs Total timeout in milliseconds for allocating ALL devices (default: 5 minutes)
   * @returns Map of sessionId -> deviceId for all assigned devices
   * @throws ActionableError if unable to allocate all devices within timeout
   */
  async assignMultipleDevices(
    sessionIds: string[],
    timeoutMs: number = 300000
  ): Promise<Map<string, string>> {
    const startTime = this.timer.now();
    const assignments = new Map<string, string>();
    const requiredCount = sessionIds.length;

    logger.info(
      `[DevicePool] Starting upfront allocation of ${requiredCount} devices ` +
      `(timeout: ${timeoutMs / 1000}s)`
    );

    // Validate we have enough devices
    await this.ensurePoolRefreshed();
    const stats = this.getStats();

    if (stats.total < requiredCount) {
      throw new ActionableError(
        `Not enough devices in pool: need ${requiredCount}, have ${stats.total}.\n` +
        `Device pool status:\n` +
        `  Total devices: ${stats.total}\n` +
        `  Idle: ${stats.idle}\n` +
        `  Assigned: ${stats.assigned}\n` +
        `  Error: ${stats.error}\n\n` +
        `Suggestions:\n` +
        `  - Start ${requiredCount - stats.total} more emulator(s) or connect more devices\n` +
        `  - Reduce the number of devices required in the test plan\n` +
        `  - Verify ADB is working: adb devices`
      );
    }

    // Try to assign devices with shared timeout
    let attemptCount = 0;
    const assigned = new Set<string>();

    while (assigned.size < requiredCount) {
      attemptCount++;
      const elapsed = this.timer.now() - startTime;

      // Check timeout
      if (elapsed > timeoutMs) {
        // Release any devices we've assigned so far
        for (const deviceId of assignments.values()) {
          await this.releaseDevice(deviceId);
        }
        const currentStats = this.getStats();
        throw new ActionableError(
          `Timed out allocating devices after ${Math.round(elapsed / 1000)}s (${attemptCount} attempts).\n` +
          `Required: ${requiredCount} devices, allocated: ${assigned.size}\n` +
          `Device pool status:\n` +
          `  Total devices: ${currentStats.total}\n` +
          `  Idle: ${currentStats.idle}\n` +
          `  Assigned: ${currentStats.assigned}\n` +
          `  Error: ${currentStats.error}\n\n` +
          `Suggestions:\n` +
          `  - Reduce parallel test count to match available devices\n` +
          `  - Start additional emulators or connect more physical devices\n` +
          `  - Increase device allocation timeout\n` +
          `  - Check if tests are properly releasing devices after completion`
        );
      }

      // Try to assign next session
      const sessionIndex = assigned.size;
      const sessionId = sessionIds[sessionIndex];

      const result = await this.tryAssignDevice(sessionId);

      if (result.success) {
        assigned.add(sessionId);
        assignments.set(sessionId, result.deviceId!);
        logger.info(
          `[DevicePool] Allocated device ${result.deviceId} to session ${sessionId} ` +
          `(${assigned.size}/${requiredCount})`
        );
      } else if (!result.shouldWait) {
        // No devices at all - this shouldn't happen as we checked earlier
        // but handle it gracefully
        const currentStats = this.getStats();
        throw new ActionableError(
          `Failed to allocate devices: no devices available.\n` +
          `Required: ${requiredCount} devices, allocated: ${assigned.size}\n` +
          `Device pool status:\n` +
          `  Total devices: ${currentStats.total}\n` +
          `  Idle: ${currentStats.idle}\n` +
          `  Assigned: ${currentStats.assigned}\n` +
          `  Error: ${currentStats.error}\n\n` +
          `Suggestions:\n` +
          `  - Start an emulator or connect a physical device\n` +
          `  - Check device pool status: auto-mobile --cli listDevices --platform android\n` +
          `  - Verify ADB is working: adb devices`
        );
      } else {
        // Devices busy - wait and retry
        if (attemptCount === 1) {
          logger.info(
            `[DevicePool] Waiting for ${requiredCount - assigned.size} more device(s) ` +
            `(${result.totalDevices} total, all currently busy)...`
          );
        }
        await this.timer.sleep(this.DEVICE_WAIT_INTERVAL_MS);
      }
    }

    const totalElapsed = this.timer.now() - startTime;
    logger.info(
      `[DevicePool] Successfully allocated ${requiredCount} devices ` +
      `in ${totalElapsed}ms (${attemptCount} attempts)`
    );

    return assignments;
  }

  /**
   * Ensure device pool has been refreshed at least once
   */
  private async ensurePoolRefreshed(): Promise<void> {
    if (this.devices.size === 0) {
      logger.info("[DevicePool] Pool is empty, attempting auto-refresh...");
      await this.refreshDevices();
    }
  }

  private seedLastUsedAt(now: number): number {
    if (now > this.lastUsedAtMarker) {
      this.lastUsedAtMarker = now;
    }
    return this.lastUsedAtMarker;
  }

  private nextLastUsedAt(): number {
    const now = this.timer.now();
    if (now <= this.lastUsedAtMarker) {
      this.lastUsedAtMarker += 1;
      return this.lastUsedAtMarker;
    }
    this.lastUsedAtMarker = now;
    return now;
  }

  /**
   * Assign a device to a session
   *
   * Called when a new session is created or when a session needs to pick a device.
   * Returns the device ID assigned to the session.
   *
   * Uses mutex to ensure atomic device assignment and prevent race conditions
   * when multiple tests run in parallel.
   *
   * Automatically refreshes device pool if empty, handling race conditions during
   * daemon startup where device discovery may not have completed.
   *
   * When all devices are busy, waits with timeout for a device to become available.
   * This enables parallel test execution with limited devices.
   */
  async assignDeviceToSession(sessionId: string): Promise<string> {
    logger.info(`[DEVICE-POOL-DEBUG] Instance #${this.instanceId}: assignDeviceToSession called for session ${sessionId}`);
    logger.info(`[DEVICE-POOL-DEBUG] Instance #${this.instanceId}: Current devices.size: ${this.devices.size}`);
    logger.info(`[DEVICE-POOL-DEBUG] Instance #${this.instanceId}: Device IDs: ${Array.from(this.devices.keys()).join(", ")}`);
    const startTime = this.timer.now();
    let attemptCount = 0;

    while (true) {
      attemptCount++;
      const elapsed = this.timer.now() - startTime;

      // Check timeout
      if (elapsed > this.DEVICE_WAIT_TIMEOUT_MS) {
        const stats = this.getStats();
        throw new ActionableError(
          `Timed out waiting for device after ${Math.round(elapsed / 1000)}s (${attemptCount} attempts).\n` +
          `Session: ${sessionId}\n` +
          `Device pool status:\n` +
          `  Total devices: ${stats.total}\n` +
          `  Idle: ${stats.idle}\n` +
          `  Assigned: ${stats.assigned}\n` +
          `  Error: ${stats.error}\n\n` +
          `Suggestions:\n` +
          `  - Reduce parallel test count to match available devices\n` +
          `  - Start additional emulators or connect more physical devices\n` +
          `  - Check if tests are properly releasing devices after completion`
        );
      }

      // Try to assign device (mutex ensures atomic assignment)
      const result = await this.tryAssignDevice(sessionId);

      if (result.success) {
        if (attemptCount > 1) {
          logger.info(
            `Device ${result.deviceId} assigned to session ${sessionId} ` +
            `after ${attemptCount} attempts (${elapsed}ms wait)`
          );
        }
        return result.deviceId!;
      }

      // No device available - check if we should wait or fail
      if (result.shouldWait) {
        // Devices exist but are busy - wait and retry
        if (attemptCount === 1) {
          logger.info(
            `All ${result.totalDevices} devices busy, ` +
            `session ${sessionId} waiting for availability (timeout: ${this.DEVICE_WAIT_TIMEOUT_MS / 1000}s)...`
          );
        }
        await this.timer.sleep(this.DEVICE_WAIT_INTERVAL_MS);
      } else {
        // No devices at all - fail immediately
        const stats = this.getStats();
        throw new ActionableError(
          `No devices in pool to assign to session ${sessionId}.\n` +
          `Device pool status:\n` +
          `  Total devices: ${stats.total}\n` +
          `  Idle: ${stats.idle}\n` +
          `  Assigned: ${stats.assigned}\n` +
          `  Error: ${stats.error}\n\n` +
          `Suggestions:\n` +
          `  - Start an emulator or connect a physical device\n` +
          `  - Check device pool status: auto-mobile --cli listDevices --platform android\n` +
          `  - Verify ADB is working: adb devices`
        );
      }
    }
  }

  /**
   * Try to assign a device to a session (single attempt)
   *
   * Returns success status and whether caller should wait and retry.
   */
  private async tryAssignDevice(sessionId: string): Promise<{
    success: boolean;
    deviceId?: string;
    shouldWait: boolean;
    totalDevices: number;
  }> {
    return await this.assignmentMutex.runExclusive(async () => {
      logger.info(`[DEVICE-POOL-DEBUG] tryAssignDevice: devices.size = ${this.devices.size}`);
      logger.info(`[DEVICE-POOL-DEBUG] tryAssignDevice: device IDs = ${Array.from(this.devices.keys()).join(", ")}`);

      // Find idle devices and prefer most recently released for reuse
      const idleDevices = Array.from(this.devices.values()).filter(d => d.status === "idle");
      let device: PooledDevice | undefined;
      if (idleDevices.length > 0) {
        if (this.lastReleasedDeviceId) {
          device = idleDevices.find(d => d.id === this.lastReleasedDeviceId);
        }
        if (!device) {
          // Sort by lastUsedAt (ascending) to get least recently used device
          // This provides better load distribution across devices
          idleDevices.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
          device = idleDevices[0];
        }
      }
      logger.info(`[DEVICE-POOL-DEBUG] tryAssignDevice: found idle device = ${device?.id || "none"}`);

      // If no devices available and pool is empty, try to refresh
      // This handles race conditions during daemon startup
      if (!device && this.devices.size === 0) {
        logger.info("Device pool is empty, attempting auto-refresh...");
        const addedCount = await this.refreshDevices();
        logger.info(`[DEVICE-POOL-DEBUG] Auto-refresh added ${addedCount} devices`);
        if (addedCount > 0) {
          // Try again after refresh
          device = Array.from(this.devices.values()).find(d => d.status === "idle");
          logger.info(`[DEVICE-POOL-DEBUG] After refresh, found idle device = ${device?.id || "none"}`);
        }
      }

      const totalDevices = this.devices.size;
      logger.info(`[DEVICE-POOL-DEBUG] tryAssignDevice: totalDevices = ${totalDevices}`);

      if (!device) {
        // No idle device - check if devices exist but are busy
        const busyDevices = Array.from(this.devices.values()).filter(
          d => d.status === "busy"
        ).length;

        return {
          success: false,
          shouldWait: busyDevices > 0, // Wait if devices are busy, fail if none exist
          totalDevices,
        };
      }

      // Assign to session
      device.sessionId = sessionId;
      device.status = "busy";
      device.lastUsedAt = this.nextLastUsedAt();
      device.assignmentCount++;
      device.errorCount = 0; // Reset errors on successful assignment

      // Create session in SessionManager
      await this.sessionManager.createSession(sessionId, device.id);

      logger.info(`Assigned device ${device.id} to session ${sessionId}`);

      return {
        success: true,
        deviceId: device.id,
        shouldWait: false,
        totalDevices,
      };
    });
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
    this.lastReleasedDeviceId = deviceId;

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
