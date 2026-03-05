/**
 * Interface for iOS simulator utilities
 * Provides simulator management and control capabilities
 */
export interface AppleSimulatorInfo {
  name: string;
  udid: string;
  state: string;
  isAvailable: boolean;
  deviceType: string;
  runtime: string;
}

export interface AppleSimulatorManager {
  /**
   * List all available iOS simulators
   * @returns Promise with array of simulator names
   */
  listSimulators(): Promise<string[]>;

  /**
   * Get detailed information about all simulators
   * @returns Promise with array of simulator info
   */
  getSimulatorInfo(): Promise<AppleSimulatorInfo[]>;

  /**
   * Get list of running iOS simulators
   * @returns Promise with array of running simulator info
   */
  getRunningSimulators(): Promise<AppleSimulatorInfo[]>;

  /**
   * Start an iOS simulator by name
   * @param simulatorName - Name of the simulator to start
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns Promise with result
   */
  startSimulator(simulatorName: string, timeoutMs?: number): Promise<{
    success: boolean;
    simulatorName: string;
    udid?: string;
    error?: string;
  }>;

  /**
   * Shut down an iOS simulator
   * @param simulatorName - Name of the simulator to shut down
   * @returns Promise with result
   */
  shutdownSimulator(simulatorName: string): Promise<{
    success: boolean;
    simulatorName: string;
    error?: string;
  }>;

  /**
   * Check if a specific simulator is running
   * @param simulatorName - Name of the simulator to check
   * @returns Promise with boolean indicating if running
   */
  isSimulatorRunning(simulatorName: string): Promise<boolean>;

  /**
   * List installed apps on a simulator
   * @param udid - Simulator UDID
   * @returns Promise with array of installed app identifiers
   */
  listInstalledApps(udid: string): Promise<string[]>;

  /**
   * Launch an app on a simulator
   * @param udid - Simulator UDID
   * @param appBundleId - App bundle identifier
   * @returns Promise that resolves when app launch is initiated
   */
  launchApp(udid: string, appBundleId: string): Promise<void>;
}
