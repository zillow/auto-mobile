import type { DeviceSnapshotConfig, DeviceSnapshotConfigInput } from "../../models";

export const DEFAULT_DEVICE_SNAPSHOT_CONFIG: DeviceSnapshotConfig = {
  includeAppData: true,
  includeSettings: true,
  useVmSnapshot: true,
  strictBackupMode: false,
  backupTimeoutMs: 30000,
  userApps: "current",
  vmSnapshotTimeoutMs: 30000,
  maxArchiveSizeMb: 100,
};

const USER_APPS_VALUES = new Set(["current", "all"]);

function parseBoolean(value: boolean | string | undefined, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return fallback;
}

function parsePositiveNumber(
  value: number | string | undefined,
  fallback: number,
  allowFloat: boolean
): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return allowFloat ? parsed : Math.round(parsed);
}

function parseUserApps(value: string | undefined, fallback: "current" | "all"): "current" | "all" {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (USER_APPS_VALUES.has(normalized)) {
    return normalized as "current" | "all";
  }
  return fallback;
}

export function parseDeviceSnapshotConfig(
  input: DeviceSnapshotConfigInput | null | undefined
): DeviceSnapshotConfig {
  const safeInput: DeviceSnapshotConfigInput =
    input && typeof input === "object" ? input : {};

  return {
    includeAppData: parseBoolean(
      safeInput.includeAppData,
      DEFAULT_DEVICE_SNAPSHOT_CONFIG.includeAppData
    ),
    includeSettings: parseBoolean(
      safeInput.includeSettings,
      DEFAULT_DEVICE_SNAPSHOT_CONFIG.includeSettings
    ),
    useVmSnapshot: parseBoolean(
      safeInput.useVmSnapshot,
      DEFAULT_DEVICE_SNAPSHOT_CONFIG.useVmSnapshot
    ),
    strictBackupMode: parseBoolean(
      safeInput.strictBackupMode,
      DEFAULT_DEVICE_SNAPSHOT_CONFIG.strictBackupMode
    ),
    backupTimeoutMs: parsePositiveNumber(
      safeInput.backupTimeoutMs,
      DEFAULT_DEVICE_SNAPSHOT_CONFIG.backupTimeoutMs,
      false
    ),
    userApps: parseUserApps(
      typeof safeInput.userApps === "string" ? safeInput.userApps : undefined,
      DEFAULT_DEVICE_SNAPSHOT_CONFIG.userApps
    ),
    vmSnapshotTimeoutMs: parsePositiveNumber(
      safeInput.vmSnapshotTimeoutMs,
      DEFAULT_DEVICE_SNAPSHOT_CONFIG.vmSnapshotTimeoutMs,
      false
    ),
    maxArchiveSizeMb: parsePositiveNumber(
      safeInput.maxArchiveSizeMb,
      DEFAULT_DEVICE_SNAPSHOT_CONFIG.maxArchiveSizeMb,
      true
    ),
  };
}
