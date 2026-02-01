import { ChildProcess, execFile } from "child_process";
import { promisify } from "util";
import { logger } from "../logger";
import { createExecResult } from "../execResult";
import { isRunningInDocker } from "../dockerEnv";
import { isHostControlAvailable, runSimctlExec, shouldUseHostControl } from "../hostControlClient";
import { ExecResult, ActionableError, DeviceInfo, BootedDevice, ScreenSize } from "../../models";
import { defaultTimer } from "../SystemTimer";

export interface AppleDevice {
  udid: string;
  name: string;
  state: string;
  isAvailable: boolean;
  availabilityError?: string;
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

/**
 * Interface for iOS simulator control using simctl
 * Provides methods to manage and interact with iOS simulators
 */
export interface SimCtl {
  /**
   * Set the target device ID
   * @param device - Device identifier
   */
  setDevice(device: BootedDevice): void;

  /**
   * Execute a simctl command
   * @param command - The simctl command to execute
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns Promise with command output
   */
  executeCommand(command: string, timeoutMs?: number): Promise<ExecResult>;

  /**
   * Check if simctl is available
   * @returns Promise with boolean indicating availability
   */
  isAvailable(): Promise<boolean>;

  /**
   * Check if a simulator is running by name
   * @param name - Simulator name or UDID
   * @returns Promise with boolean indicating if running
   */
  isSimulatorRunning(name: string): Promise<boolean>;

  /**
   * Start a simulator by UDID
   * @param udid - Device UDID to start
   * @returns Promise that resolves when simulator is started
   */
  startSimulator(udid: string): Promise<any>;

  /**
   * Kill a simulator
   * @param device - Device to kill
   * @returns Promise that resolves when kill is complete
   */
  killSimulator(device: BootedDevice): Promise<void>;

  /**
   * Wait for a simulator to be ready
   * @param udid - Device UDID to wait for
   * @returns Promise with booted device information
   */
  waitForSimulatorReady(udid: string): Promise<BootedDevice>;

  /**
   * Get the list of available (booted and shutdown) simulator UDIDs
   * @returns Promise with an array of device info
   */
  listSimulatorImages(): Promise<DeviceInfo[]>;

  /**
   * Get the list of booted simulator UDIDs
   * @returns Promise with an array of booted devices
   */
  getBootedSimulators(): Promise<BootedDevice[]>;

  /**
   * Get device information by UDID
   * @param udid - Device UDID
   * @returns Promise with device information or null if not found
   */
  getDeviceInfo(udid: string): Promise<AppleDevice | null>;

  /**
   * Boot a simulator by UDID
   * @param udid - Device UDID to boot
   * @returns Promise with booted device information
   */
  bootSimulator(udid: string): Promise<BootedDevice>;

  /**
   * Get available device types (iPhone models, iPad models, etc.)
   * @returns Promise with array of device types
   */
  getDeviceTypes(): Promise<AppleDeviceType[]>;

  /**
   * Get available iOS runtimes
   * @returns Promise with array of runtimes
   */
  getRuntimes(): Promise<AppleDeviceRuntime[]>;

  /**
   * Create a new simulator
   * @param name - Name for the new simulator
   * @param deviceType - Device type identifier (e.g., "iPhone 15")
   * @param runtime - Runtime identifier (e.g., "iOS 17.0")
   * @returns Promise with the UDID of the created simulator
   */
  createSimulator(name: string, deviceType: string, runtime: string): Promise<string>;

  /**
   * Delete a simulator by UDID
   * @param udid - Device UDID to delete
   * @returns Promise that resolves when deletion is complete
   */
  deleteSimulator(udid: string): Promise<void>;

  /**
   * List all installed apps on the simulator
   * @param deviceId - Optional device ID (defaults to "booted" for current booted simulator)
   * @returns Promise with array of app objects
   */
  listApps(deviceId?: string): Promise<any[]>;

  /**
   * Launch an app on the simulator
   * @param bundleId - The bundle identifier of the app to launch
   * @param options - Launch options
   * @param deviceId - Optional device ID (defaults to current device or "booted")
   * @returns Promise with launch result containing success status and optional PID
   */
  launchApp(
    bundleId: string,
    options?: { foregroundIfRunning?: boolean },
    deviceId?: string
  ): Promise<{
    success: boolean;
    pid?: number;
    error?: string;
  }>;

  /**
   * Terminate an app on the simulator
   * @param bundleId - The bundle identifier of the app to terminate
   * @param deviceId - Optional device ID (defaults to current device or "booted")
   * @returns Promise that resolves when termination is complete
   */
  terminateApp(bundleId: string, deviceId?: string): Promise<void>;

  /**
   * Install an app on the simulator
   * @param appPath - Path to the .app bundle
   * @param deviceId - Optional device ID (defaults to current device or "booted")
   */
  installApp(appPath: string, deviceId?: string): Promise<void>;

  /**
   * Uninstall an app from the simulator
   * @param bundleId - The bundle identifier of the app to uninstall
   * @param deviceId - Optional device ID (defaults to current device or "booted")
   */
  uninstallApp(bundleId: string, deviceId?: string): Promise<void>;

  /**
   * Get the screen size of the simulator
   * @param deviceId - Optional device ID (defaults to current device or "booted")
   * @returns Promise with screen dimensions
   */
  getScreenSize(deviceId?: string): Promise<ScreenSize>;

  /**
   * Set the simulator appearance
   * @param mode - Appearance mode ("light" or "dark")
   * @param deviceId - Optional device ID (defaults to current device or "booted")
   */
  setAppearance(mode: "light" | "dark", deviceId?: string): Promise<void>;
}

interface SimctlHostControlRunner {
  isAvailable(): Promise<boolean>;
  isRunningInDocker(): boolean;
  runSimctl(args: string[]): Promise<ExecResult>;
  shouldUseHostControl(): boolean;
}

// Enhance the standard execAsync result to implement the ExecResult interface
const execAsync = async (file: string, args: string[], maxBuffer?: number): Promise<ExecResult> => {
  const options = maxBuffer ? { maxBuffer } : undefined;
  const result = await promisify(execFile)(file, args, options);

  const stdout = typeof result.stdout === "string" ? result.stdout : result.stdout.toString();
  const stderr = typeof result.stderr === "string" ? result.stderr : result.stderr.toString();
  return createExecResult(stdout, stderr);
};

function splitCommandArgs(command: string): string[] {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error("Command cannot be empty");
  }

  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (char === "\\" && i + 1 < trimmed.length) {
      current += trimmed[i + 1];
      i++;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

function normalizeIosVersion(runtimeId: string | undefined, osVersion: string | undefined): string | undefined {
  const trimmedOsVersion = osVersion?.trim();
  if (trimmedOsVersion) {
    return trimmedOsVersion;
  }

  if (!runtimeId) {
    return undefined;
  }

  const match = runtimeId.match(/iOS[-_](\d+(?:[-_]\d+)*)/);
  if (!match) {
    return undefined;
  }

  return match[1].replace(/_/g, ".").replace(/-/g, ".");
}

/**
 * This file provides an interface to interact with iOS simulators using simctl.
 * It allows you to list, create, boot, and delete simulators.
 */

export interface SimulatorList {
  devices: { [runtimeId: string]: AppleDevice[] };
  pairs: any;
  runtimes: AppleDeviceRuntime[];
  devicetypes: AppleDeviceType[];
}

export class SimCtlClient implements SimCtl {
  device: BootedDevice | null;
  execAsync: (file: string, args: string[], maxBuffer?: number) => Promise<ExecResult>;
  private hostControl: SimctlHostControlRunner;
  private hostControlAvailability: Promise<boolean> | null = null;

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
    execAsyncFn: ((file: string, args: string[], maxBuffer?: number) => Promise<ExecResult>) | null = null,
    hostControlRunner: SimctlHostControlRunner | null = null
  ) {
    this.device = device;
    this.execAsync = execAsyncFn || execAsync;
    this.hostControl = hostControlRunner || {
      isAvailable: () => isHostControlAvailable(),
      isRunningInDocker,
      runSimctl: async (args: string[]) => {
        const result = await runSimctlExec(args);
        if (!result.success || !result.data) {
          throw new Error(result.error || "Host control simctl failed");
        }
        return result.data;
      },
      shouldUseHostControl
    };
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
    const hostArgs = splitCommandArgs(command);
    const localArgs = ["simctl", ...hostArgs];
    const wantsHostControl = this.hostControl.shouldUseHostControl() && this.hostControl.isRunningInDocker();
    const hostControlAvailable = wantsHostControl ? await this.isHostControlAvailable() : false;
    const useHostControl = wantsHostControl && hostControlAvailable;
    const fullCommand = useHostControl ? `host-control simctl ${command}` : `xcrun simctl ${command}`;
    const startTime = Date.now();

    logger.debug(`[iOS] Executing command: ${fullCommand}`);

    if (wantsHostControl && !hostControlAvailable) {
      throw new ActionableError(
        "simctl is not available via host control. " +
        "Ensure the host control daemon is running and reachable from the container."
      );
    }

    if (!useHostControl && !(await this.isLocalSimctlAvailable())) {
      throw new ActionableError("simctl is not available. Please install Xcode command line tools to continue.");
    }

    const runCommand = () => (
      useHostControl
        ? this.hostControl.runSimctl(hostArgs)
        : this.execAsync("xcrun", localArgs)
    );

    // Use Promise.race to implement timeout if specified
    if (timeoutMs) {
      let timeoutId: NodeJS.Timeout;

      const timeoutPromise = new Promise<ExecResult>((_, reject) => {
        timeoutId = defaultTimer.setTimeout(
          () => reject(new Error(`Command timed out after ${timeoutMs}ms: ${fullCommand}`)),
          timeoutMs
        );
      });

      try {
        const result = await Promise.race([runCommand(), timeoutPromise]);
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
      const result = await runCommand();
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
    const wantsHostControl = this.hostControl.shouldUseHostControl() && this.hostControl.isRunningInDocker();
    if (wantsHostControl) {
      return this.isHostControlAvailable();
    }

    try {
      await this.execAsync("xcrun", ["simctl", "--version"]);
      return true;
    } catch (error) {
      logger.warn("simctl is not available - iOS functionality requires Xcode command line tools to be installed.");
      return false;
    }
  }

  private async isHostControlAvailable(): Promise<boolean> {
    if (!this.hostControlAvailability) {
      this.hostControlAvailability = this.hostControl.isAvailable();
    }
    return this.hostControlAvailability;
  }

  private async isLocalSimctlAvailable(): Promise<boolean> {
    try {
      await this.execAsync("xcrun", ["simctl", "--version"]);
      return true;
    } catch {
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
      const stdoutSnippet = result.stdout.trim().slice(0, 300);
      const stderrSnippet = result.stderr.trim().slice(0, 300);
      logger.error(`Failed to parse simctl device list: ${error}`);
      throw new ActionableError(
        "Failed to parse iOS device list from 'xcrun simctl list devices --json'. " +
        `${error instanceof Error ? error.message : String(error)}. ` +
        `stdout (first 300 chars): ${stdoutSnippet || "<empty>"}. ` +
        `stderr (first 300 chars): ${stderrSnippet || "<empty>"}.`
      );
    }
  }

  async isSimulatorRunning(identifier: string): Promise<boolean> {
    return (await this.getBootedSimulators()).some(simulator =>
      simulator.deviceId === identifier || simulator.name === identifier
    );
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
    if (SimCtlClient.deviceListCache) {
      const cacheAge = Date.now() - SimCtlClient.deviceListCache.timestamp;
      if (cacheAge < SimCtlClient.DEVICE_LIST_CACHE_TTL) {
        logger.info(`Getting list of iOS simulators (cached, age: ${cacheAge}ms)`);
        return SimCtlClient.deviceListCache.devices;
      }
    }

    logger.debug("Getting list of iOS simulators");

    try {
      const simulatorList = await this.listSimulators();
      const devices: DeviceInfo[] = [];

      // Extract all devices from all runtime versions
      for (const [runtimeId, runtimeDevices] of Object.entries(simulatorList.devices)) {
        for (const device of runtimeDevices) {
          logger.debug(`Found iOS simulator: ${device.name} (${device.udid}) state=${device.state}`);
          devices.push({
            name: device.name,
            platform: "ios",
            deviceId: device.udid,
            isRunning: device.state === "Booted",
            state: device.state,
            isAvailable: device.isAvailable,
            availabilityError: device.availabilityError,
            iosVersion: normalizeIosVersion(runtimeId, device.os_version),
            deviceType: device.deviceTypeIdentifier,
            runtime: runtimeId,
            model: device.model,
            architecture: device.architecture
          } as DeviceInfo);
        }
      }

      // Cache the result
      SimCtlClient.deviceListCache = {
        devices,
        timestamp: Date.now()
      };

      devices.sort((a, b) => (a.deviceId || "").localeCompare(b.deviceId || ""));
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
      for (const [runtimeId, runtimeDevices] of Object.entries(simulatorList.devices)) {
        for (const device of runtimeDevices) {
          if (device.isAvailable && device.state === "Booted") {
            bootedDevices.push({
              name: device.name,
              platform: "ios",
              deviceId: device.udid,
              iosVersion: normalizeIosVersion(runtimeId, device.os_version)
            } as BootedDevice);
          }
        }
      }

      bootedDevices.sort((a, b) => a.deviceId.localeCompare(b.deviceId));
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
      for (const [runtimeId, runtimeDevices] of Object.entries(simulatorList.devices)) {
        const device = runtimeDevices.find(d => d.udid === udid);
        if (device) {
          return { ...device, runtime: runtimeId };
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
    await defaultTimer.sleep(1000);

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
      const parseApps = (payload: string): any[] => {
        const appsData = JSON.parse(payload);

        if (Array.isArray(appsData)) {
          return appsData;
        }

        if (!appsData || typeof appsData !== "object") {
          return [];
        }

        // Convert the apps object to an array, preserving bundle IDs from keys.
        return Object.entries(appsData).map(([bundleId, appInfo]) => {
          const record = appInfo && typeof appInfo === "object" ? appInfo : {};
          return { ...record, bundleId };
        });
      };

      try {
        const result = await this.executeCommand(`listapps ${targetDevice} --all`);
        return parseApps(result.stdout);
      } catch (error) {
        logger.warn(`Failed to list iOS apps with --all: ${error}`);
      }

      const result = await this.executeCommand(`listapps ${targetDevice}`);
      return parseApps(result.stdout);
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

  async installApp(appPath: string, deviceId?: string): Promise<void> {
    const targetDevice = deviceId || (this.device?.deviceId) || "booted";
    logger.debug(`Installing app ${appPath} on iOS simulator ${targetDevice}`);
    await this.executeCommand(`install ${targetDevice} "${appPath}"`);
  }

  async uninstallApp(bundleId: string, deviceId?: string): Promise<void> {
    const targetDevice = deviceId || (this.device?.deviceId) || "booted";
    logger.debug(`Uninstalling app ${bundleId} from iOS simulator ${targetDevice}`);
    await this.executeCommand(`uninstall ${targetDevice} ${bundleId}`);
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

  async setAppearance(mode: "light" | "dark", deviceId?: string): Promise<void> {
    const targetDevice = deviceId || this.device?.deviceId || "booted";
    await this.executeCommand(`ui ${targetDevice} appearance ${mode}`);
  }
}

// Backward compatibility export
export { SimCtlClient as Simctl };
