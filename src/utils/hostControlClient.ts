/**
 * Host Control Client
 *
 * Client for communicating with the host control daemon when running in Docker.
 * Enables Docker containers to control Android SDK tools and iOS simulators on the host machine.
 */

import { createConnection } from "node:net";
import { logger } from "./logger";
import { createExecResult } from "./execResult";

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

interface XCTestServiceStatus {
  running: boolean;
  pid?: number;
  port?: number;
  deviceId?: string;
  startedAt?: number;
}

interface IproxyStatus {
  running: boolean;
  pid?: number;
  deviceId?: string;
  localPort?: number;
  devicePort?: number;
}

interface DeviceAppHashResult {
  hash: string | null;
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

export async function runSimctlExec(
  args: string[]
): Promise<HostControlResult<ReturnType<typeof createExecResult>>> {
  const result = await runSimctl(args);
  if (!result.success || !result.data) {
    return { success: false, error: result.error || "simctl failed" };
  }

  return {
    success: true,
    data: createExecResult(result.data.stdout, result.data.stderr)
  };
}

/**
 * Run an xcodebuild command on the host
 */
export async function runXcodebuild(
  args: string[]
): Promise<HostControlResult<{ stdout: string; stderr: string }>> {
  return sendCommand("xcodebuild", { args });
}

export async function runXcodebuildExec(
  args: string[]
): Promise<HostControlResult<ReturnType<typeof createExecResult>>> {
  const result = await runXcodebuild(args);
  if (!result.success || !result.data) {
    return { success: false, error: result.error || "xcodebuild failed" };
  }

  return {
    success: true,
    data: createExecResult(result.data.stdout, result.data.stderr)
  };
}

/**
 * Run an xcode-select command on the host
 */
export async function runXcodeSelect(
  args: string[]
): Promise<HostControlResult<{ stdout: string; stderr: string }>> {
  return sendCommand("xcode-select", { args });
}

export async function runXcodeSelectExec(
  args: string[]
): Promise<HostControlResult<ReturnType<typeof createExecResult>>> {
  const result = await runXcodeSelect(args);
  if (!result.success || !result.data) {
    return { success: false, error: result.error || "xcode-select failed" };
  }

  return {
    success: true,
    data: createExecResult(result.data.stdout, result.data.stderr)
  };
}

/**
 * Run an xcrun command on the host
 */
export async function runXcrun(
  args: string[]
): Promise<HostControlResult<{ stdout: string; stderr: string }>> {
  return sendCommand("xcrun", { args });
}

export async function runXcrunExec(
  args: string[]
): Promise<HostControlResult<ReturnType<typeof createExecResult>>> {
  const result = await runXcrun(args);
  if (!result.success || !result.data) {
    return { success: false, error: result.error || "xcrun failed" };
  }

  return {
    success: true,
    data: createExecResult(result.data.stdout, result.data.stderr)
  };
}

/**
 * Run a security command on the host
 */
export async function runSecurity(
  args: string[]
): Promise<HostControlResult<{ stdout: string; stderr: string }>> {
  return sendCommand("security", { args });
}

export async function runSecurityExec(
  args: string[]
): Promise<HostControlResult<ReturnType<typeof createExecResult>>> {
  const result = await runSecurity(args);
  if (!result.success || !result.data) {
    return { success: false, error: result.error || "security failed" };
  }

  return {
    success: true,
    data: createExecResult(result.data.stdout, result.data.stderr)
  };
}

/**
 * Run idevice_id on the host
 */
export async function runIdeviceId(
  args: string[]
): Promise<HostControlResult<{ stdout: string; stderr: string }>> {
  return sendCommand("idevice-id", { args });
}

export async function runIdeviceIdExec(
  args: string[]
): Promise<HostControlResult<ReturnType<typeof createExecResult>>> {
  const result = await runIdeviceId(args);
  if (!result.success || !result.data) {
    return { success: false, error: result.error || "idevice_id failed" };
  }

  return {
    success: true,
    data: createExecResult(result.data.stdout, result.data.stderr)
  };
}

/**
 * Run ideviceinstaller on the host
 */
export async function runIdeviceInstaller(
  args: string[]
): Promise<HostControlResult<{ stdout: string; stderr: string }>> {
  return sendCommand("ideviceinstaller", { args });
}

export async function runIdeviceInstallerExec(
  args: string[]
): Promise<HostControlResult<ReturnType<typeof createExecResult>>> {
  const result = await runIdeviceInstaller(args);
  if (!result.success || !result.data) {
    return { success: false, error: result.error || "ideviceinstaller failed" };
  }

  return {
    success: true,
    data: createExecResult(result.data.stdout, result.data.stderr)
  };
}

/**
 * Manage iproxy on the host
 */
export async function startIproxy(params: {
  deviceId: string;
  localPort: number;
  devicePort?: number;
}): Promise<HostControlResult<{ pid: number; message: string }>> {
  return sendCommand("iproxy-start", params);
}

export async function stopIproxy(params: {
  pid?: number;
  deviceId?: string;
  localPort?: number;
  devicePort?: number;
}): Promise<HostControlResult<{ message: string }>> {
  return sendCommand("iproxy-stop", params);
}

export async function getIproxyStatus(params: {
  pid?: number;
  deviceId?: string;
  localPort?: number;
  devicePort?: number;
} = {}): Promise<HostControlResult<IproxyStatus>> {
  return sendCommand<IproxyStatus>("iproxy-status", params);
}

/**
 * Run devicectl on the host to fetch app bundle hash
 */
export async function getDeviceAppBundleHash(params: {
  deviceId: string;
  bundleId: string;
}): Promise<HostControlResult<DeviceAppHashResult>> {
  return sendCommand<DeviceAppHashResult>("devicectl-app-hash", params);
}

export async function uninstallDeviceApp(params: {
  deviceId: string;
  bundleId: string;
}): Promise<HostControlResult<{ message: string }>> {
  return sendCommand("devicectl-uninstall", params);
}

export async function startXCTestService(params: {
  deviceId: string;
  port: number;
  xctestrunPath?: string;
  bundleId?: string;
  timeoutSeconds?: number;
}): Promise<HostControlResult<{ pid: number; message: string }>> {
  return sendCommand("xctest-start", params);
}

export async function stopXCTestService(params: {
  deviceId?: string;
  pid?: number;
}): Promise<HostControlResult<{ message: string }>> {
  return sendCommand("xctest-stop", params);
}

export async function getXCTestServiceStatus(params: {
  deviceId?: string;
  pid?: number;
  port?: number;
} = {}): Promise<HostControlResult<XCTestServiceStatus>> {
  return sendCommand<XCTestServiceStatus>("xctest-status", params);
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

export function getHostControlHost(): string {
  return HOST_CONTROL_HOST;
}

export function getHostControlPort(): number {
  return HOST_CONTROL_PORT;
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
