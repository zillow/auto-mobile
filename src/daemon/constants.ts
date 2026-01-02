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
export const DEFAULT_DAEMON_PORT = 9001;

/**
 * Port range to try if default port is unavailable
 */
export const DAEMON_PORT_RANGE_START = 9001;
export const DAEMON_PORT_RANGE_END = 9010;

/**
 * Unix socket path for daemon communication
 * Per-user socket to avoid permission issues
 */
export const SOCKET_PATH = `/tmp/auto-mobile-daemon-${uid}.sock`;

/**
 * PID lock file path
 * Contains daemon process information
 */
export const PID_FILE_PATH = `/tmp/auto-mobile-daemon-${uid}.pid`;

/**
 * Connection timeout in milliseconds
 * How long to wait for daemon to respond
 */
export const CONNECTION_TIMEOUT_MS = 5000;

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
