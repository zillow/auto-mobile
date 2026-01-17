import type { AppearanceMode, BootedDevice } from "../../models";
import { getAppearanceConfig, resolveAppearanceMode } from "../../server/appearanceManager";
import { applyAppearanceToDevice } from "../deviceAppearance";
import { logger } from "../logger";

export async function applyAppearanceOnConnect(
  device: BootedDevice
): Promise<AppearanceMode | null> {
  try {
    const config = await getAppearanceConfig();
    if (!config.applyOnConnect) {
      return null;
    }

    const mode = await resolveAppearanceMode(config);
    await applyAppearanceToDevice(device, mode);
    return mode;
  } catch (error) {
    logger.warn(`[Appearance] Failed to apply appearance on connect: ${error}`);
    return null;
  }
}
