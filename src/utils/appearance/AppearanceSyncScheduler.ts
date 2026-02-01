import type { AppearanceMode, BootedDevice } from "../../models";
import { DaemonState } from "../../daemon/daemonState";
import { DeviceSessionManager } from "../DeviceSessionManager";
import { applyAppearanceToDevice } from "../deviceAppearance";
import { logger } from "../logger";
import { getAppearanceConfig, resolveAppearanceMode } from "../../server/appearanceManager";
import { Timer, defaultTimer } from "../SystemTimer";

const DEFAULT_SYNC_INTERVAL_MS = 10000;

class AppearanceSyncScheduler {
  private intervalHandle: NodeJS.Timeout | null = null;
  private lastAppliedModes = new Map<string, AppearanceMode>();
  private pending: Promise<void> | null = null;
  private readonly timer: Timer;

  constructor(timer: Timer = defaultTimer) {
    this.timer = timer;
  }

  start(): void {
    if (this.intervalHandle) {
      return;
    }

    this.intervalHandle = this.timer.setInterval(() => {
      void this.trigger();
    }, DEFAULT_SYNC_INTERVAL_MS);

    void this.trigger();
  }

  stop(): void {
    if (this.intervalHandle) {
      this.timer.clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.pending = null;
    this.lastAppliedModes.clear();
  }

  async trigger(): Promise<void> {
    if (this.pending) {
      return this.pending;
    }

    this.pending = this.tick().finally(() => {
      this.pending = null;
    });

    return this.pending;
  }

  private async tick(): Promise<void> {
    const config = await getAppearanceConfig();
    if (!config.syncWithHost) {
      this.lastAppliedModes.clear();
      return;
    }

    const mode = await resolveAppearanceMode(config);
    const targets = this.getSyncTargets();
    if (targets.length === 0) {
      return;
    }

    for (const device of targets) {
      if (this.lastAppliedModes.get(device.deviceId) === mode) {
        continue;
      }
      try {
        await applyAppearanceToDevice(device, mode);
        this.lastAppliedModes.set(device.deviceId, mode);
      } catch (error) {
        logger.warn(`[Appearance] Failed to apply host sync mode to ${device.deviceId}: ${error}`);
      }
    }
  }

  private getSyncTargets(): BootedDevice[] {
    const daemonState = DaemonState.getInstance();
    if (daemonState.isInitialized()) {
      const pool = daemonState.getDevicePool();
      const pooledDevices = pool.getAllDevices();
      if (pooledDevices.length > 0) {
        // Only return Android devices - appearance sync via ADB only works for Android
        return pooledDevices
          .filter(device => device.platform === "android")
          .map(device => ({
            deviceId: device.id,
            name: device.id,
            platform: device.platform,
          }));
      }
    }

    const current = DeviceSessionManager.getInstance().getCurrentDevice();
    // Only return if it's an Android device
    return current && current.platform === "android" ? [current] : [];
  }
}

const scheduler = new AppearanceSyncScheduler();

export function startAppearanceSyncScheduler(): void {
  scheduler.start();
}

export function stopAppearanceSyncScheduler(): void {
  scheduler.stop();
}

export async function triggerAppearanceSync(): Promise<void> {
  await scheduler.trigger();
}
