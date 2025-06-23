import { z } from "zod";
import { ToolRegistry, ProgressCallback } from "./toolRegistry";
import { ActionableError } from "../models/ActionableError";
import { EmulatorUtils } from "../utils/emulator";
import { AdbUtils } from "../utils/adb";
import { createJSONToolResponse } from "../utils/toolUtils";
import { logger } from "../utils/logger";

// Schema definitions
export const listAvdsSchema = z.object({
  // No parameters needed for listing AVDs
});

export const listDevicesSchema = z.object({
  // No parameters needed for listing devices
});

export const startEmulatorSchema = z.object({
  avdName: z.string().describe("The AVD name to start"),
  timeoutMs: z.number().optional().default(120000).describe("Maximum time to wait for emulator to be ready in milliseconds")
});

export const killEmulatorSchema = z.object({
  avdName: z.string().describe("The AVD name to kill")
});

export const checkEmulatorSchema = z.object({
  avdName: z.string().optional().describe("Specific AVD name to check (if not provided, checks all running emulators)")
});

// Export interfaces for type safety
export interface StartEmulatorArgs {
  avdName: string;
  timeoutMs?: number;
}

export interface KillEmulatorArgs {
  avdName: string;
}

export interface CheckEmulatorArgs {
  avdName?: string;
}

// Register emulator tools
export function registerEmulatorTools() {
  // List all connected devices (physical and emulators) handler
  const listDevicesHandler = async () => {
    try {
      const adb = new AdbUtils();
      const allDevices = await adb.getDevices();

      const emulatorUtils = new EmulatorUtils();
      const runningEmulators = await emulatorUtils.getRunningEmulators();

      // Categorize devices
      const devices = allDevices.map(deviceId => {
        const isEmulator = deviceId.startsWith("emulator-");
        const emulatorInfo = isEmulator ? runningEmulators.find(emu => emu.deviceId === deviceId) : null;

        return {
          deviceId,
          type: isEmulator ? "emulator" : "physical",
          avdName: emulatorInfo?.name || null,
          isOnline: true // If it's in the devices list, it's online
        };
      });

      return createJSONToolResponse({
        message: `Found ${devices.length} connected devices`,
        devices: devices,
        totalCount: devices.length,
        emulatorCount: devices.filter(d => d.type === "emulator").length,
        physicalCount: devices.filter(d => d.type === "physical").length
      });
    } catch (error) {
      throw new ActionableError(`Failed to list devices: ${error}`);
    }
  };

  // List AVDs handler
  const listAvdsHandler = async () => {
    try {
      const emulatorUtils = new EmulatorUtils();
      const avds = await emulatorUtils.listAvds();

      return createJSONToolResponse({
        message: `Found ${avds.length} available AVDs`,
        avds: avds,
        count: avds.length
      });
    } catch (error) {
      throw new ActionableError(`Failed to list AVDs: ${error}`);
    }
  };

  // Check running emulators handler
  const checkRunningEmulatorsHandler = async (args: CheckEmulatorArgs) => {
    try {
      const emulatorUtils = new EmulatorUtils();

      if (args.avdName) {
        // Check specific AVD
        const isRunning = await emulatorUtils.isAvdRunning(args.avdName);
        const runningEmulators = await emulatorUtils.getRunningEmulators();
        const emulator = runningEmulators.find(emu => emu.name === args.avdName);

        return createJSONToolResponse({
          message: `AVD '${args.avdName}' is ${isRunning ? "running" : "not running"}`,
          avdName: args.avdName,
          isRunning: isRunning,
          deviceId: emulator?.deviceId || null
        });
      } else {
        // Check all running emulators and include physical devices
        const adb = new AdbUtils();
        const allDevices = await adb.getDevices();
        const runningEmulators = await emulatorUtils.getRunningEmulators();

        const physicalDevices = allDevices.filter(device => !device.startsWith("emulator-"));

        return createJSONToolResponse({
          message: `Found ${runningEmulators.length} running emulators and ${physicalDevices.length} physical devices`,
          runningEmulators: runningEmulators,
          physicalDevices: physicalDevices.map(deviceId => ({ deviceId, type: "physical" })),
          emulatorCount: runningEmulators.length,
          physicalCount: physicalDevices.length,
          totalDevices: allDevices.length
        });
      }
    } catch (error) {
      throw new ActionableError(`Failed to check running emulators: ${error}`);
    }
  };

  // Start emulator handler
  const startEmulatorHandler = async (args: StartEmulatorArgs, progress?: ProgressCallback) => {
    try {
      const emulatorUtils = new EmulatorUtils();

      // Report initial progress
      if (progress) {
        await progress(0, 100, "Checking if emulator is already running...");
      }
      logger.info("Checking if emulator is already running...");

      // Check if the AVD is already running
      const isRunning = await emulatorUtils.isAvdRunning(args.avdName);
      if (isRunning) {
        if (progress) {
          await progress(100, 100, "Emulator already running");
        }

        // Find the device ID of the running emulator
        const runningEmulators = await emulatorUtils.getRunningEmulators();
        const emulator = runningEmulators.find(emu => emu.name === args.avdName);

        return createJSONToolResponse({
          message: `Emulator '${args.avdName}' is already running`,
          avdName: args.avdName,
          processId: null,
          isReady: true,
          deviceId: emulator?.deviceId || null,
          source: "local"
        });
      }

      let cumulativeProgress = 10;

      if (progress) {
        await progress(cumulativeProgress, 100, "Starting emulator process...");
      }

      // Start background polling BEFORE launching emulator for fastest detection
      logger.info("Starting background readiness polling before emulator launch...");
      const readinessPromise = emulatorUtils.waitForEmulatorReady(
        args.avdName,
        args.timeoutMs || 120000
      );

      // Start the emulator
      const childProcess = await emulatorUtils.startEmulator(
        args.avdName,
        []
      );

      if (progress) {
        cumulativeProgress += 10;
        await progress(cumulativeProgress, 100, "Emulator process started, waiting for readiness...");
      }

      let deviceId: string | null = null;

      // Wait for background polling to detect readiness
      try {
        deviceId = await readinessPromise;

        if (progress) {
          cumulativeProgress = 100;
          await progress(100, 100, "Emulator is ready");
        }
      } catch (waitError) {
        if (progress) {
          cumulativeProgress += 10;
          await progress(cumulativeProgress, 100, "Emulator started but readiness check failed");
        }

        // If waiting fails, the emulator might still be starting
        // Don't kill it, just report the issue
        return createJSONToolResponse({
          message: `Emulator '${args.avdName}' started but failed to become ready within timeout`,
          avdName: args.avdName,
          processId: childProcess.pid,
          isReady: false,
          deviceId: null,
          source: "local",
          warning: `Failed to wait for readiness: ${waitError}`
        });
      }

      return createJSONToolResponse({
        message: `Emulator '${args.avdName}' started and is ready`,
        avdName: args.avdName,
        processId: childProcess.pid,
        isReady: true,
        deviceId: deviceId,
        source: "local"
      });
    } catch (error) {
      throw new ActionableError(`Failed to start emulator: ${error}`);
    }
  };

  // Kill emulator handler
  const killEmulatorHandler = async (args: KillEmulatorArgs) => {
    try {
      const emulatorUtils = new EmulatorUtils();
      await emulatorUtils.killEmulator(args.avdName);

      return createJSONToolResponse({
        message: `Emulator '${args.avdName}' killed successfully`,
        avdName: args.avdName
      });
    } catch (error) {
      throw new ActionableError(`Failed to kill emulator: ${error}`);
    }
  };

  // Register with the tool registry
  ToolRegistry.register(
    "listDevices",
    "List all connected devices (both physical devices and emulators)",
    listDevicesSchema,
    listDevicesHandler
  );

  ToolRegistry.register(
    "listAvds",
    "List all available Android Virtual Devices (AVDs)",
    listAvdsSchema,
    listAvdsHandler
  );

  ToolRegistry.register(
    "checkRunningEmulators",
    "Check which emulators are currently running",
    checkEmulatorSchema,
    checkRunningEmulatorsHandler
  );

  ToolRegistry.register(
    "startEmulator",
    "Start an Android emulator with the specified AVD",
    startEmulatorSchema,
    startEmulatorHandler,
    true // Supports progress notifications
  );

  ToolRegistry.register(
    "killEmulator",
    "Kill a running Android emulator",
    killEmulatorSchema,
    killEmulatorHandler
  );
}
