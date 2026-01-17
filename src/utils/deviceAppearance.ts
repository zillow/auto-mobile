import type { AppearanceMode, BootedDevice } from "../models";
import { AdbClient } from "./android-cmdline-tools/AdbClient";
import { SimCtlClient } from "./ios-cmdline-tools/SimCtlClient";
import { logger } from "./logger";

export async function applyAppearanceToDevice(
  device: BootedDevice,
  mode: AppearanceMode
): Promise<void> {
  if (device.platform === "android") {
    const adb = new AdbClient(device);
    const setting = mode === "dark" ? "yes" : "no";
    await adb.executeCommand(`shell cmd uimode night ${setting}`);
    logger.info(`[Appearance] Set Android appearance to ${mode} for ${device.deviceId}`);
    return;
  }

  if (device.platform === "ios") {
    const simctl = new SimCtlClient(device);
    await simctl.setAppearance(mode);
    logger.info(`[Appearance] Set iOS appearance to ${mode} for ${device.deviceId}`);
  }
}
