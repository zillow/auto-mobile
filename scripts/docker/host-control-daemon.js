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
const fs = require("fs");

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
const runningXCTestServices = new Map(); // deviceId -> { pid, process, port, startedAt, deviceId }

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function findXctestrunPath(requestedPath) {
  if (requestedPath && fs.existsSync(requestedPath)) {
    return requestedPath;
  }

  const cacheDir = path.join(os.homedir(), ".automobile", "xctestservice");
  if (!fs.existsSync(cacheDir)) {
    return null;
  }

  const stack = [{ dir: cacheDir, depth: 3 }];
  while (stack.length > 0) {
    const { dir, depth } = stack.pop();
    if (depth < 0) continue;

    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".xctestrun")) {
        return entryPath;
      }
      if (entry.isDirectory()) {
        stack.push({ dir: entryPath, depth: depth - 1 });
      }
    }
  }

  return null;
}

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
   * Start XCTestService via xcodebuild on the host
   */
  async "xctest-start"(params) {
    if (!IS_MACOS) {
      return { success: false, error: "XCTestService is only available on macOS" };
    }

    const { deviceId, port, xctestrunPath, bundleId, timeoutSeconds } = params;
    if (!deviceId || !port) {
      return { success: false, error: "deviceId and port are required" };
    }

    const existing = runningXCTestServices.get(deviceId);
    if (existing && isProcessRunning(existing.pid)) {
      return { success: true, pid: existing.pid, message: "XCTestService already running" };
    }

    const resolvedXctestrunPath = findXctestrunPath(xctestrunPath);
    const args = [];
    if (resolvedXctestrunPath) {
      args.push(
        "test-without-building",
        "-xctestrun",
        resolvedXctestrunPath
      );
    } else {
      const projectRoot = path.resolve(__dirname, "..", "..");
      const projectPath = path.join(projectRoot, "ios", "XCTestService", "XCTestService.xcodeproj");
      args.push(
        "test",
        "-project",
        projectPath,
        "-scheme",
        "XCTestServiceApp"
      );
    }

    args.push(
      "-destination",
      `id=${deviceId}`,
      "-only-testing:XCTestServiceUITests/XCTestServiceUITests/testRunService",
      `XCTESTSERVICE_PORT=${port}`
    );

    if (bundleId) {
      args.push(`XCTESTSERVICE_BUNDLE_ID=${bundleId}`);
    }
    if (timeoutSeconds) {
      args.push(`XCTESTSERVICE_TIMEOUT=${timeoutSeconds}`);
    }

    try {
      const child = spawn("xcodebuild", args, { stdio: ["ignore", "pipe", "pipe"] });
      if (!child.pid) {
        return { success: false, error: "Failed to start xcodebuild (no PID)" };
      }

      const entry = { pid: child.pid, process: child, port, startedAt: Date.now(), deviceId };
      runningXCTestServices.set(deviceId, entry);

      child.on("exit", () => {
        runningXCTestServices.delete(deviceId);
      });

      return { success: true, pid: child.pid, message: "XCTestService started" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Stop XCTestService on the host
   */
  async "xctest-stop"(params) {
    if (!IS_MACOS) {
      return { success: false, error: "XCTestService is only available on macOS" };
    }

    const { deviceId, pid } = params || {};
    let targetEntry = null;
    if (deviceId && runningXCTestServices.has(deviceId)) {
      targetEntry = runningXCTestServices.get(deviceId);
    } else if (pid) {
      for (const entry of runningXCTestServices.values()) {
        if (entry.pid === pid) {
          targetEntry = entry;
          break;
        }
      }
    }

    if (!targetEntry) {
      return { success: false, error: "XCTestService process not found" };
    }

    try {
      process.kill(targetEntry.pid);
      runningXCTestServices.delete(deviceId || targetEntry.deviceId);
      return { success: true, message: `Stopped XCTestService pid ${targetEntry.pid}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Check XCTestService status on the host
   */
  async "xctest-status"(params) {
    if (!IS_MACOS) {
      return { success: false, error: "XCTestService is only available on macOS" };
    }

    const { deviceId, pid, port } = params || {};
    let entry = null;

    if (deviceId && runningXCTestServices.has(deviceId)) {
      entry = runningXCTestServices.get(deviceId);
    } else if (pid) {
      for (const item of runningXCTestServices.values()) {
        if (item.pid === pid) {
          entry = item;
          break;
        }
      }
    } else if (port) {
      for (const item of runningXCTestServices.values()) {
        if (item.port === port) {
          entry = item;
          break;
        }
      }
    }

    if (!entry) {
      return { success: true, running: false };
    }

    const running = isProcessRunning(entry.pid);
    if (!running) {
      if (deviceId) {
        runningXCTestServices.delete(deviceId);
      }
      return { success: true, running: false };
    }

    return {
      success: true,
      running: true,
      pid: entry.pid,
      port: entry.port,
      deviceId: entry.deviceId,
      startedAt: entry.startedAt
    };
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
  - xctest-start           Start XCTestService (params: deviceId, port, xctestrunPath, bundleId, timeoutSeconds)
  - xctest-stop            Stop XCTestService (params: deviceId or pid)
  - xctest-status          Check XCTestService status (params: deviceId, pid, port)
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

  // Kill any XCTestService processes we started
  for (const [deviceId, { pid }] of runningXCTestServices) {
    try {
      process.kill(pid, "SIGTERM");
      console.log(`Stopped XCTestService for ${deviceId} (pid ${pid})`);
    } catch {
      // Ignore errors
    }
  }

  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
