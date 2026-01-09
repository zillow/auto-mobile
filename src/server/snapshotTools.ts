import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { createJSONToolResponse } from "../utils/toolUtils";
import { ActionableError, BootedDevice } from "../models";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import { CaptureSnapshot } from "../features/action/CaptureSnapshot";
import { RestoreSnapshot } from "../features/action/RestoreSnapshot";
import { SnapshotStorage } from "../utils/snapshotStorage";

// Schema definitions
export const captureDeviceSnapshotSchema = addDeviceTargetingToSchema(z.object({
  snapshotName: z.string().optional().describe("Name for the snapshot (auto-generated if not provided)"),
  includeAppData: z.boolean().optional().default(true).describe("Include app data directories in snapshot"),
  includeSettings: z.boolean().optional().default(true).describe("Include system settings in snapshot"),
  useVmSnapshot: z.boolean().optional().default(true).describe("Use emulator VM snapshot if available (faster, emulator only)"),
  strictBackupMode: z.boolean().optional().default(false).describe("If true, fail entire snapshot if app data backup fails or times out"),
  backupTimeout: z.number().optional().default(30000).describe("Timeout in milliseconds for adb backup user confirmation (default: 30000ms)"),
  userApps: z.enum(["current", "all"]).optional().default("current").describe("Which apps to backup: 'current' (foreground app only) or 'all' (all user-installed apps)")
}));

export const restoreDeviceSnapshotSchema = addDeviceTargetingToSchema(z.object({
  snapshotName: z.string().describe("Name of the snapshot to restore"),
  useVmSnapshot: z.boolean().optional().default(true).describe("Use emulator VM snapshot if available (faster, emulator only)")
}));

export const listSnapshotsSchema = addDeviceTargetingToSchema(z.object({
  deviceId: z.string().optional().describe("Filter snapshots by device ID")
}));

export const deleteSnapshotSchema = addDeviceTargetingToSchema(z.object({
  snapshotName: z.string().describe("Name of the snapshot to delete")
}));

// Export interfaces for type safety
export interface CaptureSnapshotArgs {
  snapshotName?: string;
  includeAppData?: boolean;
  includeSettings?: boolean;
  useVmSnapshot?: boolean;
  strictBackupMode?: boolean;
  backupTimeout?: number;
  userApps?: "current" | "all";
}

export interface RestoreSnapshotArgs {
  snapshotName: string;
  useVmSnapshot?: boolean;
}

export interface ListSnapshotsArgs {
  deviceId?: string;
}

export interface DeleteSnapshotArgs {
  snapshotName: string;
}

export function registerSnapshotTools() {
  // Capture device snapshot handler
  const captureSnapshotHandler = async (device: BootedDevice, args: CaptureSnapshotArgs) => {
    try {
      const captureSnapshot = new CaptureSnapshot(device);
      const result = await captureSnapshot.execute(args);

      return createJSONToolResponse({
        message: `Snapshot '${result.snapshotName}' captured successfully`,
        snapshotName: result.snapshotName,
        snapshotType: result.snapshotType,
        timestamp: result.timestamp,
        deviceId: device.deviceId,
        deviceName: device.name,
        manifest: result.manifest
      });
    } catch (error) {
      throw new ActionableError(`Failed to capture snapshot: ${error}`);
    }
  };

  // Restore device snapshot handler
  const restoreSnapshotHandler = async (device: BootedDevice, args: RestoreSnapshotArgs) => {
    try {
      const restoreSnapshot = new RestoreSnapshot(device);
      const result = await restoreSnapshot.execute(args);

      return createJSONToolResponse({
        message: `Snapshot '${args.snapshotName}' restored successfully`,
        snapshotName: args.snapshotName,
        snapshotType: result.snapshotType,
        restoredAt: result.restoredAt,
        deviceId: device.deviceId,
        deviceName: device.name
      });
    } catch (error) {
      throw new ActionableError(`Failed to restore snapshot: ${error}`);
    }
  };

  // List snapshots handler
  const listSnapshotsHandler = async (device: BootedDevice, args: ListSnapshotsArgs) => {
    try {
      const storage = new SnapshotStorage();
      const snapshots = await storage.listSnapshots(args.deviceId || device.deviceId);

      return createJSONToolResponse({
        message: `Found ${snapshots.length} snapshot(s)`,
        snapshots,
        count: snapshots.length,
        deviceId: args.deviceId || device.deviceId
      });
    } catch (error) {
      throw new ActionableError(`Failed to list snapshots: ${error}`);
    }
  };

  // Delete snapshot handler
  const deleteSnapshotHandler = async (device: BootedDevice, args: DeleteSnapshotArgs) => {
    try {
      const storage = new SnapshotStorage();
      await storage.deleteSnapshot(args.snapshotName);

      return createJSONToolResponse({
        message: `Snapshot '${args.snapshotName}' deleted successfully`,
        snapshotName: args.snapshotName
      });
    } catch (error) {
      throw new ActionableError(`Failed to delete snapshot: ${error}`);
    }
  };

  // Register with the tool registry
  ToolRegistry.registerDeviceAware(
    "captureDeviceSnapshot",
    "Capture current device state as a snapshot for later restoration. Supports both VM snapshots (emulators) and ADB-based capture (all devices).",
    captureDeviceSnapshotSchema,
    captureSnapshotHandler
  );

  ToolRegistry.registerDeviceAware(
    "restoreDeviceSnapshot",
    "Restore device to a previously captured snapshot state. Clears current state and restores apps, settings, and data.",
    restoreDeviceSnapshotSchema,
    restoreSnapshotHandler
  );

  ToolRegistry.registerDeviceAware(
    "listSnapshots",
    "List all available snapshots for a device",
    listSnapshotsSchema,
    listSnapshotsHandler
  );

  ToolRegistry.registerDeviceAware(
    "deleteSnapshot",
    "Delete a snapshot permanently",
    deleteSnapshotSchema,
    deleteSnapshotHandler
  );
}
