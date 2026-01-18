import { Platform } from "./Platform";

export interface DeviceInfo {
  name: string;
  platform: Platform;
  isRunning: boolean;
  deviceId?: string;
  source?: "local";
  // iOS-only metadata (optional)
  state?: string;
  iosVersion?: string;
  deviceType?: string;
}

export interface BootedDevice {
  name: string;
  platform: Platform;
  deviceId: string;
  source?: "local";
  iosVersion?: string;
}
