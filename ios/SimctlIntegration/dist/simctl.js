import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
/**
 * Simctl integration for iOS simulator lifecycle and app management
 */
export class Simctl {
    /**
     * Lists all available iOS simulators
     */
    async listDevices() {
        const { stdout } = await execAsync('xcrun simctl list devices --json');
        const data = JSON.parse(stdout);
        const devices = [];
        for (const runtime in data.devices) {
            const runtimeDevices = data.devices[runtime];
            for (const device of runtimeDevices) {
                devices.push({
                    udid: device.udid,
                    name: device.name,
                    state: device.state,
                    isAvailable: device.isAvailable,
                    deviceTypeIdentifier: device.deviceTypeIdentifier,
                    runtime: runtime,
                });
            }
        }
        return devices;
    }
    /**
     * Boots an iOS simulator
     */
    async bootDevice(udid) {
        await execAsync(`xcrun simctl boot ${udid}`);
    }
    /**
     * Shuts down an iOS simulator
     */
    async shutdownDevice(udid) {
        await execAsync(`xcrun simctl shutdown ${udid}`);
    }
    /**
     * Erases all data from an iOS simulator
     */
    async eraseDevice(udid) {
        await execAsync(`xcrun simctl erase ${udid}`);
    }
    /**
     * Installs an app on the simulator
     */
    async installApp(udid, appPath) {
        await execAsync(`xcrun simctl install ${udid} "${appPath}"`);
    }
    /**
     * Uninstalls an app from the simulator
     */
    async uninstallApp(udid, bundleId) {
        await execAsync(`xcrun simctl uninstall ${udid} ${bundleId}`);
    }
    /**
     * Launches an app on the simulator
     */
    async launchApp(udid, bundleId, args) {
        const argsStr = args ? args.join(' ') : '';
        await execAsync(`xcrun simctl launch ${udid} ${bundleId} ${argsStr}`);
    }
    /**
     * Terminates an app on the simulator
     */
    async terminateApp(udid, bundleId) {
        await execAsync(`xcrun simctl terminate ${udid} ${bundleId}`);
    }
    /**
     * Gets the status of an app
     */
    async getAppStatus(udid, bundleId) {
        try {
            const { stdout } = await execAsync(`xcrun simctl spawn ${udid} launchctl list | grep ${bundleId}`);
            return stdout.trim() ? 'running' : 'not running';
        }
        catch {
            return 'not running';
        }
    }
    /**
     * Opens a URL on the simulator
     */
    async openURL(udid, url) {
        await execAsync(`xcrun simctl openurl ${udid} "${url}"`);
    }
    /**
     * Sets the simulator status bar to demo mode
     */
    async setStatusBar(udid, options = {}) {
        const args = [];
        if (options.time !== undefined) {
            args.push(`--time "${options.time}"`);
        }
        if (options.batteryLevel !== undefined) {
            args.push(`--batteryLevel ${options.batteryLevel}`);
        }
        if (options.batteryState !== undefined) {
            args.push(`--batteryState ${options.batteryState}`);
        }
        if (options.wifiBars !== undefined) {
            args.push(`--wifiBars ${options.wifiBars}`);
        }
        if (options.cellularMode !== undefined) {
            args.push(`--cellularMode ${options.cellularMode}`);
        }
        if (options.cellularBars !== undefined) {
            args.push(`--cellularBars ${options.cellularBars}`);
        }
        await execAsync(`xcrun simctl status_bar ${udid} override ${args.join(' ')}`);
    }
    /**
     * Clears the status bar override
     */
    async clearStatusBar(udid) {
        await execAsync(`xcrun simctl status_bar ${udid} clear`);
    }
    /**
     * Takes a screenshot of the simulator
     */
    async screenshot(udid, outputPath) {
        await execAsync(`xcrun simctl io ${udid} screenshot "${outputPath}"`);
    }
    /**
     * Records a video of the simulator
     */
    async recordVideo(udid, outputPath, options) {
        const args = [];
        if (options?.codec) {
            args.push(`--codec ${options.codec}`);
        }
        if (options?.mask) {
            args.push(`--mask ${options.mask}`);
        }
        await execAsync(`xcrun simctl io ${udid} recordVideo ${args.join(' ')} "${outputPath}"`);
    }
    /**
     * Pushes a file to the simulator
     */
    async push(udid, sourcePath, destinationPath) {
        await execAsync(`xcrun simctl push ${udid} "${sourcePath}" "${destinationPath}"`);
    }
    /**
     * Gets environment variables for the simulator
     */
    async getEnv(udid) {
        const { stdout } = await execAsync(`xcrun simctl getenv ${udid}`);
        const lines = stdout.trim().split('\n');
        const env = {};
        for (const line of lines) {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
                env[key] = valueParts.join('=');
            }
        }
        return env;
    }
}
//# sourceMappingURL=simctl.js.map