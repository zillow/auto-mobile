export type DeviceSnapshotType = "vm" | "adb";

export interface DeviceSnapshotManifest {
  snapshotName: string;
  timestamp: string;
  deviceId: string;
  deviceName: string;
  platform: "android" | "ios";
  snapshotType: DeviceSnapshotType;
  includeAppData: boolean;
  includeSettings: boolean;
  packages?: string[];
  foregroundApp?: string;
  settings?: {
    global?: Record<string, string>;
    secure?: Record<string, string>;
    system?: Record<string, string>;
  };
  appDataBackup?: {
    backupFile?: string;
    backedUpPackages?: string[];
    skippedPackages?: string[];
    failedPackages?: string[];
    totalPackages?: number;
    backupTimedOut?: boolean;
    backupMethod?: "adb_backup" | "root_pull" | "none";
  };
}

export interface DeviceSnapshotConfig {
  includeAppData: boolean;
  includeSettings: boolean;
  useVmSnapshot: boolean;
  strictBackupMode: boolean;
  backupTimeoutMs: number;
  userApps: "current" | "all";
  vmSnapshotTimeoutMs: number;
  maxArchiveSizeMb: number;
}

export interface DeviceSnapshotConfigInput {
  includeAppData?: boolean | string;
  includeSettings?: boolean | string;
  useVmSnapshot?: boolean | string;
  strictBackupMode?: boolean | string;
  backupTimeoutMs?: number | string;
  userApps?: "current" | "all" | string;
  vmSnapshotTimeoutMs?: number | string;
  maxArchiveSizeMb?: number | string;
}

export interface DeviceSnapshotMetadata {
  snapshotName: string;
  deviceId: string;
  deviceName: string;
  platform: "android" | "ios";
  snapshotType: DeviceSnapshotType;
  includeAppData: boolean;
  includeSettings: boolean;
  createdAt: string;
  lastAccessedAt: string;
  sizeBytes: number;
  manifest: DeviceSnapshotManifest;
}
