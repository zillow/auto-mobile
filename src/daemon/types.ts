/**
 * Request sent from CLI client to daemon
 */
export interface DaemonRequest {
  /** Unique request ID for tracking */
  id: string;
  /** Request type */
  type: "mcp_request" | "daemon_request";
  /** MCP or daemon method name (e.g., "tools/call", "daemon/availableDevices") */
  method: string;
  /** MCP or daemon method parameters */
  params: any;
  /** Request timeout in milliseconds (optional, defaults to MCP SDK default of 60000) */
  timeoutMs?: number;
}

/**
 * Response sent from daemon to CLI client
 */
export interface DaemonResponse {
  /** Request ID this response corresponds to */
  id: string;
  /** Response type */
  type: "mcp_response";
  /** Whether the request was successful */
  success: boolean;
  /** Result data if successful */
  result?: any;
  /** Error message if unsuccessful */
  error?: string;
}

/**
 * Daemon status information
 */
export interface DaemonStatus {
  /** Whether daemon is running */
  running: boolean;
  /** Process ID if running */
  pid?: number;
  /** HTTP port daemon is listening on */
  port?: number;
  /** Unix socket path */
  socketPath?: string;
  /** Timestamp when daemon was started */
  startedAt?: number;
  /** Daemon version */
  version?: string;
}

/**
 * PID file contents
 */
export interface PidFileData {
  /** Process ID */
  pid: number;
  /** Unix socket path */
  socketPath: string;
  /** HTTP port */
  port: number;
  /** Timestamp when daemon was started */
  startedAt: number;
  /** Daemon version */
  version: string;
}

/**
 * Options for starting the daemon
 */
export interface DaemonOptions {
  /** HTTP port for internal MCP server */
  port?: number;
  /** Host for internal MCP server */
  host?: string;
  /** Enable debug mode */
  debug?: boolean;
  /** Enable debug performance tracking */
  debugPerf?: boolean;
  /** Plan execution lock scope (session or global) */
  planExecutionLockScope?: "session" | "global";
  /** Default video quality preset */
  videoQualityPreset?: string;
  /** Default video target bitrate in Kbps */
  videoTargetBitrateKbps?: number;
  /** Default video max throughput in Mbps */
  videoMaxThroughputMbps?: number;
  /** Default video FPS */
  videoFps?: number;
  /** Default video format */
  videoFormat?: string;
  /** Default video archive size limit in MB */
  videoMaxArchiveSizeMb?: number;
  /** Enable network mocking */
  networkMockable?: boolean;
  /** Disable UI performance mode */
  noUiPerfMode?: boolean;
  /** Enable memory performance audit */
  memPerfAudit?: boolean;
  /** Enable accessibility audit */
  accessibilityAudit?: boolean;
  /** Accessibility audit level */
  accessibilityLevel?: string;
  /** Accessibility audit failure mode */
  accessibilityFailureMode?: string;
  /** Accessibility audit minimum severity */
  accessibilityMinSeverity?: string;
  /** Accessibility audit use baseline */
  accessibilityUseBaseline?: boolean;
  /** Enable predictive UI */
  predictiveUi?: boolean;
  /** Enable raw element search */
  rawElementSearch?: boolean;
  /** Skip CtrlProxy download */
  skipCtrlProxyDownload?: boolean;
}

/**
 * Session context for a connected CLI client
 */
export interface SessionContext {
  /** Unique session ID */
  sessionId: string;
  /** Timestamp when session was created */
  createdAt: number;
  /** Queue of pending requests for this session */
  requestQueue: Array<() => Promise<any>>;
  /** Whether a request is currently being processed */
  processing: boolean;
}
