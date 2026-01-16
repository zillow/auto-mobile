/**
 * Simulator device information
 */
export interface SimulatorDevice {
    udid: string;
    name: string;
    state: 'Shutdown' | 'Booted' | 'Booting' | 'ShuttingDown';
    isAvailable: boolean;
    deviceTypeIdentifier: string;
    runtime: string;
}
/**
 * Simctl integration for iOS simulator lifecycle and app management
 */
export declare class Simctl {
    /**
     * Lists all available iOS simulators
     */
    listDevices(): Promise<SimulatorDevice[]>;
    /**
     * Boots an iOS simulator
     */
    bootDevice(udid: string): Promise<void>;
    /**
     * Shuts down an iOS simulator
     */
    shutdownDevice(udid: string): Promise<void>;
    /**
     * Erases all data from an iOS simulator
     */
    eraseDevice(udid: string): Promise<void>;
    /**
     * Installs an app on the simulator
     */
    installApp(udid: string, appPath: string): Promise<void>;
    /**
     * Uninstalls an app from the simulator
     */
    uninstallApp(udid: string, bundleId: string): Promise<void>;
    /**
     * Launches an app on the simulator
     */
    launchApp(udid: string, bundleId: string, args?: string[]): Promise<void>;
    /**
     * Terminates an app on the simulator
     */
    terminateApp(udid: string, bundleId: string): Promise<void>;
    /**
     * Gets the status of an app
     */
    getAppStatus(udid: string, bundleId: string): Promise<'running' | 'not running'>;
    /**
     * Opens a URL on the simulator
     */
    openURL(udid: string, url: string): Promise<void>;
    /**
     * Sets the simulator status bar to demo mode
     */
    setStatusBar(udid: string, options?: StatusBarOptions): Promise<void>;
    /**
     * Clears the status bar override
     */
    clearStatusBar(udid: string): Promise<void>;
    /**
     * Takes a screenshot of the simulator
     */
    screenshot(udid: string, outputPath: string): Promise<void>;
    /**
     * Records a video of the simulator
     */
    recordVideo(udid: string, outputPath: string, options?: RecordOptions): Promise<void>;
    /**
     * Pushes a file to the simulator
     */
    push(udid: string, sourcePath: string, destinationPath: string): Promise<void>;
    /**
     * Gets environment variables for the simulator
     */
    getEnv(udid: string): Promise<Record<string, string>>;
}
/**
 * Status bar configuration options
 */
export interface StatusBarOptions {
    time?: string;
    batteryLevel?: number;
    batteryState?: 'charging' | 'charged' | 'discharging';
    wifiBars?: number;
    cellularMode?: 'active' | 'notSupported' | 'searching' | 'failed';
    cellularBars?: number;
}
/**
 * Video recording options
 */
export interface RecordOptions {
    codec?: 'h264' | 'hevc';
    mask?: 'ignored' | 'alpha' | 'black';
}
//# sourceMappingURL=simctl.d.ts.map