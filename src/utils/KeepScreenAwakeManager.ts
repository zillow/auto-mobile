import { BootedDevice } from "../models";
import { AdbClientFactory, defaultAdbClientFactory } from "./android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "./android-cmdline-tools/interfaces/AdbExecutor";
import { logger } from "./logger";

export const KEEP_SCREEN_AWAKE_STATE_KEY = "keepScreenAwakeState";

export type KeepScreenAwakeState = {
  applied: boolean;
  method?: "svc" | "settings";
  skipReason?: "disabled" | "emulator" | "unsupported" | "detection_failed" | "failed";
  svcWasEnabled?: boolean;
  originalStayOnWhilePluggedIn?: string | null;
  originalScreenOffTimeout?: string | null;
  appliedSettings?: {
    stayOnWhilePluggedIn: boolean;
    screenOffTimeout: boolean;
  };
};

type DeviceType = "emulator" | "physical" | "unknown";

const STAY_ON_WHILE_PLUGGED_IN_MASK = "7";
const MAX_SCREEN_OFF_TIMEOUT_MS = "2147483647";

export class KeepScreenAwakeManager {
  private device: BootedDevice;
  private adb: AdbExecutor;

  constructor(device: BootedDevice, adbFactory: AdbClientFactory = defaultAdbClientFactory) {
    this.device = device;
    this.adb = adbFactory.create(device);
  }

  async apply(keepScreenAwake: boolean): Promise<KeepScreenAwakeState> {
    if (!keepScreenAwake) {
      return { applied: false, skipReason: "disabled" };
    }

    if (this.device.platform !== "android") {
      return { applied: false, skipReason: "unsupported" };
    }

    const deviceType = await this.detectDeviceType();
    if (deviceType === "emulator") {
      return { applied: false, skipReason: "emulator" };
    }
    if (deviceType === "unknown") {
      logger.warn(`[KeepScreenAwake] Unable to detect device type for ${this.device.deviceId}; skipping keep-awake`);
      return { applied: false, skipReason: "detection_failed" };
    }

    await this.wakeDevice();

    const svcState = await this.readSvcStayonState();
    if (await this.tryEnableSvcStayon()) {
      return {
        applied: true,
        method: "svc",
        svcWasEnabled: svcState.enabled,
        originalStayOnWhilePluggedIn: svcState.value
      };
    }

    const settingsResult = await this.applySettingsFallback();
    if (!settingsResult.applied) {
      logger.warn(`[KeepScreenAwake] Failed to keep screen awake on ${this.device.deviceId}`);
      return { applied: false, skipReason: "failed" };
    }

    return {
      applied: true,
      method: "settings",
      originalStayOnWhilePluggedIn: settingsResult.originalStayOnWhilePluggedIn,
      originalScreenOffTimeout: settingsResult.originalScreenOffTimeout,
      appliedSettings: settingsResult.appliedSettings
    };
  }

  async restore(state: KeepScreenAwakeState): Promise<void> {
    if (!state.applied || this.device.platform !== "android") {
      return;
    }

    if (state.method === "svc") {
      if (state.originalStayOnWhilePluggedIn !== undefined) {
        const originalEnabled = this.parseStayOnWhilePluggedIn(state.originalStayOnWhilePluggedIn);
        const restored = await this.restoreSetting(
          "global",
          "stay_on_while_plugged_in",
          state.originalStayOnWhilePluggedIn
        );
        if (restored) {
          return;
        }
        if (originalEnabled !== false) {
          if (originalEnabled === undefined) {
            logger.warn(`[KeepScreenAwake] Skipping svc stayon restore on ${this.device.deviceId}: prior state unknown`);
          }
          return;
        }
        try {
          await this.adb.executeCommand("shell svc power stayon false");
        } catch (error) {
          logger.warn(`[KeepScreenAwake] Failed to disable svc stayon on ${this.device.deviceId}: ${error}`);
        }
        return;
      }
      if (state.svcWasEnabled === undefined) {
        logger.warn(`[KeepScreenAwake] Skipping svc stayon restore on ${this.device.deviceId}: prior state unknown`);
        return;
      }
      if (state.svcWasEnabled) {
        return;
      }
      try {
        await this.adb.executeCommand("shell svc power stayon false");
      } catch (error) {
        logger.warn(`[KeepScreenAwake] Failed to disable svc stayon on ${this.device.deviceId}: ${error}`);
      }
      return;
    }

    if (state.method !== "settings" || !state.appliedSettings) {
      return;
    }

    if (state.appliedSettings.stayOnWhilePluggedIn) {
      await this.restoreSetting(
        "global",
        "stay_on_while_plugged_in",
        state.originalStayOnWhilePluggedIn
      );
    }

    if (state.appliedSettings.screenOffTimeout) {
      await this.restoreSetting(
        "system",
        "screen_off_timeout",
        state.originalScreenOffTimeout
      );
    }
  }

  private async detectDeviceType(): Promise<DeviceType> {
    if (this.device.deviceId.startsWith("emulator-")) {
      return "emulator";
    }

    try {
      const result = await this.adb.executeCommand(
        "shell getprop ro.kernel.qemu",
        undefined,
        undefined,
        true
      );
      const trimmed = result.stdout.trim();
      if (trimmed === "1") {
        return "emulator";
      }
      if (trimmed === "0" || trimmed === "") {
        return "physical";
      }
      logger.warn(
        `[KeepScreenAwake] Unexpected ro.kernel.qemu value "${trimmed}" on ${this.device.deviceId}`
      );
      return "unknown";
    } catch (error) {
      logger.warn(`[KeepScreenAwake] Failed to read ro.kernel.qemu on ${this.device.deviceId}: ${error}`);
      return "unknown";
    }
  }

  private async wakeDevice(): Promise<void> {
    try {
      await this.adb.executeCommand("shell input keyevent KEYCODE_WAKEUP");
    } catch (error) {
      logger.warn(`[KeepScreenAwake] Failed to wake ${this.device.deviceId}: ${error}`);
    }
  }

  private async tryEnableSvcStayon(): Promise<boolean> {
    try {
      await this.adb.executeCommand("shell svc power stayon true");
      return true;
    } catch (error) {
      logger.info(`[KeepScreenAwake] svc power stayon failed on ${this.device.deviceId}, falling back: ${error}`);
      return false;
    }
  }

  private async applySettingsFallback(): Promise<{
    applied: boolean;
    originalStayOnWhilePluggedIn?: string | null;
    originalScreenOffTimeout?: string | null;
    appliedSettings: {
      stayOnWhilePluggedIn: boolean;
      screenOffTimeout: boolean;
    };
  }> {
    const originalStayOnWhilePluggedIn = await this.readSetting("global", "stay_on_while_plugged_in");
    const originalScreenOffTimeout = await this.readSetting("system", "screen_off_timeout");
    const appliedSettings = {
      stayOnWhilePluggedIn: false,
      screenOffTimeout: false
    };

    try {
      await this.adb.executeCommand(
        `shell settings put global stay_on_while_plugged_in ${STAY_ON_WHILE_PLUGGED_IN_MASK}`
      );
      appliedSettings.stayOnWhilePluggedIn = true;
    } catch (error) {
      logger.warn(`[KeepScreenAwake] Failed to set stay_on_while_plugged_in on ${this.device.deviceId}: ${error}`);
    }

    try {
      await this.adb.executeCommand(
        `shell settings put system screen_off_timeout ${MAX_SCREEN_OFF_TIMEOUT_MS}`
      );
      appliedSettings.screenOffTimeout = true;
    } catch (error) {
      logger.warn(`[KeepScreenAwake] Failed to set screen_off_timeout on ${this.device.deviceId}: ${error}`);
    }

    return {
      applied: appliedSettings.stayOnWhilePluggedIn || appliedSettings.screenOffTimeout,
      originalStayOnWhilePluggedIn,
      originalScreenOffTimeout,
      appliedSettings
    };
  }

  private async readSvcStayonState(): Promise<{
    value: string | null | undefined;
    enabled: boolean | undefined;
  }> {
    const value = await this.readSetting("global", "stay_on_while_plugged_in");
    return {
      value,
      enabled: this.parseStayOnWhilePluggedIn(value)
    };
  }

  private parseStayOnWhilePluggedIn(value?: string | null): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
    const parsed = Number.parseInt(normalized, 10);
    if (Number.isNaN(parsed)) {
      return undefined;
    }
    return parsed !== 0;
  }

  private async readSetting(
    scope: "global" | "system",
    key: string
  ): Promise<string | null | undefined> {
    try {
      const result = await this.adb.executeCommand(`shell settings get ${scope} ${key}`, undefined, undefined, true);
      const trimmed = result.stdout.trim();
      if (!trimmed || trimmed === "null") {
        return null;
      }
      return trimmed;
    } catch (error) {
      logger.warn(`[KeepScreenAwake] Failed to read ${scope} ${key} on ${this.device.deviceId}: ${error}`);
      return undefined;
    }
  }

  private async restoreSetting(
    scope: "global" | "system",
    key: string,
    originalValue?: string | null
  ): Promise<boolean> {
    if (originalValue === undefined) {
      logger.warn(`[KeepScreenAwake] Missing original ${scope} ${key} for ${this.device.deviceId}; skipping restore`);
      return false;
    }

    const command = originalValue === null
      ? `shell settings delete ${scope} ${key}`
      : `shell settings put ${scope} ${key} ${originalValue}`;

    try {
      await this.adb.executeCommand(command);
      return true;
    } catch (error) {
      logger.warn(`[KeepScreenAwake] Failed to restore ${scope} ${key} on ${this.device.deviceId}: ${error}`);
      return false;
    }
  }
}
