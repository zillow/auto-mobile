/**
 * Host Emulator Auto-Connect Service
 *
 * When running in external emulator mode (AUTOMOBILE_EMULATOR_EXTERNAL=true),
 * this service automatically connects ADB to host emulators via the Docker
 * host gateway (host.docker.internal on Docker Desktop).
 *
 * Features:
 * - Scans common emulator ADB ports (5555, 5557, 5559, etc.)
 * - Automatically connects to running emulators
 * - Periodically rescans for new emulators or reconnects after restarts
 * - Cleans up disconnected devices
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

// Configuration from environment
const EXTERNAL_MODE = process.env.AUTOMOBILE_EMULATOR_EXTERNAL === "true";
const HOST_GATEWAY = process.env.AUTOMOBILE_HOST_GATEWAY || "host.docker.internal";
const SCAN_INTERVAL_MS = parseInt(process.env.AUTOMOBILE_EMULATOR_SCAN_INTERVAL_MS || "10000", 10);
const EMULATOR_PORT_START = parseInt(process.env.AUTOMOBILE_EMULATOR_PORT_START || "5555", 10);
const EMULATOR_PORT_END = parseInt(process.env.AUTOMOBILE_EMULATOR_PORT_END || "5585", 10);
const CONNECT_TIMEOUT_MS = parseInt(process.env.AUTOMOBILE_EMULATOR_CONNECT_TIMEOUT_MS || "5000", 10);

// ADB server tunneling - when set, use host's ADB server instead of direct device connections
const ADB_SERVER_HOST = process.env.AUTOMOBILE_ADB_SERVER_HOST;
const ADB_SERVER_PORT = process.env.AUTOMOBILE_ADB_SERVER_PORT || "5037";
const USE_ADB_SERVER_TUNNEL = !!ADB_SERVER_HOST;

// Track connected devices and scan state
const connectedDevices = new Set<string>();
let scanInterval: ReturnType<typeof setInterval> | null = null;
let isScanning = false;
let adbPath: string | null = null;

/**
 * Get the ADB path
 */
function getAdbPath(): string {
  if (adbPath) {
    return adbPath;
  }

  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || process.env.ANDROID_SDK_HOME;
  if (androidHome) {
    adbPath = `${androidHome}/platform-tools/adb`;
  } else {
    adbPath = "adb";
  }

  return adbPath;
}

/**
 * Get base ADB args for remote server connection
 */
function getAdbServerArgs(): string[] {
  if (USE_ADB_SERVER_TUNNEL && ADB_SERVER_HOST) {
    return ["-H", ADB_SERVER_HOST, "-P", ADB_SERVER_PORT];
  }
  return [];
}

/**
 * Execute an ADB command with timeout
 */
async function execAdb(args: string[], timeoutMs: number = CONNECT_TIMEOUT_MS): Promise<{ stdout: string; stderr: string }> {
  const adb = getAdbPath();
  const fullArgs = [...getAdbServerArgs(), ...args];

  try {
    const result = await Promise.race([
      execFileAsync(adb, fullArgs),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`ADB command timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);

    return {
      stdout: typeof result.stdout === "string" ? result.stdout : result.stdout.toString(),
      stderr: typeof result.stderr === "string" ? result.stderr : result.stderr.toString()
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { stdout: "", stderr: message };
  }
}

/**
 * Get list of currently connected devices from ADB
 * Only returns devices in "device" state - offline devices are not considered connected
 * so they will be retried on the next scan
 */
async function getConnectedDevices(): Promise<Set<string>> {
  const devices = new Set<string>();

  try {
    const result = await execAdb(["devices"], 5000);
    const lines = result.stdout.split("\n").slice(1); // Skip "List of devices attached" line

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      // Only consider devices in "device" state as truly connected
      // Offline devices will be removed from connectedDevices and retried
      if (parts.length >= 2 && parts[1] === "device") {
        devices.add(parts[0]);
      }
    }
  } catch (error) {
    logger.debug(`Failed to get device list: ${error}`);
  }

  return devices;
}

/**
 * Try to connect to an emulator at the given host:port
 */
async function tryConnect(host: string, port: number): Promise<boolean> {
  const target = `${host}:${port}`;

  // Skip if already connected
  if (connectedDevices.has(target)) {
    return true;
  }

  try {
    const result = await execAdb(["connect", target], CONNECT_TIMEOUT_MS);
    const output = result.stdout + result.stderr;

    if (output.includes("connected to") || output.includes("already connected")) {
      logger.info(`Connected to host emulator at ${target}`);
      connectedDevices.add(target);
      return true;
    }

    // Connection refused or failed - this is expected for ports without emulators
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Disconnect from a device
 */
export async function disconnectDevice(target: string): Promise<void> {
  try {
    await execAdb(["disconnect", target], 2000);
    connectedDevices.delete(target);
    logger.debug(`Disconnected from ${target}`);
  } catch (error) {
    logger.debug(`Failed to disconnect from ${target}: ${error}`);
  }
}

/**
 * Scan for and connect to host emulators
 */
async function scanAndConnect(): Promise<void> {
  if (isScanning) {
    return;
  }

  isScanning = true;

  try {
    // Get current device list to detect disconnections
    const currentDevices = await getConnectedDevices();

    // Remove devices that are no longer connected
    for (const device of connectedDevices) {
      if (!currentDevices.has(device)) {
        logger.debug(`Device ${device} disconnected, removing from tracked list`);
        connectedDevices.delete(device);
      }
    }

    // Scan emulator ports (odd ports: 5555, 5557, 5559, etc.)
    const connectPromises: Promise<void>[] = [];

    for (let port = EMULATOR_PORT_START; port <= EMULATOR_PORT_END; port += 2) {
      // Skip ports we're already connected to
      const target = `${HOST_GATEWAY}:${port}`;
      if (connectedDevices.has(target)) {
        continue;
      }

      connectPromises.push(
        tryConnect(HOST_GATEWAY, port).then(connected => {
          if (connected) {
            logger.debug(`Successfully connected to emulator on port ${port}`);
          }
        })
      );
    }

    // Wait for all connection attempts with a global timeout
    await Promise.race([
      Promise.allSettled(connectPromises),
      new Promise<void>(resolve => setTimeout(resolve, 30000)) // 30s max scan time
    ]);

  } catch (error) {
    logger.debug(`Scan error: ${error}`);
  } finally {
    isScanning = false;
  }
}

/**
 * Check if running in a Docker container
 */
function isRunningInDocker(): boolean {
  try {
    const fs = require("fs");
    // Check for Docker-specific files
    if (fs.existsSync("/.dockerenv")) {
      return true;
    }
    // Check cgroup for docker
    const cgroup = fs.readFileSync("/proc/1/cgroup", "utf8");
    return cgroup.includes("docker") || cgroup.includes("containerd");
  } catch {
    return false;
  }
}

/**
 * Start the auto-connect service
 *
 * This should be called during server startup when AUTOMOBILE_EMULATOR_EXTERNAL=true
 *
 * Two modes:
 * 1. ADB Server Tunnel (AUTOMOBILE_ADB_SERVER_HOST set): Uses host's ADB server directly,
 *    no need to connect to individual devices - they're already visible via the server.
 * 2. Direct Connect (default): Scans and connects to emulator ports via host gateway.
 */
export async function startHostEmulatorAutoConnect(): Promise<void> {
  if (!EXTERNAL_MODE) {
    logger.debug("External emulator mode not enabled, skipping auto-connect service");
    return;
  }

  // Only run auto-connect in Docker containers
  if (!isRunningInDocker()) {
    logger.debug("Not running in Docker, skipping auto-connect service");
    return;
  }

  // ADB Server Tunnel mode - devices are visible via host's ADB server
  if (USE_ADB_SERVER_TUNNEL) {
    logger.info(`Using ADB server tunnel to ${ADB_SERVER_HOST}:${ADB_SERVER_PORT}`);

    // Verify connection to host ADB server
    const result = await execAdb(["devices"], 5000);
    if (result.stderr && !result.stdout.includes("List of devices")) {
      logger.warn(`Failed to connect to ADB server at ${ADB_SERVER_HOST}:${ADB_SERVER_PORT}: ${result.stderr}`);
    } else {
      const deviceCount = result.stdout.split("\n").filter(line => line.includes("\tdevice")).length;
      logger.info(`ADB server tunnel active, ${deviceCount} device(s) visible`);
    }

    // No periodic scanning needed - devices are visible through the server
    return;
  }

  // Direct connect mode - scan and connect to emulator ports
  logger.info(`Starting host emulator auto-connect service (gateway: ${HOST_GATEWAY}, interval: ${SCAN_INTERVAL_MS}ms)`);

  // Initial scan
  await scanAndConnect();

  // Start periodic scanning
  scanInterval = setInterval(() => {
    scanAndConnect().catch(error => {
      logger.debug(`Periodic scan failed: ${error}`);
    });
  }, SCAN_INTERVAL_MS);

  // Don't keep the process alive just for this interval
  if (scanInterval.unref) {
    scanInterval.unref();
  }
}

/**
 * Stop the auto-connect service
 */
export async function stopHostEmulatorAutoConnect(): Promise<void> {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }

  // Optionally disconnect from all devices
  // (Usually we want to leave connections intact for graceful shutdown)
  logger.debug("Host emulator auto-connect service stopped");
}

/**
 * Get the current status of auto-connect service
 */
export function getAutoConnectStatus(): {
  enabled: boolean;
  running: boolean;
  mode: "adb-server-tunnel" | "direct-connect" | "disabled";
  connectedDevices: string[];
  hostGateway: string;
  adbServerHost: string | null;
  adbServerPort: string | null;
  scanIntervalMs: number;
  } {
  let mode: "adb-server-tunnel" | "direct-connect" | "disabled" = "disabled";
  if (EXTERNAL_MODE) {
    mode = USE_ADB_SERVER_TUNNEL ? "adb-server-tunnel" : "direct-connect";
  }

  return {
    enabled: EXTERNAL_MODE,
    running: scanInterval !== null || USE_ADB_SERVER_TUNNEL,
    mode,
    connectedDevices: Array.from(connectedDevices),
    hostGateway: HOST_GATEWAY,
    adbServerHost: ADB_SERVER_HOST || null,
    adbServerPort: USE_ADB_SERVER_TUNNEL ? ADB_SERVER_PORT : null,
    scanIntervalMs: SCAN_INTERVAL_MS
  };
}

/**
 * Manually trigger a scan (useful for testing or on-demand refresh)
 */
export async function triggerScan(): Promise<string[]> {
  await scanAndConnect();
  return Array.from(connectedDevices);
}
