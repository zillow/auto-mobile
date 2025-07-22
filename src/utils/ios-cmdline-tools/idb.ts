import { ChildProcess, exec } from "child_process";
import { promisify } from "util";
import { logger } from "../logger";
import { ExecResult, ActionableError, DeviceInfo, BootedDevice } from "../../models";

// Enhance the standard execAsync result to implement the ExecResult interface
const execAsync = async (command: string, maxBuffer?: number): Promise<ExecResult> => {
  const options = maxBuffer ? { maxBuffer } : undefined;
  const result = await promisify(exec)(command, options);

  // Add the required string methods
  const enhancedResult: ExecResult = {
    stdout: typeof result.stdout === "string" ? result.stdout : result.stdout.toString(),
    stderr: typeof result.stderr === "string" ? result.stderr : result.stderr.toString(),
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

export interface AppleDevice {
    udid: string;
    name: string;
    state: string;
    isAvailable: boolean;
    deviceTypeIdentifier?: string;
    runtime?: string;
}

export interface AppleDeviceRuntime {
    bundlePath: string;
    buildversion: string;
    runtimeRoot: string;
    identifier: string;
    version: string;
    isAvailable: boolean;
    name: string;
}

export interface AppleDeviceType {
    minRuntimeVersion: number;
    bundlePath: string;
    maxRuntimeVersion: number;
    name: string;
    identifier: string;
    productFamily: string;
}

export interface SimulatorList {
    devices: { [runtimeId: string]: AppleDevice[] };
    pairs: any;
    runtimes: AppleDeviceRuntime[];
    devicetypes: AppleDeviceType[];
}

export class IdbUtils {
  device: BootedDevice | null;
  execAsync: (command: string, maxBuffer?: number) => Promise<ExecResult>;

  // Static cache for device list
  private static deviceListCache: { devices: DeviceInfo[], timestamp: number } | null = null;
  private static readonly DEVICE_LIST_CACHE_TTL = 5000; // 5 seconds

  /**
     * Create an IosUtils instance
     * @param device - Optional device
     * @param execAsyncFn - promisified exec function (for testing)
     */
  constructor(
    device: BootedDevice | null = null,
    execAsyncFn: ((command: string, maxBuffer?: number) => Promise<ExecResult>) | null = null
  ) {
    this.device = device;
    this.execAsync = execAsyncFn || execAsync;
  }

  /**
   * Set the target device ID
   * @param deviceId - Device identifier
   */
  setDevice(device: BootedDevice): void {
    this.device = device;
  }

  /**
     * Execute an xcrun simctl command
     * @param command - The simctl command to execute
     * @param timeoutMs - Optional timeout in milliseconds
     * @returns Promise with command output
     */
  async executeCommand(command: string, timeoutMs?: number): Promise<ExecResult> {
    const fullCommand = `xcrun simctl ${command}`;
    const startTime = Date.now();

    logger.info(`[iOS] Executing command: ${fullCommand}`);

    // Use Promise.race to implement timeout if specified
    if (timeoutMs) {
      let timeoutId: NodeJS.Timeout;

      const timeoutPromise = new Promise<ExecResult>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Command timed out after ${timeoutMs}ms: ${fullCommand}`)),
          timeoutMs
        );
      });

      try {
        const result = await Promise.race([this.execAsync(fullCommand), timeoutPromise]);
        const duration = Date.now() - startTime;
        logger.info(`[iOS] Command completed in ${duration}ms: ${command}`);
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.warn(`[iOS] Command failed after ${duration}ms: ${command} - ${(error as Error).message}`);
        throw error;
      } finally {
        clearTimeout(timeoutId!);
      }
    }

    // No timeout specified
    try {
      const result = await this.execAsync(fullCommand);
      const duration = Date.now() - startTime;
      logger.info(`[iOS] Command completed in ${duration}ms: ${command}`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[iOS] Command failed after ${duration}ms: ${command} - ${(error as Error).message}`);
      throw error;
    }
  }

  /**
     * Check if xcrun and simctl are available
     * @returns Promise with boolean indicating availability
     */
  async isXcrunAvailable(): Promise<boolean> {
    try {
      await this.execAsync("xcrun --version");
      return true;
    } catch (error) {
      logger.warn("xcrun is not available - iOS functionality requires Xcode Command Line Tools");
      return false;
    }
  }

  /**
     * Get the list of all simulators and devices
     * @returns Promise with simulator list data
     */
  private async listSimulators(): Promise<SimulatorList> {
    if (!(await this.isXcrunAvailable())) {
      throw new ActionableError("xcrun is not available. Please install Xcode Command Line Tools to use iOS functionality.");
    }

    const result = await this.executeCommand("list devices --json");

    try {
      return JSON.parse(result.stdout);
    } catch (error) {
      logger.error(`Failed to parse simulator list JSON: ${error}`);
      throw new ActionableError(`Failed to parse iOS simulator list: ${(error as Error).message}`);
    }
  }

  async isSimulatorRunning(name: string): Promise<boolean> {
    return (await this.getBootedSimulators()).find(simulator => simulator.name === name) !== undefined;
  }

  async startSimulator(name: string): Promise<ChildProcess> {
    // TODO
    throw new Error("Method not implemented.");
  }

  async killSimulator(device: BootedDevice): Promise<void> {
    // TODO
    throw new Error("Method not implemented.");
  }

  async waitForSimulatorReady(name: string): Promise<BootedDevice> {
    throw new Error("Method not implemented, need to query for deviceId");
    // TODO: const deviceId = throw new Error("Method not implemented.");
    // return { name: name, platform: "ios", deviceId: deviceId } as BootedDevice;
  }

  /**
     * Get the list of available (booted and shutdown) simulator UDIDs
     * @returns Promise with an array of device UDIDs
     */
  async listSimulatorImages(): Promise<DeviceInfo[]> {
    // Check cache first
    if (IdbUtils.deviceListCache) {
      const cacheAge = Date.now() - IdbUtils.deviceListCache.timestamp;
      if (cacheAge < IdbUtils.DEVICE_LIST_CACHE_TTL) {
        logger.info(`Getting list of iOS simulators (cached, age: ${cacheAge}ms)`);
        return IdbUtils.deviceListCache.devices;
      }
    }

    logger.info("Getting list of iOS simulators");

    try {
      const simulatorList = await this.listSimulators();
      const devices: DeviceInfo[] = [];

      // Extract all devices from all runtime versions
      for (const runtimeDevices of Object.values(simulatorList.devices)) {
        for (const device of runtimeDevices) {
          if (device.isAvailable) {
            devices.push({ name: device.udid, platform: "ios", isRunning: device.state === "Booted" } as DeviceInfo);
          }
        }
      }

      // Cache the result
      IdbUtils.deviceListCache = {
        devices,
        timestamp: Date.now()
      };

      return devices;
    } catch (error) {
      logger.warn(`Failed to get iOS devices: ${error}`);
      return [];
    }
  }

  /**
     * Get the list of booted simulator UDIDs
     * @returns Promise with an array of booted device UDIDs
     */
  async getBootedSimulators(): Promise<BootedDevice[]> {
    try {
      const simulatorList = await this.listSimulators();
      const bootedDevices: BootedDevice[] = [];

      // Extract booted devices from all runtime versions
      for (const runtimeDevices of Object.values(simulatorList.devices)) {
        for (const device of runtimeDevices) {
          if (device.isAvailable && device.state === "Booted") {
            bootedDevices.push({ name: device.name, platform: "ios", deviceId: device.udid } as BootedDevice);
          }
        }
      }

      return bootedDevices;
    } catch (error) {
      logger.warn(`Failed to get booted iOS devices: ${error}`);
      return [];
    }
  }

  /**
     * Get device information by UDID
     * @param udid - Device UDID
     * @returns Promise with device information or null if not found
     */
  async getDeviceInfo(udid: string): Promise<AppleDevice | null> {
    try {
      const simulatorList = await this.listSimulators();

      // Search for the device in all runtime versions
      for (const runtimeDevices of Object.values(simulatorList.devices)) {
        const device = runtimeDevices.find(d => d.udid === udid);
        if (device) {
          return device;
        }
      }

      return null;
    } catch (error) {
      logger.warn(`Failed to get iOS device info for ${udid}: ${error}`);
      return null;
    }
  }

  /**
     * Boot a simulator by UDID
     * @param udid - Device UDID to boot
     * @returns Promise that resolves when boot is initiated
     */
  async bootSimulator(udid: string): Promise<BootedDevice> {
    logger.info(`Booting iOS simulator ${udid}`);
    await this.executeCommand(`boot ${udid}`);
    const bootedSimulators = await this.getBootedSimulators();
    const bootedSimulator = bootedSimulators.find(device => device.deviceId === udid);
    if (!bootedSimulator) {
      throw new ActionableError(`Failed to boot iOS simulator ${udid}`);
    }
    return bootedSimulator;
  }

  /**
     * Shutdown a simulator by UDID
     * @param udid - Device UDID to shut down
     * @returns Promise that resolves when shutdown is initiated
     */
  async shutdownSimulator(udid: string): Promise<void> {
    logger.info(`Shutting down iOS simulator ${udid}`);
    await this.executeCommand(`shutdown ${udid}`);
  }

  /**
     * Get available device types (iPhone models, iPad models, etc.)
     * @returns Promise with array of device types
     */
  async getDeviceTypes(): Promise<AppleDeviceType[]> {
    const simulatorList = await this.listSimulators();
    return simulatorList.devicetypes;
  }

  /**
     * Get available iOS runtimes
     * @returns Promise with array of runtimes
     */
  async getRuntimes(): Promise<AppleDeviceRuntime[]> {
    const simulatorList = await this.listSimulators();
    return simulatorList.runtimes.filter(runtime => runtime.isAvailable);
  }

  /**
     * Create a new simulator
     * @param name - Name for the new simulator
     * @param deviceType - Device type identifier (e.g., "iPhone 15")
     * @param runtime - Runtime identifier (e.g., "iOS 17.0")
     * @returns Promise with the UDID of the created simulator
     */
  async createSimulator(name: string, deviceType: string, runtime: string): Promise<string> {
    logger.info(`Creating iOS simulator: ${name} (${deviceType}, ${runtime})`);
    const result = await this.executeCommand(`create "${name}" "${deviceType}" "${runtime}"`);
    const udid = result.stdout.trim();

    if (!udid) {
      throw new ActionableError(`Failed to create iOS simulator ${name}`);
    }

    logger.info(`Created iOS simulator ${name} with UDID: ${udid}`);
    return udid;
  }

  /**
     * Delete a simulator by UDID
     * @param udid - Device UDID to delete
     * @returns Promise that resolves when deletion is complete
     */
  async deleteSimulator(udid: string): Promise<void> {
    logger.info(`Deleting iOS simulator ${udid}`);
    await this.executeCommand(`delete ${udid}`);
  }
}
