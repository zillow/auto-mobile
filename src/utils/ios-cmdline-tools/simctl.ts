import { ChildProcess, exec } from "child_process";
import { promisify } from "util";
import { logger } from "../logger";
import { ExecResult, ActionableError, DeviceInfo, BootedDevice, ScreenSize } from "../../models";

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

/**
 * This file provides an interface to interact with iOS simulators using simctl.
 * It allows you to list, create, boot, and delete simulators.
 */

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

export class Simctl {
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
   * Execute an simctl command
   * @param command - The simctl command to execute
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns Promise with command output
   */
  async executeCommand(command: string, timeoutMs?: number): Promise<ExecResult> {

    if (!(await this.isAvailable())) {
      throw new ActionableError("simctl is not available. Please install Xcode command line tools to continue.");
    }

    const fullCommand = `xcrun simctl ${command}`;
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
   * Check if simctl is available
   * @returns Promise with boolean indicating availability
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.execAsync("xcrun simctl --version");
      return true;
    } catch (error) {
      logger.warn("simctl is not available - iOS functionality requires Xcode command line tools to be installed.");
      return false;
    }
  }

  /**
   * Get the list of all simulators and devices
   * @returns Promise with simulator list data
   */
  private async listSimulators(): Promise<SimulatorList> {
    const result = await this.executeCommand("list devices --json");

    try {
      const simulatorData = JSON.parse(result.stdout);
      return simulatorData as SimulatorList;
    } catch (error) {
      logger.error(`Failed to parse simctl device list: ${error}`);
      throw new ActionableError(`Failed to parse iOS device list: ${(error as Error).message}`);
    }
  }

  async isSimulatorRunning(name: string): Promise<boolean> {
    return (await this.getBootedSimulators()).find(simulator => simulator.name === name) !== undefined;
  }

  async startSimulator(udid: string): Promise<ChildProcess> {
    logger.debug(`Starting iOS simulator ${udid}`);
    await this.executeCommand(`boot ${udid}`);

    // simctl boot is synchronous, so we return a mock ChildProcess
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
    await this.executeCommand(`shutdown ${device.deviceId}`);
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
    if (Simctl.deviceListCache) {
      const cacheAge = Date.now() - Simctl.deviceListCache.timestamp;
      if (cacheAge < Simctl.DEVICE_LIST_CACHE_TTL) {
        logger.info(`Getting list of iOS simulators (cached, age: ${cacheAge}ms)`);
        return Simctl.deviceListCache.devices;
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
            logger.debug(`Found iOS simulator: ${device.name} (${device.udid})`);
            devices.push({
              name: device.name,
              platform: "ios",
              deviceId: device.udid,
              isRunning: device.state === "Booted"
            } as DeviceInfo);
          }
        }
      }

      // Cache the result
      Simctl.deviceListCache = {
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

    // Wait a moment for the simulator to register as booted
    await new Promise(resolve => setTimeout(resolve, 1000));

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

  /**
   * List all installed apps on the simulator
   * @param deviceId - Optional device ID (defaults to "booted" for current booted simulator)
   * @returns Promise with array of app objects containing bundle identifiers and other metadata
   */
  async listApps(deviceId?: string): Promise<any[]> {
    const targetDevice = deviceId || (this.device?.deviceId) || "booted";
    logger.debug(`Listing installed apps on iOS simulator ${targetDevice}`);

    try {
      const result = await this.executeCommand(`listapps ${targetDevice}`);
      const appsData = JSON.parse(result.stdout);

      // Convert the apps object to an array
      const apps = Object.values(appsData);
      return apps;
    } catch (error) {
      logger.warn(`Failed to list iOS apps: ${error}`);
      return [];
    }
  }

  /**
   * Launch an app on the simulator
   * @param bundleId - The bundle identifier of the app to launch
   * @param options - Launch options
   * @param deviceId - Optional device ID (defaults to current device or "booted")
   * @returns Promise with launch result containing success status and optional PID
   */
  async launchApp(bundleId: string, options?: { foregroundIfRunning?: boolean }, deviceId?: string): Promise<{
    success: boolean;
    pid?: number;
    error?: string
  }> {
    const targetDevice = deviceId || (this.device?.deviceId) || "booted";
    logger.debug(`Launching app ${bundleId} on iOS simulator ${targetDevice}`);

    try {
      const result = await this.executeCommand(`launch ${targetDevice} ${bundleId}`);

      // Parse the output to extract PID if available
      // Example output: "com.example.app: 12345"
      const pidMatch = result.stdout.match(/:\s*(\d+)/);
      const pid = pidMatch ? parseInt(pidMatch[1], 10) : undefined;

      return {
        success: true,
        pid
      };
    } catch (error) {
      logger.warn(`Failed to launch iOS app ${bundleId}: ${error}`);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Terminate an app on the simulator
   * @param bundleId - The bundle identifier of the app to terminate
   * @param deviceId - Optional device ID (defaults to current device or "booted")
   * @returns Promise that resolves when termination is complete
   */
  async terminateApp(bundleId: string, deviceId?: string): Promise<void> {
    const targetDevice = deviceId || (this.device?.deviceId) || "booted";
    logger.debug(`Terminating app ${bundleId} on iOS simulator ${targetDevice}`);

    try {
      await this.executeCommand(`terminate ${targetDevice} ${bundleId}`);
    } catch (error) {
      logger.warn(`Failed to terminate iOS app ${bundleId}: ${error}`);
      throw error;
    }
  }

  /**
   * Get the screen size of the simulator
   * @param deviceId - Optional device ID (defaults to current device or "booted")
   * @returns Promise with screen dimensions
   */
  async getScreenSize(deviceId?: string): Promise<ScreenSize> {
    const targetDevice = deviceId || (this.device?.deviceId) || "booted";

    logger.info(`[iOS] Getting screen size for simulator ${targetDevice}`);

    // Use simctl io enumerate to get display information
    const result = await this.executeCommand(`io ${targetDevice} enumerate`);

    // Parse the text output to find LCD screen information
    const lines = result.stdout.split("\n");
    let inLCDScreen = false;
    let width = 0;
    let height = 0;
    let uiScale = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Look for LCD screen section
      if (line.includes("LCD:") || line.includes("Screen Type: Integrated")) {
        inLCDScreen = true;
        continue;
      }

      // If we're in the LCD screen section, look for Pixel Size and UI Scale
      if (inLCDScreen) {
        if (line.includes("Pixel Size:")) {
          // Extract dimensions from format "Pixel Size: {1179, 2556}"
          const pixelSizeMatch = line.match(/Pixel Size:\s*\{(\d+),\s*(\d+)\}/);
          if (pixelSizeMatch) {
            width = parseInt(pixelSizeMatch[1], 10);
            height = parseInt(pixelSizeMatch[2], 10);
          }
        }

        if (line.includes("Preferred UI Scale:")) {
          // Extract UI scale from format "Preferred UI Scale: 3"
          const uiScaleMatch = line.match(/Preferred UI Scale:\s*(\d+(?:\.\d+)?)/);
          if (uiScaleMatch) {
            uiScale = parseFloat(uiScaleMatch[1]);
          }
        }
      }

      // Reset flag if we encounter a new port section
      if (line.startsWith("Port:") && inLCDScreen) {
        inLCDScreen = false;
      }
    }

    // If we found valid dimensions, apply UI scale and return logical size
    if (width > 0 && height > 0 && uiScale > 0) {
      return {
        width: Math.round(width / uiScale),
        height: Math.round(height / uiScale)
      } as ScreenSize;
    }

    throw new ActionableError("Unable to determine screen size from provided data.");
  }
}
