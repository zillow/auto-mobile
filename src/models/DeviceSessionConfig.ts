export interface DeviceConfig {
  platform: "android" | "ios";
  deviceId: string;
  exploration?: {
    deepLinkSkipping: boolean,
  },
  testAuthoring?: {
    appId: string
    description: string,
    persist: "never" | "devicePresent" | "always"
  },
  activeMode: "exploration" | "testAuthoring";
}
