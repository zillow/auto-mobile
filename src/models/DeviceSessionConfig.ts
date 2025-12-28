export interface DeviceConfig {
  platform: "android" | "ios";
  deviceId: string;
  exploration?: {
    deepLinkSkipping: boolean,
  },
  activeMode: "exploration";
}
