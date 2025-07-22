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
  model?: string;
  os_version?: string;
  architecture?: string;
  type?: string;
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

export interface IdbDevice {
  model: string;
  os_version: string;
  udid: string;
  architecture: string;
  type: string;
  name: string;
  state: string;
}

export class IdbCompanion {
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
   * @param device - Device identifier
   */
  setDevice(device: BootedDevice): void {
    this.device = device;
  }

  /**
   * Execute an idb command
   * @param command - The simctl command to execute
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns Promise with command output
   */
  async executeCommand(command: string, timeoutMs?: number): Promise<ExecResult> {

    if (!(await this.isAvailable())) {
      throw new ActionableError("idb_companion is not available. Please install Facebook's idb CLI to continue.");
    }

    const fullCommand = `idb_companion ${command}`;
    const startTime = Date.now();

    logger.debug(`[iOS] Executing command: ${fullCommand}`);

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
        logger.debug(`[iOS] Command completed in ${duration}ms: ${command}`);
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
      logger.debug(`[iOS] Command completed in ${duration}ms: ${command}`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[iOS] Command failed after ${duration}ms: ${command} - ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Check if idb is available
   * @returns Promise with boolean indicating availability
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.execAsync("idb_companion --version");
      return true;
    } catch (error) {
      logger.warn("idb is not available - iOS functionality requires Facebook's idb CLI tool to be installed and on PATH.");
      return false;
    }
  }

  /**
   * Get the list of all simulators and devices
   * @returns Promise with simulator list data
   */
  private async listSimulators(): Promise<SimulatorList> {

    const result = await this.executeCommand("--list 1");

    try {
      const devices: AppleDevice[] = [];
      const lines = result.stdout.split("\n");

      // Parse each line that looks like JSON
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("{") && trimmedLine.endsWith("}")) {
          try {
            const idbDevice = JSON.parse(trimmedLine) as IdbDevice;
            // Convert idb device format to AppleDevice format
            const appleDevice: AppleDevice = {
              udid: idbDevice.udid,
              name: idbDevice.name,
              state: idbDevice.state,
              isAvailable: true, // idb only returns available devices
              model: idbDevice.model,
              os_version: idbDevice.os_version,
              architecture: idbDevice.architecture,
              type: idbDevice.type
            };
            devices.push(appleDevice);
          } catch (parseError) {
            logger.debug(`Failed to parse device JSON line: ${trimmedLine} - ${parseError}`);
            continue;
          }
        }
      }

      // Return a SimulatorList structure with devices grouped by runtime
      // For idb, we'll group all devices under a generic runtime key since
      // the runtime info is embedded in the device's os_version field
      const simulatorList: SimulatorList = {
        devices: { "idb_devices": devices },
        pairs: {},
        runtimes: [],
        devicetypes: []
      };

      return simulatorList;
    } catch (error) {
      logger.error(`Failed to parse idb device list: ${error}`);
      throw new ActionableError(`Failed to parse iOS device list: ${(error as Error).message}`);
    }
  }

  async isSimulatorRunning(name: string): Promise<boolean> {
    return (await this.getBootedSimulators()).find(simulator => simulator.name === name) !== undefined;
  }

  async startSimulator(udid: string): Promise<ChildProcess> {
    logger.debug(`Starting iOS simulator ${udid}`);
    await this.executeCommand(`--boot ${udid}`);

    // idb boot is synchronous, so we return a mock ChildProcess
    // This interface might need revision as idb doesn't return a long-running process
    const mockProcess = {
      pid: Date.now(), // Use timestamp as mock PID
      kill: () => false,
      killed: false,
      connected: false,
      exitCode: 0,
      signalCode: null
    } as any as ChildProcess;

    return mockProcess;
  }

  async killSimulator(device: BootedDevice): Promise<void> {
    logger.debug(`Killing iOS simulator ${device.deviceId}`);
    await this.executeCommand(`--shutdown ${device.deviceId}`);
  }

  async waitForSimulatorReady(udid: string): Promise<BootedDevice> {
    const simulator = (await this.listSimulatorImages())
      .find(device => device.deviceId === udid);

    if (!simulator) {
      throw new ActionableError(`Simulator with UDID ${udid} not found`);
    }

    if (!simulator.isRunning) {
      throw new ActionableError(`Simulator with UDID ${udid} is not running`);
    }

    return {
      name: simulator.name,
      platform: simulator.platform,
      deviceId: simulator.deviceId
    } as BootedDevice;
  }

  /**
   * Get the list of available (booted and shutdown) simulator UDIDs
   * @returns Promise with an array of device UDIDs
   */
  async listSimulatorImages(): Promise<DeviceInfo[]> {
    // Check cache first
    if (IdbCompanion.deviceListCache) {
      const cacheAge = Date.now() - IdbCompanion.deviceListCache.timestamp;
      if (cacheAge < IdbCompanion.DEVICE_LIST_CACHE_TTL) {
        logger.info(`Getting list of iOS simulators (cached, age: ${cacheAge}ms)`);
        return IdbCompanion.deviceListCache.devices;
      }
    }

    logger.debug("Getting list of iOS simulators");

    try {
      const simulatorList = await this.listSimulators();
      const devices: DeviceInfo[] = [];

      // Extract all devices from all runtime versions
      for (const runtimeDevices of Object.values(simulatorList.devices)) {
        for (const device of runtimeDevices) {
          if (device.isAvailable) {
            logger.debug(`Found ios simulator: ${device.name}`);
            devices.push({ name: device.udid, platform: "ios", isRunning: device.state === "Booted" } as DeviceInfo);
          }
        }
      }

      // Cache the result
      IdbCompanion.deviceListCache = {
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
      logger.debug(`Found simulator list: ${simulatorList}`);
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
    logger.debug(`Booting iOS simulator ${udid}`);
    await this.executeCommand(`boot ${udid}`);
    const bootedSimulators = await this.getBootedSimulators();
    const bootedSimulator = bootedSimulators.find(device => device.deviceId === udid);
    if (!bootedSimulator) {
      throw new ActionableError(`Failed to boot iOS simulator ${udid}`);
    }
    return bootedSimulator;
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
    logger.debug(`Creating iOS simulator: ${name} (${deviceType}, ${runtime})`);
    const result = await this.executeCommand(`create "${name}" "${deviceType}" "${runtime}"`);
    const simulatorUdid = result.stdout.trim();

    if (!simulatorUdid) {
      throw new ActionableError(`Failed to create iOS simulator ${name}`);
    }

    logger.debug(`Created iOS simulator ${name} with UDID: ${simulatorUdid}`);
    return simulatorUdid;
  }

  /**
   * Delete a simulator by UDID
   * @param udid - Device UDID to delete
   * @returns Promise that resolves when deletion is complete
   */
  async deleteSimulator(udid: string): Promise<void> {
    logger.debug(`Deleting iOS simulator ${udid}`);
    await this.executeCommand(`delete ${udid}`);
  }
}
