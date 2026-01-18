import { logger } from "../utils/logger";
import { SessionManager } from "./sessionManager";
import { ActionableError, BootedDevice, DeviceInfo, Platform } from "../models";
import { Mutex } from "async-mutex";
import { MultiPlatformDeviceManager, PlatformDeviceManager } from "../utils/deviceUtils";
import { Timer, defaultTimer } from "../utils/SystemTimer";
import type { InstalledAppsStore } from "../db/installedAppsRepository";
import { InstalledAppsRepository } from "../db/installedAppsRepository";

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
  name: string;                  // Device name (e.g., "Pixel 7")
  platform: Platform;            // Device platform
  sessionId: string | null;      // Session currently using it, null if idle
  status: DeviceStatus;          // Current status
  lastUsedAt: number;            // Last usage timestamp
  assignmentCount: number;       // How many times assigned
  errorCount: number;            // Consecutive errors
  iosVersion?: string;           // iOS version (simulators only)
}

export interface DeviceAllocationCriteria {
  platform?: Platform;
  simulatorType?: string;
  iosVersion?: string;
}

export interface DeviceAllocationRequest {
  sessionId: string;
  criteria?: DeviceAllocationCriteria;
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
  private deviceSessionStarts: Map<string, number> = new Map();
  private sessionManager: SessionManager;
  private assignmentMutex = new Mutex();
  private timer: Timer;
  private lastUsedAtMarker = 0;
  private lastReleasedDeviceId: string | null = null;
  private daemonSessionId: string;
  private installedAppsRepository: InstalledAppsStore;
  private deviceManager: PlatformDeviceManager;

  // Max consecutive errors before marking device as failed
  private readonly MAX_DEVICE_ERRORS = 5;

  // Device wait configuration for parallel test execution
  private readonly DEVICE_WAIT_TIMEOUT_MS = 60000; // 60 seconds max wait
  private readonly DEVICE_WAIT_INTERVAL_MS = 1000; // Check every 1 second

  constructor(
    sessionManager: SessionManager,
    daemonSessionId: string,
    timer: Timer = defaultTimer,
    installedAppsRepository?: InstalledAppsStore,
    deviceManager: PlatformDeviceManager = new MultiPlatformDeviceManager()
  ) {
    this.instanceId = ++DevicePool.instanceCounter;
    logger.info(`[DEVICE-POOL-DEBUG] Creating DevicePool instance #${this.instanceId}`);
    this.sessionManager = sessionManager;
    this.daemonSessionId = daemonSessionId;
    this.timer = timer;
    this.installedAppsRepository = installedAppsRepository ?? new InstalledAppsRepository();
    this.deviceManager = deviceManager;
  }

  /**
   * Initialize pool with available devices
   *
   * Call this once after daemon starts to populate the device list.
   * Typically gets devices from --device-list or by querying emulator status.
   */
  async initializeWithDevices(devices: BootedDevice[]): Promise<void> {
    const now = this.seedLastUsedAt(this.timer.now());

    for (const device of devices) {
      this.devices.set(device.deviceId, {
        id: device.deviceId,
        name: device.name,
        platform: device.platform,
        sessionId: null,
        status: "idle",
        lastUsedAt: now,
        assignmentCount: 0,
        errorCount: 0,
        iosVersion: device.iosVersion,
      });
      this.deviceSessionStarts.set(device.deviceId, now);
      await this.setDeviceSessionTracking(device.deviceId, now);
    }

    logger.info(`Device pool initialized with ${devices.length} devices`);
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

      const bootedDevices = await this.deviceManager.getBootedDevices("either");
      const discoveryTime = Date.now() - startTime;
      logger.info(`Device discovery completed in ${discoveryTime}ms, found ${bootedDevices.length} devices`);

      const now = this.seedLastUsedAt(this.timer.now());
      let addedCount = 0;

      for (const device of bootedDevices) {
        if (!this.devices.has(device.deviceId)) {
          this.devices.set(device.deviceId, {
            id: device.deviceId,
            name: device.name,
            platform: device.platform,
            sessionId: null,
            status: "idle",
            lastUsedAt: now,
            assignmentCount: 0,
            errorCount: 0,
            iosVersion: device.iosVersion,
          });
          this.deviceSessionStarts.set(device.deviceId, now);
          await this.setDeviceSessionTracking(device.deviceId, now);
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
  async addDevice(device: BootedDevice): Promise<void> {
    if (this.devices.has(device.deviceId)) {
      logger.warn(`Device ${device.deviceId} already in pool`);
      return;
    }

    const now = this.seedLastUsedAt(this.timer.now());
    this.devices.set(device.deviceId, {
      id: device.deviceId,
      name: device.name,
      platform: device.platform,
      sessionId: null,
      status: "idle",
      lastUsedAt: now,
      assignmentCount: 0,
      errorCount: 0,
      iosVersion: device.iosVersion,
    });
    this.deviceSessionStarts.set(device.deviceId, now);
    await this.setDeviceSessionTracking(device.deviceId, now);

    logger.info(`Added device ${device.deviceId} to pool`);
  }

  /**
   * Remove device from pool
   */
  async removeDevice(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      return;
    }

    if (device.sessionId) {
      logger.warn(`Cannot remove device ${deviceId}: assigned to session ${device.sessionId}`);
      return;
    }

    this.devices.delete(deviceId);
    this.deviceSessionStarts.delete(deviceId);
    await this.clearDeviceSessionCache(deviceId);
    logger.info(`Removed device ${deviceId} from pool and cleared cached data`);
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
    timeoutMs: number = 300000,
    platform?: Platform
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
    let stats = this.getStatsForPlatform(platform);

    if (stats.total < requiredCount) {
      const started = await this.startAdditionalDevices(requiredCount - stats.total, platform);
      if (started > 0) {
        await this.refreshDevices();
        stats = this.getStatsForPlatform(platform);
      }
    }

    if (stats.total < requiredCount) {
      throw new ActionableError(
        `Not enough devices in pool: need ${requiredCount}, have ${stats.total}.\n` +
        `Device pool status:\n` +
        `  Total devices: ${stats.total}\n` +
        `  Idle: ${stats.idle}\n` +
        `  Assigned: ${stats.assigned}\n` +
        `  Error: ${stats.error}\n\n` +
        `Suggestions:\n` +
        `  - Start ${requiredCount - stats.total} more emulator(s) or simulators\n` +
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
        const currentStats = this.getStatsForPlatform(platform);
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

      const result = await this.tryAssignDevice(sessionId, platform);

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
        const currentStats = this.getStatsForPlatform(platform);
        throw new ActionableError(
          `Failed to allocate devices: no devices available.\n` +
          `Required: ${requiredCount} devices, allocated: ${assigned.size}\n` +
          `Device pool status:\n` +
          `  Total devices: ${currentStats.total}\n` +
          `  Idle: ${currentStats.idle}\n` +
          `  Assigned: ${currentStats.assigned}\n` +
          `  Error: ${currentStats.error}\n\n` +
          `Suggestions:\n` +
          `  - Start an emulator or simulator\n` +
          `  - Check device pool status: auto-mobile --cli listDevices\n` +
          `  - Verify device tooling is working for the selected platform`
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
   * Assign multiple devices with per-session criteria.
   *
   * This is used when plans specify device definitions (platform/type/version).
   * iOS allocations are restricted to already-booted simulators.
   */
  async assignMultipleDevicesByCriteria(
    requests: DeviceAllocationRequest[],
    timeoutMs: number = 300000
  ): Promise<Map<string, string>> {
    const startTime = this.timer.now();
    const assignments = new Map<string, string>();
    const requiredCount = requests.length;

    if (requiredCount === 0) {
      return assignments;
    }

    logger.info(
      `[DevicePool] Starting criteria-based allocation of ${requiredCount} devices ` +
      `(timeout: ${timeoutMs / 1000}s)`
    );

    await this.ensurePoolRefreshed();

    for (const request of requests) {
      const candidates = this.getDevicesMatchingCriteria(request.criteria);
      if (candidates.length === 0) {
        const summary = this.formatCriteriaSummary(request.criteria);
        throw new ActionableError(
          `No devices match criteria for session ${request.sessionId}${summary}.\n` +
          `Ensure the required devices are already booted and available.`
        );
      }
    }

    const sortedRequests = [...requests].sort((a, b) => this.scoreCriteria(b.criteria) - this.scoreCriteria(a.criteria));
    let attemptCount = 0;

    while (assignments.size < requiredCount) {
      attemptCount++;
      const elapsed = this.timer.now() - startTime;

      if (elapsed > timeoutMs) {
        for (const deviceId of assignments.values()) {
          await this.releaseDevice(deviceId);
        }
        throw new ActionableError(
          `Timed out allocating devices after ${Math.round(elapsed / 1000)}s (${attemptCount} attempts).\n` +
          `Required: ${requiredCount} devices, allocated: ${assignments.size}\n` +
          `Suggestions:\n` +
          `  - Boot additional simulators or emulators that match the plan requirements\n` +
          `  - Reduce the number of devices required in the test plan\n` +
          `  - Increase device allocation timeout`
        );
      }

      let assignedThisRound = 0;

      for (const request of sortedRequests) {
        if (assignments.has(request.sessionId)) {
          continue;
        }

        const result = await this.tryAssignDeviceWithCriteria(request.sessionId, request.criteria);

        if (result.success) {
          assignments.set(request.sessionId, result.deviceId!);
          assignedThisRound++;
          logger.info(
            `[DevicePool] Allocated device ${result.deviceId} to session ${request.sessionId} ` +
            `(${assignments.size}/${requiredCount})`
          );
        } else if (!result.shouldWait) {
          for (const deviceId of assignments.values()) {
            await this.releaseDevice(deviceId);
          }
          const summary = this.formatCriteriaSummary(request.criteria);
          throw new ActionableError(
            `Failed to allocate device for session ${request.sessionId}${summary}.\n` +
            `No matching devices are currently available.\n` +
            `Suggestions:\n` +
            `  - Boot a simulator or emulator that matches the requested criteria\n` +
            `  - Wait for a device to become idle\n` +
            `  - Reduce parallel test count to match available devices`
          );
        }
      }

      if (assignments.size >= requiredCount) {
        break;
      }

      if (assignedThisRound === 0) {
        if (attemptCount === 1) {
          logger.info(`[DevicePool] Waiting for matching devices to become available...`);
        }
        await this.timer.sleep(this.DEVICE_WAIT_INTERVAL_MS);
      }
    }

    const totalElapsed = this.timer.now() - startTime;
    logger.info(
      `[DevicePool] Successfully allocated ${requiredCount} devices by criteria ` +
      `in ${totalElapsed}ms (${attemptCount} attempts)`
    );

    return assignments;
  }

  private async startAdditionalDevices(requiredCount: number, platform?: Platform): Promise<number> {
    if (!platform || requiredCount <= 0) {
      return 0;
    }
    if (platform === "ios") {
      logger.info("[DevicePool] Skipping auto-start for iOS simulators; only booted simulators are eligible.");
      return 0;
    }

    try {
      const availableImages = await this.deviceManager.listDeviceImages(platform);
      if (availableImages.length === 0) {
        return 0;
      }

      const bootedDevices = await this.deviceManager.getBootedDevices(platform);
      const bootedIds = new Set(bootedDevices.map(device => device.deviceId));
      const candidates: DeviceInfo[] = [];

      for (const image of availableImages) {
        if (image.deviceId && bootedIds.has(image.deviceId)) {
          continue;
        }
        const running = image.isRunning === true
          ? true
          : await this.deviceManager.isDeviceImageRunning(image);
        if (running) {
          continue;
        }
        candidates.push(image);
      }

      if (candidates.length === 0) {
        return 0;
      }

      const toStart = candidates.slice(0, requiredCount);
      let started = 0;

      for (const device of toStart) {
        const label = device.deviceId ?? device.name;
        logger.info(`[DevicePool] Starting additional ${device.platform} device ${label}`);
        await this.deviceManager.startDevice(device);
        const ready = await this.deviceManager.waitForDeviceReady(device);
        await this.addDevice(ready);
        started++;
      }

      return started;
    } catch (error) {
      logger.warn(`[DevicePool] Failed to start additional devices: ${error}`);
      return 0;
    }
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
  async assignDeviceToSession(sessionId: string, platform?: Platform): Promise<string> {
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
        const stats = this.getStatsForPlatform(platform);
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
      const result = await this.tryAssignDevice(sessionId, platform);

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
        const stats = this.getStatsForPlatform(platform);
        throw new ActionableError(
          `No devices in pool to assign to session ${sessionId}.\n` +
          `Device pool status:\n` +
          `  Total devices: ${stats.total}\n` +
          `  Idle: ${stats.idle}\n` +
          `  Assigned: ${stats.assigned}\n` +
          `  Error: ${stats.error}\n\n` +
          `Suggestions:\n` +
          `  - Start an emulator or connect a physical device\n` +
          `  - Check device pool status: auto-mobile --cli listDevices\n` +
          `  - Verify device tooling is working for the selected platform`
        );
      }
    }
  }

  /**
   * Try to assign a device to a session (single attempt)
   *
   * Returns success status and whether caller should wait and retry.
   */
  private async tryAssignDevice(sessionId: string, platform?: Platform): Promise<{
    success: boolean;
    deviceId?: string;
    shouldWait: boolean;
    totalDevices: number;
  }> {
    return await this.assignmentMutex.runExclusive(async () => {
      logger.info(`[DEVICE-POOL-DEBUG] tryAssignDevice: devices.size = ${this.devices.size}`);
      logger.info(`[DEVICE-POOL-DEBUG] tryAssignDevice: device IDs = ${Array.from(this.devices.keys()).join(", ")}`);

      let candidates = this.getDevicesByPlatform(platform);
      let totalDevices = candidates.length;

      // Find idle devices and prefer most recently released for reuse
      const idleDevices = candidates.filter(d => d.status === "idle");
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
      if (!device && (this.devices.size === 0 || totalDevices === 0)) {
        const refreshReason = this.devices.size === 0 ? "empty pool" : "platform pool empty";
        logger.info(`[DevicePool] Auto-refreshing devices due to ${refreshReason}...`);
        const addedCount = await this.refreshDevices();
        logger.info(`[DEVICE-POOL-DEBUG] Auto-refresh added ${addedCount} devices`);
        if (addedCount > 0) {
          // Try again after refresh
          candidates = this.getDevicesByPlatform(platform);
          totalDevices = candidates.length;
          device = candidates.find(d => d.status === "idle");
          logger.info(`[DEVICE-POOL-DEBUG] After refresh, found idle device = ${device?.id || "none"}`);
        }
      }

      logger.info(`[DEVICE-POOL-DEBUG] tryAssignDevice: totalDevices = ${totalDevices}`);

      if (!device) {
        // No idle device - check if devices exist but are busy
        const busyDevices = candidates.filter(
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
      await this.sessionManager.createSession(sessionId, device.id, device.platform);

      logger.info(`Assigned device ${device.id} to session ${sessionId}`);

      return {
        success: true,
        deviceId: device.id,
        shouldWait: false,
        totalDevices,
      };
    });
  }

  private async tryAssignDeviceWithCriteria(
    sessionId: string,
    criteria?: DeviceAllocationCriteria
  ): Promise<{
    success: boolean;
    deviceId?: string;
    shouldWait: boolean;
    totalDevices: number;
  }> {
    return await this.assignmentMutex.runExclusive(async () => {
      let candidates = this.getDevicesMatchingCriteria(criteria);
      let totalDevices = candidates.length;

      const idleDevices = candidates.filter(d => d.status === "idle");
      let device: PooledDevice | undefined;

      if (idleDevices.length > 0) {
        if (this.lastReleasedDeviceId) {
          device = idleDevices.find(d => d.id === this.lastReleasedDeviceId);
        }
        if (!device) {
          device = idleDevices[0];
        }
      }

      if (!device && (this.devices.size === 0 || totalDevices === 0)) {
        const refreshReason = this.devices.size === 0 ? "empty pool" : "criteria pool empty";
        logger.info(`[DevicePool] Auto-refreshing devices due to ${refreshReason}...`);
        const addedCount = await this.refreshDevices();
        logger.info(`[DevicePool] Auto-refresh added ${addedCount} devices`);
        if (addedCount > 0) {
          candidates = this.getDevicesMatchingCriteria(criteria);
          totalDevices = candidates.length;
          device = candidates.find(d => d.status === "idle");
        }
      }

      if (!device) {
        const busyDevices = candidates.filter(d => d.status === "busy").length;
        return {
          success: false,
          shouldWait: busyDevices > 0,
          totalDevices,
        };
      }

      device.sessionId = sessionId;
      device.status = "busy";
      device.lastUsedAt = this.nextLastUsedAt();
      device.assignmentCount++;
      device.errorCount = 0;

      await this.sessionManager.createSession(sessionId, device.id, device.platform);

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

  private normalizeCriteriaValue(value?: string): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.toLowerCase() : undefined;
  }

  private getDevicesMatchingCriteria(criteria?: DeviceAllocationCriteria): PooledDevice[] {
    const normalizedType = this.normalizeCriteriaValue(criteria?.simulatorType);
    const normalizedVersion = this.normalizeCriteriaValue(criteria?.iosVersion);

    return this.getDevicesByPlatform(criteria?.platform).filter(device => {
      if (normalizedType) {
        const deviceType = this.normalizeCriteriaValue(device.name);
        if (deviceType !== normalizedType) {
          return false;
        }
      }

      if (normalizedVersion) {
        const deviceVersion = this.normalizeCriteriaValue(device.iosVersion);
        if (deviceVersion !== normalizedVersion) {
          return false;
        }
      }

      return true;
    });
  }

  private scoreCriteria(criteria?: DeviceAllocationCriteria): number {
    if (!criteria) {
      return 0;
    }
    let score = 0;
    if (criteria.platform) {
      score += 1;
    }
    if (criteria.simulatorType) {
      score += 1;
    }
    if (criteria.iosVersion) {
      score += 1;
    }
    return score;
  }

  private formatCriteriaSummary(criteria?: DeviceAllocationCriteria): string {
    if (!criteria) {
      return "";
    }
    const parts: string[] = [];
    if (criteria.platform) {
      parts.push(`platform=${criteria.platform}`);
    }
    if (criteria.simulatorType) {
      parts.push(`simulatorType=${criteria.simulatorType}`);
    }
    if (criteria.iosVersion) {
      parts.push(`iosVersion=${criteria.iosVersion}`);
    }
    return parts.length > 0 ? ` (${parts.join(", ")})` : "";
  }

  private getDevicesByPlatform(platform?: Platform): PooledDevice[] {
    if (!platform) {
      return this.getAllDevices();
    }
    return Array.from(this.devices.values()).filter(device => device.platform === platform);
  }

  private getStatsForPlatform(platform?: Platform): {
    total: number;
    idle: number;
    assigned: number;
    error: number;
  } {
    const devices = this.getDevicesByPlatform(platform);
    const idle = devices.filter(device => device.status === "idle").length;
    const assigned = devices.filter(device => device.status === "busy").length;
    const error = devices.filter(device => device.status === "error").length;

    return {
      total: devices.length,
      idle,
      assigned,
      error,
    };
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

  /**
   * Set session tracking for a device in the installed apps cache
   */
  private async setDeviceSessionTracking(deviceId: string, sessionStart: number): Promise<void> {
    try {
      await this.installedAppsRepository.setSessionTracking(this.daemonSessionId, deviceId, sessionStart);
    } catch (error) {
      logger.warn(`Failed to set session tracking for device ${deviceId}: ${error}`);
    }
  }

  /**
   * Clear installed apps cache for a device session
   */
  private async clearDeviceSessionCache(deviceId: string): Promise<void> {
    try {
      await this.installedAppsRepository.clearDeviceSession(deviceId);
      logger.info(`[DevicePool] Cleared installed apps cache for device ${deviceId}`);
    } catch (error) {
      logger.warn(`Failed to clear device session cache for ${deviceId}: ${error}`);
    }
  }
}
