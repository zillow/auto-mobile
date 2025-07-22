import { z } from "zod";
import { ToolRegistry, ProgressCallback } from "./toolRegistry";
import { ActionableError } from "../models/ActionableError";
import { SimulatorUtils } from "../utils/simulator";
import { createJSONToolResponse } from "../utils/toolUtils";
import { logger } from "../utils/logger";

// Schema definitions for iOS simulator tools
export const listSimulatorsSchema = z.object({
  // No parameters needed for listing simulators
});

export const startiOSSimulatorSchema = z.object({
  simulatorName: z.string().describe("The iOS simulator name to start"),
  timeoutMs: z.number().optional().default(120000).describe("Maximum time to wait for simulator to be ready in milliseconds")
});

export const shutdowniOSSimulatorSchema = z.object({
  simulatorName: z.string().describe("The iOS simulator name to shut down")
});

export const checkRunningiOSSimulatorsSchema = z.object({
  simulatorName: z.string().optional().describe("Specific simulator name to check (if not provided, checks all running simulators)")
});

// Export interfaces for type safety
export interface StartiOSSimulatorArgs {
  simulatorName: string;
  timeoutMs?: number;
}

export interface ShutdowniOSSimulatorArgs {
  simulatorName: string;
}

export interface CheckRunningiOSSimulatorsArgs {
  simulatorName?: string;
}

// Register iOS simulator tools
export function registerSimulatorTools() {
  // List all available iOS simulators handler
  const listSimulatorsHandler = async () => {
    try {
      const simulatorUtils = new SimulatorUtils();
      const simulators = await simulatorUtils.listSimulators();

      return createJSONToolResponse({
        message: `Found ${simulators.length} available iOS simulators`,
        simulators: simulators,
        count: simulators.length
      });
    } catch (error) {
      throw new ActionableError(`Failed to list iOS simulators: ${error}`);
    }
  };

  // Check running iOS simulators handler
  const checkRunningiOSSimulatorsHandler = async (args: CheckRunningiOSSimulatorsArgs) => {
    try {
      const simulatorUtils = new SimulatorUtils();

      if (args.simulatorName) {
        // Check specific simulator
        const isRunning = await simulatorUtils.isSimulatorRunning(args.simulatorName);
        const runningSimulators = await simulatorUtils.getRunningSimulators();
        const simulator = runningSimulators.find(sim => sim.name === args.simulatorName);

        return createJSONToolResponse({
          message: `iOS simulator '${args.simulatorName}' is ${isRunning ? "running" : "not running"}`,
          simulatorName: args.simulatorName,
          isRunning: isRunning,
          udid: simulator?.udid || null
        });
      } else {
        // Check all running simulators
        const runningSimulators = await simulatorUtils.getRunningSimulators();

        return createJSONToolResponse({
          message: `Found ${runningSimulators.length} running iOS simulators`,
          runningSimulators: runningSimulators,
          simulatorCount: runningSimulators.length
        });
      }
    } catch (error) {
      throw new ActionableError(`Failed to check running iOS simulators: ${error}`);
    }
  };

  // Start iOS simulator handler
  const startiOSSimulatorHandler = async (args: StartiOSSimulatorArgs, progress?: ProgressCallback) => {
    try {
      if (progress) {
        await progress(10, 100, `Starting iOS simulator: ${args.simulatorName}`);
      }

      const simulatorUtils = new SimulatorUtils();
      const result = await simulatorUtils.startSimulator(args.simulatorName, args.timeoutMs);

      if (progress && result.success) {
        await progress(100, 100, `iOS simulator ${args.simulatorName} started successfully`);
      } else if (progress && !result.success) {
        await progress(100, 100, `Failed to start iOS simulator: ${result.error}`);
      }

      if (result.success) {
        return createJSONToolResponse({
          message: result.error || `iOS simulator '${args.simulatorName}' started successfully`,
          simulatorName: args.simulatorName,
          udid: result.udid,
          isReady: true
        });
      } else {
        throw new ActionableError(result.error || `Failed to start iOS simulator '${args.simulatorName}'`);
      }
    } catch (error) {
      if (progress) {
        await progress(100, 100, `Error starting iOS simulator: ${error}`);
      }
      throw new ActionableError(`Failed to start iOS simulator: ${error}`);
    }
  };

  // Shutdown iOS simulator handler
  const shutdowniOSSimulatorHandler = async (args: ShutdowniOSSimulatorArgs) => {
    try {
      const simulatorUtils = new SimulatorUtils();
      const result = await simulatorUtils.shutdownSimulator(args.simulatorName);

      if (result.success) {
        return createJSONToolResponse({
          message: `iOS simulator '${args.simulatorName}' shut down successfully`,
          simulatorName: args.simulatorName,
          success: true
        });
      } else {
        throw new ActionableError(result.error || `Failed to shutdown iOS simulator '${args.simulatorName}'`);
      }
    } catch (error) {
      throw new ActionableError(`Failed to shutdown iOS simulator: ${error}`);
    }
  };

  // Register all iOS simulator tools with the tool registry
  ToolRegistry.register(
    "listSimulators",
    "List all available iOS simulators",
    listSimulatorsSchema,
    listSimulatorsHandler
  );

  ToolRegistry.register(
    "checkRunningiOSSimulators",
    "Check which iOS simulators are currently running",
    checkRunningiOSSimulatorsSchema,
    checkRunningiOSSimulatorsHandler
  );

  ToolRegistry.register(
    "startiOSSimulator",
    "Start an iOS simulator with the specified name",
    startiOSSimulatorSchema,
    startiOSSimulatorHandler
  );

  ToolRegistry.register(
    "shutdowniOSSimulator",
    "Shut down a running iOS simulator",
    shutdowniOSSimulatorSchema,
    shutdowniOSSimulatorHandler
  );

  logger.info("iOS simulator tools registered successfully");
} 