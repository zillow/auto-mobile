import type { DeviceSnapshotConfig, DeviceSnapshotConfigInput } from "../models";

export type DeviceSnapshotSocketMethod = "config/get" | "config/set";

export interface DeviceSnapshotSocketRequest {
  id: string;
  type: "device_snapshot_request";
  method: DeviceSnapshotSocketMethod;
  params?: {
    config?: DeviceSnapshotConfigInput | null;
  };
}

export interface DeviceSnapshotSocketResponse {
  id: string;
  type: "device_snapshot_response";
  success: boolean;
  result?: {
    config: DeviceSnapshotConfig;
    evictedSnapshotNames?: string[];
  };
  error?: string;
}
