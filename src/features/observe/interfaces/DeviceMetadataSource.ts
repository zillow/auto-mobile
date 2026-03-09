/**
 * Device metadata available from the CtrlProxy accessibility service,
 * eliminating the need for individual ADB shell commands.
 */
export interface DeviceMetadata {
  screenWidth: number;
  screenHeight: number;
  density: number;
  rotation: number;
  sdkInt: number;
  deviceModel: string;
  isEmulator: boolean;
  wakefulness: "Awake" | "Asleep" | "Dozing";
  foregroundActivity?: string;
}

/**
 * Source for device metadata. Can be backed by CtrlProxy WebSocket
 * or fall back to ADB shell commands.
 */
export interface DeviceMetadataSource {
  /**
   * Get device metadata from the on-device service.
   * @returns Device metadata or null if the service is unavailable.
   */
  getDeviceMetadata(signal?: AbortSignal): Promise<DeviceMetadata | null>;
}
