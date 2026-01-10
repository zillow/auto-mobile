import { platform } from "node:os";

/**
 * Get the user ID for the current process
 * On Unix systems, this is the actual UID
 * On Windows, we use a fallback based on username
 */
function getUserId(): string {
  if (platform() === "win32") {
    // Windows doesn't have UIDs, use username as fallback
    return process.env.USERNAME || "default";
  }
  // Unix systems: use actual UID
  return process.getuid?.()?.toString() || "default";
}

const uid = getUserId();

/**
 * Default port for the daemon's internal HTTP server
 */
export const DEFAULT_DAEMON_PORT = 3000;

/**
 * Port range to try if default port is unavailable
 */
export const DAEMON_PORT_RANGE_START = 3000;
export const DAEMON_PORT_RANGE_END = 3010;

/**
 * Unix socket path for daemon communication
 * Per-user socket to avoid permission issues
 */
const socketPathOverride =
  process.env.AUTOMOBILE_DAEMON_SOCKET_PATH ??
  process.env.AUTO_MOBILE_DAEMON_SOCKET_PATH;
export const SOCKET_PATH =
  socketPathOverride ?? `/tmp/auto-mobile-daemon-${uid}.sock`;

/**
 * PID lock file path
 * Contains daemon process information
 */
const pidFilePathOverride =
  process.env.AUTOMOBILE_DAEMON_PID_FILE_PATH ??
  process.env.AUTO_MOBILE_DAEMON_PID_FILE_PATH;
export const PID_FILE_PATH =
  pidFilePathOverride ?? `/tmp/auto-mobile-daemon-${uid}.pid`;

/**
 * Connection timeout in milliseconds
 * How long to wait for daemon to respond
 * Increased to 30s to accommodate parallel test execution where tests may wait for device availability
 */
export const CONNECTION_TIMEOUT_MS = 30000;

/**
 * Health check interval in milliseconds
 * How often to check if daemon is still alive
 */
export const HEALTH_CHECK_INTERVAL_MS = 30000;

/**
 * Daemon startup timeout in milliseconds
 * How long to wait for daemon to become ready
 */
export const DAEMON_STARTUP_TIMEOUT_MS = 10000;

/**
 * Daemon shutdown timeout in milliseconds
 * How long to wait for graceful shutdown before SIGKILL
 */
export const DAEMON_SHUTDOWN_TIMEOUT_MS = 5000;

/**
 * MCP streamable endpoint path
 */
export const MCP_STREAMABLE_PATH = "/auto-mobile/streamable";

/**
 * Package version (read from package.json)
 * Used for version compatibility checks
 */
export const DAEMON_VERSION = "0.0.1"; // TODO: Read from package.json
