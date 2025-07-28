import { ChildProcess, exec, spawn } from "child_process";
import { promisify } from "util";
import { logger } from "../logger";
import { BootedDevice, DeviceInfo, ExecResult } from "../../models";
import { AdbUtils } from "./adb";

const execAsync = async (command: string): Promise<ExecResult> => {
  const result = await promisify(exec)(command);

  // Add the required string methods
  // noinspection UnnecessaryLocalVariableJS
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

export class AndroidEmulator {
  private execAsync: (command: string) => Promise<ExecResult>;
  private spawnFn: typeof spawn;
  private emulatorPath: string;

  /**
   * Create an DeviceUtils instance
   * @param execAsyncFn - promisified exec function (for testing)
   * @param spawnFn - spawn function (for testing)
   */
  constructor(
    execAsyncFn: ((command: string) => Promise<ExecResult>) | null = null,
    spawnFn: typeof spawn | null = null
  ) {
    this.execAsync = execAsyncFn || execAsync;
    this.spawnFn = spawnFn || spawn;
    this.emulatorPath = this.getEmulatorPath();
  }

  /**
   * Get the path to the emulator executable
   * @returns The path to the emulator
   */
  private getEmulatorPath(): string {
    const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || process.env.ANDROID_SDK_HOME;
    if (androidHome) {
      return `${androidHome}/emulator/emulator`;
    }
    return "emulator"; // Fallback to PATH
  }

  /**
   * Execute an emulator command
   * @param command - The command to execute
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns Promise with stdout and stderr
   */
  async executeCommand(command: string, timeoutMs?: number): Promise<ExecResult> {
    const fullCommand = `${this.emulatorPath} ${command}`;
    logger.debug(`Executing emulator command: ${fullCommand}`);

    // Use Promise.race to implement timeout if specified
    if (timeoutMs) {
      let timeoutId: NodeJS.Timeout;

      const timeoutPromise = new Promise<ExecResult>((_, reject) => {
        timeoutId = setTimeout(() =>
          reject(new Error(`Command timed out after ${timeoutMs}ms: ${fullCommand}`)),
                               timeoutMs
        );
      });

      try {
        return await Promise.race([this.execAsync(fullCommand), timeoutPromise]);
      } finally {
        clearTimeout(timeoutId!);
      }
    }

    return await this.execAsync(fullCommand);
  }

  /**
   * List all available AVDs
   * @returns Promise with array of AVD names
   */
  async listAvds(): Promise<DeviceInfo[]> {
    try {
      const result = await this.executeCommand("-list-avds");
      return result.stdout
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(name => ({ name, platform: "android", isRunning: false, source: "local" } as DeviceInfo));
    } catch (error) {
      logger.error("Failed to list AVDs:", error);
      throw new Error(`Failed to list AVDs: ${error}`);
    }
  }

  /**
   * Check if a specific AVD is running
   * @param avdName - The AVD name to check
   * @returns Promise with boolean indicating if the AVD is running
   */
  async isAvdRunning(avdName: string): Promise<boolean> {
    const runningEmulators = await this.getBootedEmulators();
    return runningEmulators.some(emulator => emulator.name === avdName);
  }

  /**
   * Check if any emulator is currently running
   * @returns Promise with array of running emulator info
   */
  async getBootedEmulators(): Promise<BootedDevice[]> {
    try {
      const adb = new AdbUtils();
      const devices = await adb.getBootedEmulators();
      const runningEmulators: BootedDevice[] = [];

      // Add local emulator devices
      const emulatorDevices = devices.filter(device => device.name.startsWith("emulator-"));

      for (const device of emulatorDevices) {
        const deviceId = device.deviceId;
        try {
          // Try to get the AVD name from the running emulator
          const adbWithDevice = new AdbUtils(device);
          const result = await adbWithDevice.executeCommand("emu avd name");
          const avdName = result.stdout.trim().replace(/\r?\n.*$/, ""); // Remove any trailing newlines and additional text

          logger.info(`AVD name detection for ${deviceId}: raw="${result.stdout}" (${result.stdout.length} chars), cleaned="${avdName}"`);

          runningEmulators.push({
            name: avdName || `Unknown (${deviceId})`,
            platform: "android",
            deviceId: deviceId,
            source: "local"
          });
        } catch (error) {
          // If we can't get the AVD name, just use the device ID
          logger.info(`Failed to get AVD name for ${deviceId}: ${error}`);
          runningEmulators.push({
            name: `Unknown (${deviceId})`,
            platform: "android",
            deviceId: deviceId,
            source: "local"
          });
        }
      }

      return runningEmulators;
    } catch (error) {
      logger.error("Failed to get running emulators:", error);
      return [];
    }
  }

  /**
   * Start an emulator with the specified AVD
   * @param avdName - The AVD name to start
   * @returns Promise with the spawned child process
   */
  async startEmulator(
    avdName: string,
  ): Promise<ChildProcess> {
    logger.info(`Using local emulator for AVD: ${avdName}`);

    // Check if the AVD exists
    const availableAvds = await this.listAvds();
    if (!availableAvds.find(emu => emu.name === avdName)) {
      throw new Error(`AVD '${avdName}' not found. Available AVDs: ${availableAvds.join(", ")}`);
    }

    // Check if already running
    if (await this.isAvdRunning(avdName)) {
      throw new Error(`AVD '${avdName}' is already running`);
    }

    const args = ["-avd", avdName];
    logger.info(`Starting emulator with AVD: ${avdName}`);
    logger.debug(`Emulator command: ${this.emulatorPath} ${args.join(" ")}`);

    const child = this.spawnFn(this.emulatorPath, args);

    // Log emulator output for debugging
    child.stdout?.on("data", data => {
      logger.debug(`Emulator stdout: ${data}`);
    });

    child.stderr?.on("data", data => {
      logger.debug(`Emulator stderr: ${data}`);
    });

    child.on("exit", code => {
      logger.info(`Emulator process exited with code: ${code}`);
    });

    return child;
  }

  /**
   * Kill a running emulator
   * @param device - The device to kill
   * @returns Promise that resolves when emulator is stopped
   */
  async killDevice(device: BootedDevice): Promise<void> {
    const runningEmulators = await this.getBootedEmulators();
    const emulator = runningEmulators.find(emu => emu.deviceId === device.deviceId);

    if (!emulator || !emulator.deviceId) {
      throw new Error(`Emulator '${device.name}' is not running`);
    }

    // Use ADB to stop the emulator
    const adb = new AdbUtils(emulator);
    await adb.executeCommand("emu kill");

    logger.info(`Killed emulator '${device.name}'`);
  }

  /**
   * Wait for the emulator to be ready for use
   * @param avdName - The AVD name to wait for
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 120000 = 2 minutes)
   * @returns Promise that resolves with device ID when emulator is ready
   */
  async waitForEmulatorReady(avdName: string, timeoutMs: number = 120000): Promise<BootedDevice> {
    const startTime = Date.now();

    // Read polling interval from environment variable (default: 0 = continuous polling)
    const pollingIntervalMs = parseInt(process.env.EMULATOR_POLLING_INTERVAL_MS || "0", 10);
    logger.info(`Waiting for emulator '${avdName}' to be ready... (polling interval: ${pollingIntervalMs}ms)`);

    // Start background polling immediately with configurable intervals
    let pollingActive = true;
    let foundDeviceId: string | null = null;

    const backgroundPoller = async () => {
      while (pollingActive && !foundDeviceId) {
        try {
          logger.info(`Background polling iteration - checking for emulator '${avdName}'...`);

          // For local emulators, check for running devices
          logger.info(`Checking for running local emulators...`);
          const runningEmulators = await this.getBootedEmulators();
          logger.info(`Device scan complete - found ${runningEmulators.length} running emulators`);

          if (runningEmulators.length > 0) {
            logger.info(`Found ${runningEmulators.length} running emulators: ${runningEmulators.map(e => `${e.name}(${e.deviceId})`).join(", ")}`);

            // Look for emulator by name first
            let emulator = runningEmulators.find(emu => emu.name === avdName);
            logger.info(`Exact name match for '${avdName}': ${emulator ? `Found ${emulator.deviceId}` : "Not found"}`);

            // If not found by exact name, try to find any local emulator
            if (!emulator) {
              emulator = runningEmulators.find(emu => emu.source === "local");
              if (emulator) {
                logger.info(`Found local emulator with deviceId ${emulator.deviceId}, but name mismatch. Expected: ${avdName}, Found: ${emulator.name}`);
              } else {
                logger.info(`No local emulators found to use as fallback`);
              }
            }

            if (emulator && emulator.deviceId) {
              logger.info(`Target emulator found: ${emulator.name} (${emulator.deviceId}) - starting readiness checks`);

              // Check if the device is online and ready
              // Run device state and package manager checks in parallel for faster detection
              logger.info(`[PARALLEL] Running device state and package manager checks for ${emulator.deviceId}...`);
              const adb = new AdbUtils(emulator);
              try {
                const [deviceStateResult, packageManagerResult] = await Promise.allSettled([
                  adb.executeCommand("get-state"),
                  adb.executeCommand("shell pm list packages")
                ]);

                // Check device state result
                if (deviceStateResult.status !== "fulfilled" || packageManagerResult.status !== "fulfilled") {
                  logger.info(`[PARALLEL] Checks not yet complete: deviceStatus: ${deviceStateResult.status}, packageManager: ${packageManagerResult.status}`);
                } else {
                  const stateOutput = deviceStateResult.value.stdout.trim();
                  logger.info(`[PARALLEL] Package manager command completed for ${emulator.deviceId} - output: ${packageManagerResult.value.stdout.length} bytes`);
                  if (!stateOutput.includes("device")) {
                    logger.info(`[PARALLEL] ❌ Device state check failed for ${emulator.deviceId}: state="${stateOutput}"`);
                  } else if (!packageManagerResult.value.stdout || !packageManagerResult.value.stdout.includes("package:")) {
                    logger.info(`[PARALLEL] ❌ Package manager returned no packages for ${emulator.deviceId} (${packageManagerResult.value.stdout.length} bytes output)`);
                  } else if (packageManagerResult.value.stderr || packageManagerResult.value.stderr.includes("Failure")) {
                    logger.info(`[PARALLEL] ❌ Package manager returned failure for ${emulator.deviceId}: ${packageManagerResult.value.stderr}`);
                  } else {
                    logger.info(`[PARALLEL] ✅ Device state check passed for ${emulator.deviceId}`);
                    logger.info(`[PARALLEL] ✅ Package manager is responsive for ${emulator.deviceId} - emulator is ready!`);
                    logger.info(`[PARALLEL] ✅ No package manager errors detected - marking emulator as ready`);
                    foundDeviceId = emulator.deviceId;
                    return;
                  }
                }
              } catch (parallelError) {
                logger.info(`[PARALLEL] ❌ Parallel checks failed for ${emulator.deviceId}: ${parallelError}`);
              }
            } else {
              logger.info(`No suitable emulator found for '${avdName}' - will continue polling`);
            }
          } else {
            logger.info(`No running emulators detected - will continue polling`);
          }
        } catch (error) {
          logger.info(`Background polling error (will continue): ${error}`);
        }

        // Configurable polling interval - 0 means continuous (no delay)
        if (pollingIntervalMs > 0) {
          logger.info(`Background polling cycle complete - sleeping ${pollingIntervalMs}ms before next check`);
          await this.sleep(pollingIntervalMs);
        } else {
          // Continuous polling - just yield to the event loop briefly to prevent blocking
          await new Promise(resolve => setImmediate(resolve));
        }
      }
      logger.info(`Background polling stopped - pollingActive: ${pollingActive}, foundDeviceId: ${foundDeviceId}`);
    };

    // Start background polling immediately
    const pollingPromise = backgroundPoller();

    // Main timeout loop
    while (Date.now() - startTime < timeoutMs && pollingActive) {
      if (foundDeviceId) {
        pollingActive = false;
        logger.info(`Emulator '${avdName}' is ready! Device ID: ${foundDeviceId}`);
        return { name: avdName, platform: "android", deviceId: foundDeviceId } as BootedDevice;
      }

      // Check less frequently in main loop since background polling is doing the work
      await this.sleep(500);
    }

    // Stop background polling
    pollingActive = false;
    await pollingPromise;

    if (foundDeviceId) {
      logger.info(`Emulator '${avdName}' is ready! Device ID: ${foundDeviceId}`);
      return { name: avdName, platform: "android", deviceId: foundDeviceId } as BootedDevice;
    }

    throw new Error(`Emulator '${avdName}' failed to become ready within ${timeoutMs}ms`);
  }

  /**
   * Utility method to sleep for a specified duration
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
