import { exec, spawn } from "child_process";
import { promisify } from "util";
import { logger } from "./logger";
import { ExecResult } from "../models";

const execAsync = async (command: string): Promise<ExecResult> => {
  const result = await promisify(exec)(command);

  // Add the required string methods
  const enhancedResult: ExecResult = {
    stdout: result.stdout,
    stderr: result.stderr,
    toString() {
      return this.stdout;
    },
    trim() {
      return this.stdout.trim();
    },
    includes(searchString: string) {
      return this.stdout.includes(searchString);
    }
  };

  return enhancedResult;
};

export interface SimulatorInfo {
  name: string;
  udid: string;
  state: string;
  isAvailable: boolean;
  deviceType: string;
  runtime: string;
}

export class SimulatorUtils {
  private execAsync: (command: string) => Promise<ExecResult>;
  private spawnFn: typeof spawn;

  /**
   * Create a SimulatorUtils instance
   * @param execAsyncFn - promisified exec function (for testing)
   * @param spawnFn - spawn function (for testing)
   */
  constructor(
    execAsyncFn: ((command: string) => Promise<ExecResult>) | null = null,
    spawnFn: typeof spawn | null = null
  ) {
    this.execAsync = execAsyncFn || execAsync;
    this.spawnFn = spawnFn || spawn;
  }

  /**
   * List all available iOS simulators
   * @returns Promise with array of simulator names
   */
  async listSimulators(): Promise<string[]> {
    try {
      logger.info("Listing available iOS simulators");
      const result = await this.execAsync("xcrun simctl list devices --json");
      
      const data = JSON.parse(result.stdout);
      const simulators: string[] = [];

      // Parse the simulators from the JSON structure
      Object.keys(data.devices).forEach(runtime => {
        if (Array.isArray(data.devices[runtime])) {
          data.devices[runtime].forEach((device: any) => {
            if (device.isAvailable !== false) {
              simulators.push(device.name);
            }
          });
        }
      });

      return [...new Set(simulators)]; // Remove duplicates
    } catch (error) {
      logger.error("Failed to list iOS simulators:", error);
      return [];
    }
  }

  /**
   * Get detailed information about all simulators
   * @returns Promise with array of simulator info
   */
  async getSimulatorInfo(): Promise<SimulatorInfo[]> {
    try {
      const result = await this.execAsync("xcrun simctl list devices --json");
      const data = JSON.parse(result.stdout);
      const simulators: SimulatorInfo[] = [];

      Object.keys(data.devices).forEach(runtime => {
        if (Array.isArray(data.devices[runtime])) {
          data.devices[runtime].forEach((device: any) => {
            simulators.push({
              name: device.name,
              udid: device.udid,
              state: device.state,
              isAvailable: device.isAvailable !== false,
              deviceType: device.name,
              runtime: runtime
            });
          });
        }
      });

      return simulators;
    } catch (error) {
      logger.error("Failed to get iOS simulator info:", error);
      return [];
    }
  }

  /**
   * Get list of running iOS simulators
   * @returns Promise with array of running simulator info
   */
  async getRunningSimulators(): Promise<SimulatorInfo[]> {
    try {
      const allSimulators = await this.getSimulatorInfo();
      return allSimulators.filter(sim => sim.state === "Booted");
    } catch (error) {
      logger.error("Failed to get running iOS simulators:", error);
      return [];
    }
  }

  /**
   * Start an iOS simulator by name
   * @param simulatorName - Name of the simulator to start
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns Promise with result
   */
  async startSimulator(simulatorName: string, timeoutMs: number = 120000): Promise<{
    success: boolean;
    simulatorName: string;
    udid?: string;
    error?: string;
  }> {
    try {
      logger.info(`Starting iOS simulator: ${simulatorName}`);
      
      // Find the simulator by name
      const simulators = await this.getSimulatorInfo();
      const simulator = simulators.find(sim => 
        sim.name === simulatorName && sim.isAvailable
      );

      if (!simulator) {
        return {
          success: false,
          simulatorName,
          error: `Simulator '${simulatorName}' not found or not available`
        };
      }

      // Check if already running
      if (simulator.state === "Booted") {
        return {
          success: true,
          simulatorName,
          udid: simulator.udid,
          error: "Simulator is already running"
        };
      }

      // Start the simulator
      await this.execAsync(`xcrun simctl boot ${simulator.udid}`);
      
      // Wait for simulator to boot
      const bootResult = await this.waitForSimulatorBoot(simulator.udid, timeoutMs);
      
      if (bootResult) {
        return {
          success: true,
          simulatorName,
          udid: simulator.udid
        };
      } else {
        return {
          success: false,
          simulatorName,
          error: "Simulator failed to boot within timeout period"
        };
      }
    } catch (error) {
      logger.error(`Failed to start iOS simulator ${simulatorName}:`, error);
      return {
        success: false,
        simulatorName,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Shut down an iOS simulator
   * @param simulatorName - Name of the simulator to shut down
   * @returns Promise with result
   */
  async shutdownSimulator(simulatorName: string): Promise<{
    success: boolean;
    simulatorName: string;
    error?: string;
  }> {
    try {
      logger.info(`Shutting down iOS simulator: ${simulatorName}`);
      
      // Find the simulator by name
      const simulators = await this.getSimulatorInfo();
      const simulator = simulators.find(sim => sim.name === simulatorName);

      if (!simulator) {
        return {
          success: false,
          simulatorName,
          error: `Simulator '${simulatorName}' not found`
        };
      }

      // Shut down the simulator
      await this.execAsync(`xcrun simctl shutdown ${simulator.udid}`);
      
      return {
        success: true,
        simulatorName
      };
    } catch (error) {
      logger.error(`Failed to shutdown iOS simulator ${simulatorName}:`, error);
      return {
        success: false,
        simulatorName,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Wait for simulator to boot
   * @param udid - Simulator UDID
   * @param timeoutMs - Timeout in milliseconds
   * @returns Promise with boolean indicating success
   */
  private async waitForSimulatorBoot(udid: string, timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const result = await this.execAsync(`xcrun simctl list devices --json`);
        const data = JSON.parse(result.stdout);
        
        // Find the simulator and check its state
        for (const runtime of Object.keys(data.devices)) {
          const device = data.devices[runtime].find((d: any) => d.udid === udid);
          if (device && device.state === "Booted") {
            logger.info(`iOS simulator ${udid} is now booted`);
            return true;
          }
        }
        
        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        logger.warn(`Error checking simulator boot status: ${error}`);
      }
    }
    
    logger.warn(`iOS simulator ${udid} failed to boot within ${timeoutMs}ms`);
    return false;
  }

  /**
   * Check if a specific simulator is running
   * @param simulatorName - Name of the simulator to check
   * @returns Promise with boolean indicating if running
   */
  async isSimulatorRunning(simulatorName: string): Promise<boolean> {
    try {
      const runningSimulators = await this.getRunningSimulators();
      return runningSimulators.some(sim => sim.name === simulatorName);
    } catch (error) {
      logger.error(`Failed to check if simulator ${simulatorName} is running:`, error);
      return false;
    }
  }
} 