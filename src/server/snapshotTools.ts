import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { createJSONToolResponse } from "../utils/toolUtils";
import { ActionableError, BootedDevice } from "../models";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import { captureDeviceSnapshot, restoreDeviceSnapshot } from "./deviceSnapshotManager";

export const deviceSnapshotSchema = addDeviceTargetingToSchema(z.object({
  action: z.enum(["capture", "restore"]).describe("Action to perform"),
  snapshotName: z.string().optional().describe("Name for the snapshot"),
  includeAppData: z.boolean().optional().describe("Include app data directories in snapshot"),
  includeSettings: z.boolean().optional().describe("Include system settings in snapshot"),
  useVmSnapshot: z.boolean().optional().describe("Use emulator VM snapshot if available (faster, emulator only)"),
  strictBackupMode: z.boolean().optional().describe("If true, fail entire snapshot if app data backup fails or times out"),
  backupTimeoutMs: z.number().optional().describe("Timeout in milliseconds for adb backup user confirmation"),
  userApps: z.enum(["current", "all"]).optional()
    .describe("Which apps to backup: 'current' (foreground app only) or 'all' (all user-installed apps)"),
  vmSnapshotTimeoutMs: z.number().optional().describe("Timeout in milliseconds for emulator VM snapshot commands"),
  appBundleIds: z.array(z.string()).optional()
    .describe("iOS-only: bundle IDs to include in app data snapshots (omit to skip app data capture)"),
})).superRefine((value, ctx) => {
  if (value.action === "restore" && !value.snapshotName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["snapshotName"],
      message: "snapshotName is required when action is restore",
    });
  }
});

export type DeviceSnapshotToolArgs = z.infer<typeof deviceSnapshotSchema>;

export function registerSnapshotTools() {
  const deviceSnapshotHandler = async (device: BootedDevice, args: DeviceSnapshotToolArgs) => {
    try {
      if (args.action === "capture") {
        const { result, evictedSnapshotNames } = await captureDeviceSnapshot(device, args);

        return createJSONToolResponse({
          message: `Snapshot '${result.snapshotName}' captured successfully`,
          snapshotName: result.snapshotName,
          snapshotType: result.snapshotType,
          timestamp: result.timestamp,
          deviceId: device.deviceId,
          deviceName: device.name,
          manifest: result.manifest,
          evictedSnapshotNames: evictedSnapshotNames.length > 0 ? evictedSnapshotNames : undefined,
        });
      }

      if (args.action === "restore") {
        if (!args.snapshotName) {
          throw new ActionableError("snapshotName is required when action is restore");
        }
        const { result } = await restoreDeviceSnapshot(device, {
          snapshotName: args.snapshotName,
          useVmSnapshot: args.useVmSnapshot,
          vmSnapshotTimeoutMs: args.vmSnapshotTimeoutMs,
        });

        return createJSONToolResponse({
          message: `Snapshot '${args.snapshotName}' restored successfully`,
          snapshotName: args.snapshotName,
          snapshotType: result.snapshotType,
          restoredAt: result.restoredAt,
          deviceId: device.deviceId,
          deviceName: device.name,
        });
      }

      throw new ActionableError(`Unsupported deviceSnapshot action: ${args.action}`);
    } catch (error) {
      throw new ActionableError(`Failed to ${args.action} snapshot: ${error}`);
    }
  };

  ToolRegistry.registerDeviceAware(
    "deviceSnapshot",
    "Capture or restore a device snapshot for the active device.",
    deviceSnapshotSchema,
    deviceSnapshotHandler
  );
}
