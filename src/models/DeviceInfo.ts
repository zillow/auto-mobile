import { Platform } from "./Platform";

export interface DeviceInfo {
  name: string;
  platform: Platform;
  isRunning: boolean;
  deviceId?: string;
  source?: "local";
}

export interface BootedDevice {
  name: string;
  platform: Platform;
  deviceId: string;
  source?: "local";
}
