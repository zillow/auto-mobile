import { ChildProcess, exec, spawn } from "child_process";
import { promisify } from "util";
import { logger } from "../logger";
import { BootedDevice, DeviceInfo, ExecResult, ActionableError } from "../../models";
import { AdbUtils } from "./adb";
import { arch } from "os";
import { detectAndroidCommandLineTools, getBestAndroidToolsLocation } from "./detection";

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
    // Only set a fallback emulator path here; proper detection happens lazily
    this.emulatorPath = this.getFallbackEmulatorPath();
  }

  /**
   * Get the path to the emulator executable.
   * This function tries the best available path synchronously, falling back to env/PATH.
   * Actual async detection is performed when needed by ensureEmulatorPath().
   * @returns The path to the emulator
   */
  private getFallbackEmulatorPath(): string {
    const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || process.env.ANDROID_SDK_HOME;
    if (androidHome) {
      return `${androidHome}/emulator/emulator`;
    }
    return "emulator";
  }

  /**
   * Gets the emulator path asynchronously via detection.
   * @returns Promise<string>
   */
  private async getEmulatorPath(): Promise<string> {
    // Try to find via Android command line tools detection
    try {
      const locations = await detectAndroidCommandLineTools();
      const bestLocation = getBestAndroidToolsLocation(locations);

      if (bestLocation) {
        // For Homebrew installations, the emulator is in the SDK root directory
        if (bestLocation.source === "homebrew") {
          // /opt/homebrew/share/android-commandlinetools/cmdline-tools/latest -> /opt/homebrew/share/android-commandlinetools
          const sdkRoot = bestLocation.path.replace("/cmdline-tools/latest", "");
          return `${sdkRoot}/emulator/emulator`;
        }
        // For standard installations, look in the parent SDK directory
        const sdkRoot = bestLocation.path.replace("/cmdline-tools/latest", "");
        return `${sdkRoot}/emulator/emulator`;
      }
    } catch (error) {
      logger.debug(`Failed to detect emulator path via Android tools detection: ${error}`);
    }

    // Fall back to default
    return this.getFallbackEmulatorPath();
  }

  /**
   * Ensure emulator path is properly detected and cached
   */
  private async ensureEmulatorPath(): Promise<string> {
    // Update cached path if needed
    const detectedPath = await this.getEmulatorPath();
    this.emulatorPath = detectedPath;
    return this.emulatorPath;
  }

  /**
   * Get the host architecture
   * @returns The host architecture string
   */
  private getHostArchitecture(): string {
    return arch();
  }

  /**
   * Check if an AVD architecture is compatible with the host
   * @param avdName - The AVD name to check
   * @returns Promise with compatibility result
   */
  private async checkArchitectureCompatibility(avdName: string): Promise<{
    compatible: boolean;
    hostArch: string;
    avdArch?: string;
    reason?: string
  }> {
    const hostArch = this.getHostArchitecture();

    try {
      // Get AVD config to determine its architecture
      const result = await this.executeCommand(`-avd ${avdName} -verbose`, 3000);
      const output = result.stdout + result.stderr;

      // Look for architecture information in the output
      let avdArch: string | undefined;

      // Check for target architecture in verbose output
      const archMatch = output.match(/Found AVD target architecture: (\w+)/);
      if (archMatch) {
        avdArch = archMatch[1];
      }

      // If we couldn't determine from verbose output, try to infer from common patterns
      if (!avdArch) {
        // This is a fallback - we'll let the actual emulator start attempt reveal the issue
        return { compatible: true, hostArch, reason: "Could not determine AVD architecture, allowing attempt" };
      }

      // Check compatibility
      const compatible = this.isArchitectureCompatible(hostArch, avdArch);
      const reason = compatible ? undefined : `Host architecture '${hostArch}' cannot run AVD with architecture '${avdArch}'`;

      return { compatible, hostArch, avdArch, reason };
    } catch (error) {
      // If we can't check, we'll let the emulator start attempt proceed and catch errors there
      logger.debug(`Could not check architecture compatibility for ${avdName}: ${error}`);
      return { compatible: true, hostArch, reason: "Could not verify compatibility, allowing attempt" };
    }
  }

  /**
   * Check if host architecture can run AVD architecture
   * @param hostArch - Host architecture
   * @param avdArch - AVD architecture
   * @returns Boolean indicating compatibility
   */
  private isArchitectureCompatible(hostArch: string, avdArch: string): boolean {
    // ARM64 hosts (Apple Silicon) cannot run x86/x86_64 AVDs
    if ((hostArch === "arm64" || hostArch === "aarch64") && (avdArch === "x86" || avdArch === "x86_64")) {
      return false;
    }

    // x86_64 hosts can generally run both x86 and ARM (with performance impact)
    // ARM hosts can run ARM AVDs
    return true;
  }

  /**
   * Detect if emulator output contains architecture-related PANIC errors
   * @param output - Emulator output to check
   * @returns Error details if PANIC detected, null otherwise
   */
  private detectArchitecturePanic(output: string): {
    isPanic: boolean;
    message?: string;
    hostArch?: string;
    avdArch?: string
  } {
    // Look for the specific PANIC message about architecture compatibility
    const panicMatch = output.match(/PANIC: Avd's CPU Architecture '(\w+)' is not supported by the QEMU2 emulator on (\w+) host/);

    if (panicMatch) {
      const avdArch = panicMatch[1];
      const hostArch = panicMatch[2];
      return {
        isPanic: true,
        message: `AVD architecture '${avdArch}' is not supported on ${hostArch} host`,
        hostArch,
        avdArch
      };
    }

    // Check for other PANIC messages that might be architecture-related
    if (output.includes("PANIC:") && (output.includes("architecture") || output.includes("CPU") || output.includes("QEMU"))) {
      return {
        isPanic: true,
        message: "Emulator PANIC detected (possibly architecture-related)",
      };
    }

    return { isPanic: false };
  }

  /**
   * Execute an emulator command
   * @param command - The command to execute
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns Promise with stdout and stderr
   */
  async executeCommand(command: string, timeoutMs?: number): Promise<ExecResult> {
    await this.ensureEmulatorPath();
    const fullCommand = `${this.emulatorPath} ${command}`;
    logger.debug(`Executing emulator command: ${fullCommand}`);

    // Use Promise.race to implement timeout if specified
    if (timeoutMs) {
      let timeoutId: NodeJS.Timeout;

      const timeoutPromise = new Promise<ExecResult>((_, reject) => {
        timeoutId = setTimeout(() =>
          reject(new ActionableError(`Command timed out after ${timeoutMs}ms: ${fullCommand}`)),
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
      throw new ActionableError(`Failed to list AVDs: ${error}`);
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
      throw new ActionableError(`AVD '${avdName}' not found. Available AVDs: ${availableAvds.join(", ")}`);
    }

    // Check if already running
    if (await this.isAvdRunning(avdName)) {
      throw new ActionableError(`AVD '${avdName}' is already running`);
    }

    // Check architecture compatibility before attempting to start
    const compatibility = await this.checkArchitectureCompatibility(avdName);
    if (!compatibility.compatible && compatibility.reason) {
      logger.error(`Architecture compatibility check failed: ${compatibility.reason}`);
      throw new ActionableError(`Cannot start AVD '${avdName}': ${compatibility.reason}. On ${compatibility.hostArch} hosts, use AVDs with compatible architectures (e.g., arm64-v8a for Apple Silicon Macs).`);
    }

    const args = ["-avd", avdName];
    logger.info(`Starting emulator with AVD: ${avdName}`);
    logger.debug(`Emulator command: ${this.emulatorPath} ${args.join(" ")}`);

    return new Promise((resolve, reject) => {
      const child = this.spawnFn(this.emulatorPath, args);

      // Buffer to collect initial output for PANIC detection
      let initialOutput = "";
      const outputBuffer: string[] = [];
      const maxBufferLines = 50; // Keep last 50 lines for error analysis
      let startupValidationComplete = false;

      // Monitor emulator output for PANIC errors
      const monitorOutput = (data: any) => {
        const output = data.toString();
        initialOutput += output;

        // Keep a rolling buffer of recent output
        const lines = output.split("\n");
        outputBuffer.push(...lines);
        if (outputBuffer.length > maxBufferLines) {
          outputBuffer.splice(0, outputBuffer.length - maxBufferLines);
        }

        // Check for PANIC in the output
        const panicResult = this.detectArchitecturePanic(initialOutput);
        if (panicResult.isPanic) {
          logger.error(`Emulator PANIC detected: ${panicResult.message}`);

          // Create a more helpful error message
          let errorMessage = `Emulator failed to start: ${panicResult.message}`;
          if (panicResult.hostArch && panicResult.avdArch) {
            errorMessage += `\n\nSuggestion: On ${panicResult.hostArch} hosts, create AVDs with compatible architectures:`;
            if (panicResult.hostArch === "aarch64" || panicResult.hostArch === "arm64") {
              errorMessage += `\n- Use ARM64 system images (arm64-v8a) instead of x86/x86_64`;
              errorMessage += `\n- Example: avdmanager create avd -n MyAVD -k "system-images;android-35;google_apis;arm64-v8a"`;
            } else if (panicResult.hostArch === "x86" || panicResult.hostArch === "x86_64") {
              errorMessage += `\n- Use x86/x86_64 system images instead of ARM64`;
              errorMessage += `\n- Example: avdmanager create avd -n MyAVD -k "system-images;android-35;google_apis;x86_64"`;
            }
          }

          // Kill the process if it's still running
          if (!child.killed) {
            child.kill();
          }

          // Reject the promise instead of just emitting error
          if (!startupValidationComplete) {
            startupValidationComplete = true;
            reject(new ActionableError(errorMessage));
          }
          return;
        }

        // Check for successful startup indicators
        if (output.includes("INFO         | emuDirName:") ||
          output.includes("Hax is enabled") ||
          output.includes("Detected GPU type")) {
          // Emulator has started successfully, resolve with the child process
          if (!startupValidationComplete) {
            startupValidationComplete = true;
            resolve(child);
          }
        }
      };

      // Set a timeout for startup validation (5 seconds should be enough to detect PANIC)
      const startupTimeout = setTimeout(() => {
        if (!startupValidationComplete) {
          startupValidationComplete = true;
          // If no PANIC detected and no clear success indicators, assume success
          resolve(child);
        }
      }, 5000);

      // Log emulator output for debugging and monitor for PANIC
      child.stdout?.on("data", data => {
        logger.debug(`Emulator stdout: ${data}`);
        monitorOutput(data);
      });

      child.stderr?.on("data", data => {
        logger.debug(`Emulator stderr: ${data}`);
        monitorOutput(data);
      });

      child.on("exit", code => {
        clearTimeout(startupTimeout);
        if (code !== 0) {
          logger.error(`Emulator process exited with code: ${code}`);

          // Check if exit was due to PANIC
          const panicResult = this.detectArchitecturePanic(initialOutput);
          if (panicResult.isPanic) {
            logger.error(`Exit was due to PANIC: ${panicResult.message}`);
            if (!startupValidationComplete) {
              startupValidationComplete = true;
              reject(new ActionableError(`Emulator failed to start: ${panicResult.message}`));
            }
          } else if (!startupValidationComplete) {
            startupValidationComplete = true;
            reject(new ActionableError(`Emulator process exited with code: ${code}`));
          }
        } else {
          logger.info(`Emulator process exited with code: ${code}`);
        }
      });

      child.on("error", error => {
        clearTimeout(startupTimeout);
        if (!startupValidationComplete) {
          startupValidationComplete = true;
          reject(new ActionableError(`Emulator failed to start: ${error.message}`));
        }
      });
    });
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
      throw new ActionableError(`Emulator '${device.name}' is not running`);
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

    // Read polling interval from environment variable (default: 500ms, minimum: 100ms)
    const pollingIntervalMs = Math.max(parseInt(process.env.EMULATOR_POLLING_INTERVAL_MS || "500", 10), 100);
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

        // Always wait at least the minimum polling interval
        logger.info(`Background polling cycle complete - sleeping ${pollingIntervalMs}ms before next check`);
        await this.sleep(pollingIntervalMs);
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

    throw new ActionableError(`Emulator '${avdName}' failed to become ready within ${timeoutMs}ms`);
  }

  /**
   * Utility method to sleep for a specified duration
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
