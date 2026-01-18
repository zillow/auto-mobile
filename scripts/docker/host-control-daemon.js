#!/usr/bin/env node
/**
 * Host Control Daemon for Auto-Mobile Docker Integration
 *
 * This daemon runs on the host machine and provides a simple JSON-RPC interface
 * for Docker containers to control Android SDK tools (emulator, avdmanager, etc.)
 * and iOS simulators via simctl/xcodebuild (macOS only).
 *
 * Features:
 * - Start/stop Android emulators
 * - List available AVDs
 * - Run avdmanager commands
 * - Run sdkmanager commands
 * - Start/stop iOS simulators (macOS only)
 * - List available iOS simulators
 * - Run simctl commands
 * - Run xcodebuild commands
 *
 * Usage:
 *   node host-control-daemon.js [--port 15037] [--host 0.0.0.0]
 *
 * The daemon listens on port 15037 by default and accepts JSON-RPC requests.
 */

const net = require("net");
const { spawn, execFile } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const os = require("os");

const execFileAsync = promisify(execFile);

// Configuration
const DEFAULT_PORT = 15037;
const DEFAULT_HOST = "0.0.0.0";
const COMMAND_TIMEOUT_MS = 30000;

// Parse command line arguments
const args = process.argv.slice(2);
let port = DEFAULT_PORT;
let host = DEFAULT_HOST;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) {
    port = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === "--host" && args[i + 1]) {
    host = args[i + 1];
    i++;
  }
}

// Detect Android SDK location
function getAndroidSdk() {
  const sdkRoot = process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.join(os.homedir(), "Library/Android/sdk");
  return sdkRoot;
}

function getEmulatorPath() {
  return path.join(getAndroidSdk(), "emulator", "emulator");
}

function getAvdManagerPath() {
  return path.join(getAndroidSdk(), "cmdline-tools", "latest", "bin", "avdmanager");
}

function getSdkManagerPath() {
  return path.join(getAndroidSdk(), "cmdline-tools", "latest", "bin", "sdkmanager");
}

function getAdbPath() {
  return path.join(getAndroidSdk(), "platform-tools", "adb");
}

// iOS support (macOS only)
const IS_MACOS = os.platform() === "darwin";

/**
 * Check if Xcode command line tools are available
 */
async function isXcodeAvailable() {
  if (!IS_MACOS) return false;
  try {
    await execFileAsync("xcrun", ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// Track running emulator processes
const runningEmulators = new Map(); // avdName -> { pid, process }
const runningSimulators = new Map(); // udid -> { name, state }

// Command handlers
const handlers = {
  /**
   * List available AVDs
   */
  async "list-avds"() {
    const emulatorPath = getEmulatorPath();
    try {
      const { stdout } = await execFileAsync(emulatorPath, ["-list-avds"], {
        timeout: COMMAND_TIMEOUT_MS
      });
      const avds = stdout.trim().split("\n").filter(line => line.trim());
      return { success: true, avds };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Start an emulator
   */
  async "start-emulator"(params) {
    const { avd, headless = true, args: extraArgs = [] } = params;
    if (!avd) {
      return { success: false, error: "Missing required parameter: avd" };
    }

    // Check if already running
    if (runningEmulators.has(avd)) {
      return { success: true, message: `Emulator ${avd} is already running`, pid: runningEmulators.get(avd).pid };
    }

    const emulatorPath = getEmulatorPath();
    const emulatorArgs = ["-avd", avd];

    if (headless) {
      emulatorArgs.push("-no-window", "-no-audio");
    }

    emulatorArgs.push(...extraArgs);

    try {
      const emulatorProcess = spawn(emulatorPath, emulatorArgs, {
        detached: true,
        stdio: "ignore"
      });

      emulatorProcess.unref();

      runningEmulators.set(avd, {
        pid: emulatorProcess.pid,
        process: emulatorProcess
      });

      // Wait a bit for the emulator to start
      await new Promise(resolve => setTimeout(resolve, 2000));

      return {
        success: true,
        message: `Started emulator ${avd}`,
        pid: emulatorProcess.pid
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Stop an emulator
   */
  async "stop-emulator"(params) {
    const { avd, deviceId } = params;

    // Try to kill via ADB first (more reliable)
    if (deviceId) {
      try {
        const adbPath = getAdbPath();
        await execFileAsync(adbPath, ["-s", deviceId, "emu", "kill"], {
          timeout: 10000
        });
        if (avd) {
          runningEmulators.delete(avd);
        }
        return { success: true, message: `Stopped emulator ${deviceId}` };
      } catch (error) {
        // Fall through to process kill
      }
    }

    // Try to kill by AVD name
    if (avd && runningEmulators.has(avd)) {
      const { pid } = runningEmulators.get(avd);
      try {
        process.kill(pid, "SIGTERM");
        runningEmulators.delete(avd);
        return { success: true, message: `Stopped emulator ${avd} (pid ${pid})` };
      } catch (error) {
        runningEmulators.delete(avd);
        return { success: false, error: error.message };
      }
    }

    return { success: false, error: "No running emulator found matching criteria" };
  },

  /**
   * List running emulators
   */
  async "list-running"() {
    const adbPath = getAdbPath();
    try {
      const { stdout } = await execFileAsync(adbPath, ["devices"], {
        timeout: 5000
      });

      const devices = [];
      const lines = stdout.split("\n").slice(1);
      for (const line of lines) {
        const match = line.match(/^(emulator-\d+)\s+(\w+)/);
        if (match) {
          devices.push({ deviceId: match[1], state: match[2] });
        }
      }

      return { success: true, devices };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Run an avdmanager command
   */
  async "avdmanager"(params) {
    const { args = [] } = params;
    const avdManagerPath = getAvdManagerPath();

    try {
      const { stdout, stderr } = await execFileAsync(avdManagerPath, args, {
        timeout: COMMAND_TIMEOUT_MS
      });
      return { success: true, stdout, stderr };
    } catch (error) {
      return { success: false, error: error.message, stderr: error.stderr };
    }
  },

  /**
   * Run an sdkmanager command
   */
  async "sdkmanager"(params) {
    const { args = [] } = params;
    const sdkManagerPath = getSdkManagerPath();

    try {
      const { stdout, stderr } = await execFileAsync(sdkManagerPath, args, {
        timeout: COMMAND_TIMEOUT_MS * 10 // SDK operations can be slow
      });
      return { success: true, stdout, stderr };
    } catch (error) {
      return { success: false, error: error.message, stderr: error.stderr };
    }
  },

  /**
   * Get SDK info
   */
  async "sdk-info"() {
    return {
      success: true,
      sdkRoot: getAndroidSdk(),
      emulatorPath: getEmulatorPath(),
      avdManagerPath: getAvdManagerPath(),
      sdkManagerPath: getSdkManagerPath(),
      adbPath: getAdbPath()
    };
  },

  // ========================================================================
  // iOS Simulator Commands (macOS only)
  // ========================================================================

  /**
   * List available iOS simulators
   */
  async "list-simulators"() {
    if (!IS_MACOS) {
      return { success: false, error: "iOS simulators are only available on macOS" };
    }

    try {
      const { stdout } = await execFileAsync("xcrun", ["simctl", "list", "devices", "--json"], {
        timeout: COMMAND_TIMEOUT_MS
      });
      const data = JSON.parse(stdout);

      // Flatten devices from all runtimes
      const simulators = [];
      for (const [runtime, devices] of Object.entries(data.devices || {})) {
        for (const device of devices) {
          if (device.isAvailable) {
            simulators.push({
              udid: device.udid,
              name: device.name,
              state: device.state,
              runtime: runtime,
              deviceTypeIdentifier: device.deviceTypeIdentifier
            });
          }
        }
      }

      return { success: true, simulators };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * List running (booted) iOS simulators
   */
  async "list-running-simulators"() {
    if (!IS_MACOS) {
      return { success: false, error: "iOS simulators are only available on macOS" };
    }

    try {
      const { stdout } = await execFileAsync("xcrun", ["simctl", "list", "devices", "booted", "--json"], {
        timeout: COMMAND_TIMEOUT_MS
      });
      const data = JSON.parse(stdout);

      const simulators = [];
      for (const [runtime, devices] of Object.entries(data.devices || {})) {
        for (const device of devices) {
          if (device.state === "Booted") {
            simulators.push({
              udid: device.udid,
              name: device.name,
              state: device.state,
              runtime: runtime
            });
            // Track running simulators
            runningSimulators.set(device.udid, { name: device.name, state: device.state });
          }
        }
      }

      return { success: true, simulators };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Boot an iOS simulator
   */
  async "boot-simulator"(params) {
    if (!IS_MACOS) {
      return { success: false, error: "iOS simulators are only available on macOS" };
    }

    const { udid } = params;
    if (!udid) {
      return { success: false, error: "Missing required parameter: udid" };
    }

    try {
      // Check if already booted
      const listResult = await handlers["list-running-simulators"]();
      if (listResult.success && listResult.simulators.some(s => s.udid === udid)) {
        return { success: true, message: `Simulator ${udid} is already booted` };
      }

      await execFileAsync("xcrun", ["simctl", "boot", udid], {
        timeout: COMMAND_TIMEOUT_MS
      });

      // Wait for simulator to fully boot
      await new Promise(resolve => setTimeout(resolve, 2000));

      return { success: true, message: `Booted simulator ${udid}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Shutdown an iOS simulator
   */
  async "shutdown-simulator"(params) {
    if (!IS_MACOS) {
      return { success: false, error: "iOS simulators are only available on macOS" };
    }

    const { udid } = params;
    if (!udid) {
      return { success: false, error: "Missing required parameter: udid" };
    }

    try {
      await execFileAsync("xcrun", ["simctl", "shutdown", udid], {
        timeout: COMMAND_TIMEOUT_MS
      });
      runningSimulators.delete(udid);
      return { success: true, message: `Shutdown simulator ${udid}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Run an arbitrary simctl command
   */
  async "simctl"(params) {
    if (!IS_MACOS) {
      return { success: false, error: "iOS simulators are only available on macOS" };
    }

    const { args = [] } = params;
    if (!Array.isArray(args)) {
      return { success: false, error: "args must be an array" };
    }

    try {
      const { stdout, stderr } = await execFileAsync("xcrun", ["simctl", ...args], {
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024 // 10MB for large outputs
      });
      return { success: true, stdout, stderr };
    } catch (error) {
      return { success: false, error: error.message, stderr: error.stderr };
    }
  },

  /**
   * Run an xcodebuild command
   */
  async "xcodebuild"(params) {
    if (!IS_MACOS) {
      return { success: false, error: "xcodebuild is only available on macOS" };
    }

    const { args = [] } = params;
    if (!Array.isArray(args)) {
      return { success: false, error: "args must be an array" };
    }

    try {
      const { stdout, stderr } = await execFileAsync("xcodebuild", args, {
        timeout: COMMAND_TIMEOUT_MS * 20, // xcodebuild can be very slow
        maxBuffer: 50 * 1024 * 1024 // 50MB for large build outputs
      });
      return { success: true, stdout, stderr };
    } catch (error) {
      return { success: false, error: error.message, stderr: error.stderr };
    }
  },

  /**
   * Get iOS tooling info
   */
  async "ios-info"() {
    if (!IS_MACOS) {
      return { success: false, error: "iOS tooling is only available on macOS", isMacOS: false };
    }

    const info = { success: true, isMacOS: true };

    try {
      const { stdout: xcodeVersion } = await execFileAsync("xcodebuild", ["-version"], { timeout: 5000 });
      info.xcodeVersion = xcodeVersion.trim();
    } catch {
      info.xcodeVersion = "Not installed";
    }

    try {
      const { stdout: simctlVersion } = await execFileAsync("xcrun", ["simctl", "--version"], { timeout: 5000 });
      info.simctlVersion = simctlVersion.trim();
    } catch {
      info.simctlVersion = "Not available";
    }

    try {
      const { stdout: developerDir } = await execFileAsync("xcode-select", ["-p"], { timeout: 5000 });
      info.developerDir = developerDir.trim();
    } catch {
      info.developerDir = "Not set";
    }

    return info;
  },

  /**
   * Ping for health check
   */
  async "ping"() {
    return { success: true, message: "pong", timestamp: Date.now(), isMacOS: IS_MACOS };
  }
};

// Handle a single request
async function handleRequest(data) {
  try {
    const request = JSON.parse(data);
    const { id, method, params = {} } = request;

    if (!method || !handlers[method]) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` }
      };
    }

    const result = await handlers[method](params);
    return {
      jsonrpc: "2.0",
      id,
      result
    };
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: `Parse error: ${error.message}` }
    };
  }
}

// Start the server
const server = net.createServer(socket => {
  console.log(`[${new Date().toISOString()}] Client connected from ${socket.remoteAddress}`);

  let buffer = "";

  socket.on("data", async data => {
    buffer += data.toString();

    // Process complete lines (newline-delimited JSON)
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      const response = await handleRequest(line);
      socket.write(JSON.stringify(response) + "\n");
    }
  });

  socket.on("end", () => {
    console.log(`[${new Date().toISOString()}] Client disconnected`);
  });

  socket.on("error", err => {
    // Sanitize error message to prevent log injection
    const safeMessage = String(err && err.message || "").replace(/[\r\n]/g, "");
    console.error(`[${new Date().toISOString()}] Socket error:`, safeMessage);
  });
});

server.listen(port, host, async () => {
  const xcodeAvailable = await isXcodeAvailable();
  const iosStatus = xcodeAvailable ? "Available" : "Not available (macOS only)";

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║          Auto-Mobile Host Control Daemon                     ║
╠══════════════════════════════════════════════════════════════╣
║  Listening on: ${host}:${port}
║  Android SDK: ${getAndroidSdk()}
║  iOS Tools: ${iosStatus}
╚══════════════════════════════════════════════════════════════╝

Android Commands:
  - ping              Health check
  - list-avds         List available Android Virtual Devices
  - start-emulator    Start an emulator (params: avd, headless, args)
  - stop-emulator     Stop an emulator (params: avd, deviceId)
  - list-running      List running Android emulators
  - avdmanager        Run avdmanager command (params: args)
  - sdkmanager        Run sdkmanager command (params: args)
  - sdk-info          Get Android SDK paths and info

iOS Commands (macOS only):
  - list-simulators        List available iOS simulators
  - list-running-simulators List booted iOS simulators
  - boot-simulator         Boot a simulator (params: udid)
  - shutdown-simulator     Shutdown a simulator (params: udid)
  - simctl                 Run simctl command (params: args)
  - xcodebuild             Run xcodebuild command (params: args)
  - ios-info               Get iOS tooling info

Press Ctrl+C to stop.
`);
});

// Handle shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");

  // Kill any emulators we started
  for (const [avd, { pid }] of runningEmulators) {
    try {
      process.kill(pid, "SIGTERM");
      console.log(`Stopped emulator ${avd} (pid ${pid})`);
    } catch {
      // Ignore errors
    }
  }

  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
