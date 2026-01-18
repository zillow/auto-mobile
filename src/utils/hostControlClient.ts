/**
 * Host Control Client
 *
 * Client for communicating with the host control daemon when running in Docker.
 * Enables Docker containers to control Android SDK tools and iOS simulators on the host machine.
 */

import { createConnection } from "node:net";
import { logger } from "./logger";

// Configuration from environment
const HOST_CONTROL_HOST = process.env.AUTOMOBILE_HOST_CONTROL_HOST || "host.docker.internal";
const HOST_CONTROL_PORT = parseInt(process.env.AUTOMOBILE_HOST_CONTROL_PORT || "15037", 10);
const CONNECT_TIMEOUT_MS = 5000;
const COMMAND_TIMEOUT_MS = 30000;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

interface HostControlResult<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

interface AvdInfo {
  avds: string[];
}

interface EmulatorInfo {
  deviceId: string;
  state: string;
}

interface SdkInfo {
  sdkRoot: string;
  emulatorPath: string;
  avdManagerPath: string;
  sdkManagerPath: string;
  adbPath: string;
}

// iOS-related interfaces
interface SimulatorInfo {
  udid: string;
  name: string;
  state: string;
  runtime?: string;
  deviceTypeIdentifier?: string;
}

interface IosInfo {
  isMacOS: boolean;
  xcodeVersion?: string;
  simctlVersion?: string;
  developerDir?: string;
}

let requestId = 0;

/**
 * Send a command to the host control daemon
 */
async function sendCommand<T>(method: string, params?: Record<string, unknown>): Promise<HostControlResult<T>> {
  return new Promise(resolve => {
    const socket = createConnection({
      host: HOST_CONTROL_HOST,
      port: HOST_CONTROL_PORT
    });

    const id = ++requestId;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    let buffer = "";
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve({ success: false, error: "Command timed out" });
    }, COMMAND_TIMEOUT_MS);

    // Set timeout for initial connection only
    socket.setTimeout(CONNECT_TIMEOUT_MS);

    socket.on("connect", () => {
      // Clear the connect timeout - command timeout handles the rest
      socket.setTimeout(0);
      socket.write(JSON.stringify(request) + "\n");
    });

    socket.on("data", data => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) {continue;}

        try {
          const response: JsonRpcResponse = JSON.parse(line);
          if (response.id === id) {
            clearTimeout(timeout);
            resolved = true;
            socket.destroy();

            if (response.error) {
              resolve({ success: false, error: response.error.message });
            } else {
              const result = response.result as { success: boolean; error?: string } & T;
              if (result.success === false) {
                resolve({ success: false, error: result.error || "Unknown error" });
              } else {
                resolve({ success: true, data: result as T });
              }
            }
          }
        } catch (e) {
          // Ignore parse errors, wait for more data
        }
      }
    });

    socket.on("timeout", () => {
      cleanup();
      clearTimeout(timeout);
      resolve({ success: false, error: "Connection timed out" });
    });

    socket.on("error", err => {
      cleanup();
      clearTimeout(timeout);
      resolve({ success: false, error: `Connection failed: ${err.message}` });
    });
  });
}

/**
 * Check if host control daemon is available
 */
export async function isHostControlAvailable(): Promise<boolean> {
  const result = await sendCommand("ping");
  return result.success;
}

/**
 * List available AVDs on the host
 */
export async function listAvds(): Promise<HostControlResult<AvdInfo>> {
  return sendCommand<AvdInfo>("list-avds");
}

/**
 * Start an emulator on the host
 */
export async function startEmulator(
  avd: string,
  options: { headless?: boolean; args?: string[] } = {}
): Promise<HostControlResult<{ message: string; pid: number }>> {
  return sendCommand("start-emulator", {
    avd,
    headless: options.headless ?? true,
    args: options.args ?? []
  });
}

/**
 * Stop an emulator on the host
 */
export async function stopEmulator(
  options: { avd?: string; deviceId?: string }
): Promise<HostControlResult<{ message: string }>> {
  return sendCommand("stop-emulator", options);
}

/**
 * List running emulators on the host
 */
export async function listRunningEmulators(): Promise<HostControlResult<{ devices: EmulatorInfo[] }>> {
  return sendCommand("list-running");
}

/**
 * Run an avdmanager command on the host
 */
export async function runAvdManager(
  args: string[]
): Promise<HostControlResult<{ stdout: string; stderr: string }>> {
  return sendCommand("avdmanager", { args });
}

/**
 * Run an sdkmanager command on the host
 */
export async function runSdkManager(
  args: string[]
): Promise<HostControlResult<{ stdout: string; stderr: string }>> {
  return sendCommand("sdkmanager", { args });
}

/**
 * Get SDK information from the host
 */
export async function getSdkInfo(): Promise<HostControlResult<SdkInfo>> {
  return sendCommand<SdkInfo>("sdk-info");
}

// ============================================================================
// iOS Simulator Commands (macOS only)
// ============================================================================

/**
 * List available iOS simulators on the host
 */
export async function listSimulators(): Promise<HostControlResult<{ simulators: SimulatorInfo[] }>> {
  return sendCommand("list-simulators");
}

/**
 * List running (booted) iOS simulators on the host
 */
export async function listRunningSimulators(): Promise<HostControlResult<{ simulators: SimulatorInfo[] }>> {
  return sendCommand("list-running-simulators");
}

/**
 * Boot an iOS simulator on the host
 */
export async function bootSimulator(udid: string): Promise<HostControlResult<{ message: string }>> {
  return sendCommand("boot-simulator", { udid });
}

/**
 * Shutdown an iOS simulator on the host
 */
export async function shutdownSimulator(udid: string): Promise<HostControlResult<{ message: string }>> {
  return sendCommand("shutdown-simulator", { udid });
}

/**
 * Run a simctl command on the host
 */
export async function runSimctl(
  args: string[]
): Promise<HostControlResult<{ stdout: string; stderr: string }>> {
  return sendCommand("simctl", { args });
}

/**
 * Run an xcodebuild command on the host
 */
export async function runXcodebuild(
  args: string[]
): Promise<HostControlResult<{ stdout: string; stderr: string }>> {
  return sendCommand("xcodebuild", { args });
}

/**
 * Get iOS tooling information from the host
 */
export async function getIosInfo(): Promise<HostControlResult<IosInfo>> {
  return sendCommand<IosInfo>("ios-info");
}

/**
 * Check if we should use host control (running in Docker with external emulator mode)
 */
export function shouldUseHostControl(): boolean {
  const externalMode = process.env.AUTOMOBILE_EMULATOR_EXTERNAL === "true";
  const hostControlEnabled = process.env.AUTOMOBILE_HOST_CONTROL_ENABLED !== "false";
  return externalMode && hostControlEnabled;
}

/**
 * Initialize host control - check connection and log status
 */
export async function initHostControl(): Promise<boolean> {
  if (!shouldUseHostControl()) {
    logger.debug("Host control not enabled (not in external emulator mode)");
    return false;
  }

  logger.info(`Checking host control daemon at ${HOST_CONTROL_HOST}:${HOST_CONTROL_PORT}...`);

  const available = await isHostControlAvailable();
  if (available) {
    const sdkInfo = await getSdkInfo();
    if (sdkInfo.success && sdkInfo.data) {
      logger.info(`Host control connected - Android SDK: ${sdkInfo.data.sdkRoot}`);
    } else {
      logger.info("Host control connected");
    }

    // Check iOS support
    const iosInfo = await getIosInfo();
    if (iosInfo.success && iosInfo.data?.isMacOS) {
      logger.info(`Host control iOS available - Xcode: ${iosInfo.data.xcodeVersion?.split("\n")[0] || "Unknown"}`);
    }
  } else {
    logger.warn(
      `Host control daemon not available at ${HOST_CONTROL_HOST}:${HOST_CONTROL_PORT}. ` +
      `Run 'node scripts/docker/host-control-daemon.js' on the host to enable emulator/simulator control.`
    );
  }

  return available;
}
