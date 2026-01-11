import { createServer as createHttpServer, Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "../server";
import { logger } from "../utils/logger";
import { MultiPlatformDeviceManager } from "../utils/deviceUtils";
import { UnixSocketServer } from "./socketServer";
import { SessionManager } from "./sessionManager";
import { DevicePool } from "./devicePool";
import { DaemonState } from "./daemonState";
import {
  DEFAULT_DAEMON_PORT,
  SOCKET_PATH,
  MCP_STREAMABLE_PATH,
  DAEMON_PORT_RANGE_START,
  DAEMON_PORT_RANGE_END,
} from "./constants";
import { DaemonOptions, PidFileData } from "./types";
import { writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { PID_FILE_PATH, DAEMON_VERSION } from "./constants";
import { executionTracker } from "../server/executionTracker";
import { closeDatabase, getDatabase } from "../db";
import { startupBenchmark } from "../utils/startupBenchmark";
import { startVideoRecordingSocketServer, stopVideoRecordingSocketServer } from "./videoRecordingSocketServer";
import { startTestRecordingSocketServer, stopTestRecordingSocketServer } from "./testRecordingSocketServer";

/**
 * Main daemon process
 *
 * Combines:
 * - MCP server in Streamable HTTP mode
 * - Unix socket server for CLI communication
 * - PID file management
 * - Graceful shutdown handling
 */
export class Daemon {
  private httpServer: HttpServer | null = null;
  private socketServer: UnixSocketServer | null = null;
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();
  private port: number;
  private host: string;
  private debug: boolean;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private heartbeatMonitorTimer: NodeJS.Timeout | null = null;
  private sessionManager: SessionManager;
  private devicePool: DevicePool;

  constructor(options: DaemonOptions = {}) {
    this.port = options.port || DEFAULT_DAEMON_PORT;
    this.host = options.host || "localhost";
    this.debug = options.debug || false;
    this.sessionManager = new SessionManager();
    this.devicePool = new DevicePool(this.sessionManager);
    // Initialize singleton for daemon state access
    DaemonState.getInstance().initialize(this.sessionManager, this.devicePool);
  }

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    // Enable stdout logging in daemon mode so logs appear in daemon.log file
    // (daemon's stdout/stderr are redirected to /tmp/auto-mobile-daemon-XXXXXX/daemon.log)
    logger.enableStdoutLogging();

    logger.info("Starting AutoMobile daemon...");

    this.initializeDatabase();

    // Find an available port
    this.port = await this.findAvailablePort(this.port);

    // Start HTTP MCP server
    startupBenchmark.startPhase("httpServerStart");
    await this.startHttpServer();
    startupBenchmark.endPhase("httpServerStart");

    // Initialize device pool BEFORE starting socket server
    // This ensures clients connecting via socket will see initialized device pool
    // Wait up to 10 seconds - emulators should already be running
    logger.info("Initializing device pool...");
    startupBenchmark.startPhase("deviceDiscovery");
    await this.initializeDevicePoolWithTimeout(10000);
    startupBenchmark.endPhase("deviceDiscovery");

    // Start Unix socket server AFTER device pool is ready
    logger.info(`Daemon host: "${this.host}", port: ${this.port}`);
    logger.info(`MCP_STREAMABLE_PATH: "${MCP_STREAMABLE_PATH}"`);
    const mcpEndpoint = `http://${this.host}:${this.port}${MCP_STREAMABLE_PATH}`;
    logger.info(`Creating UnixSocketServer with endpoint: "${mcpEndpoint}"`);
    this.socketServer = new UnixSocketServer(SOCKET_PATH, mcpEndpoint);
    logger.info("Starting Unix socket server...");
    startupBenchmark.startPhase("socketServerStart");
    await this.socketServer.start();
    startupBenchmark.endPhase("socketServerStart");
    logger.info("Unix socket server started");

    await startVideoRecordingSocketServer();
    await startTestRecordingSocketServer();

    // Write PID file
    await this.writePidFile();

    // Verify DaemonState is initialized
    const isInitialized = DaemonState.getInstance().isInitialized();
    logger.info(`DaemonState initialized: ${isInitialized}, device count: ${this.devicePool.getTotalDeviceCount()}`);

    // Setup shutdown handlers
    this.setupShutdownHandlers();

    // Start health check timer (every 30 seconds)
    this.startHealthCheckTimer();
    this.startHeartbeatMonitor();

    startupBenchmark.emit("daemon", {
      host: this.host,
      port: this.port,
      socketPath: SOCKET_PATH,
      deviceCount: this.devicePool.getTotalDeviceCount(),
    });

    logger.info(
      `Daemon started: PID ${process.pid}, socket ${SOCKET_PATH}, HTTP port ${this.port}`
    );
  }

  /**
   * Find an available port in the configured range
   */
  private async findAvailablePort(preferredPort: number): Promise<number> {
    // Try preferred port first (faster path)
    if (await this.isPortAvailable(preferredPort)) {
      return preferredPort;
    }

    // If preferred port fails, try a few alternatives
    for (let i = 1; i <= 3; i++) {
      const port = preferredPort + i;
      if (port <= DAEMON_PORT_RANGE_END && await this.isPortAvailable(port)) {
        return port;
      }
    }

    throw new Error(
      `No available ports in range ${DAEMON_PORT_RANGE_START}-${DAEMON_PORT_RANGE_END}`
    );
  }

  /**
   * Check if a port is available
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise(resolve => {
      const testServer = createHttpServer();
      let resolved = false;

      // Timeout safety - prevent hanging forever
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          testServer.close(() => {
            // Ignore error in close
          });
          resolve(false); // Assume port is unavailable if timeout
        }
      }, 1000); // 1s timeout per port check

      testServer.once("error", () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(false);
        }
      });

      testServer.listen(port, this.host, () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          testServer.close(() => {
            resolve(true);
          });
        }
      });
    });
  }

  /**
   * Start the HTTP MCP server
   * Based on startStreamableServer() from src/index.ts
   */
  private async startHttpServer(): Promise<void> {
    this.httpServer = createHttpServer();

    this.httpServer.on("request", async (req, res) => {
      // CORS headers for development
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, DELETE, OPTIONS"
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, MCP-Session-Id"
      );

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      const url = new URL(req.url!, `http://${req.headers.host}`);

      if (url.pathname === "/heartbeat") {
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        let body = "";
        req.on("data", chunk => {
          body += chunk.toString();
        });

        await new Promise<void>(resolve => {
          req.on("end", resolve);
        });

        let payload: { sessionId?: string } | null = null;
        try {
          payload = JSON.parse(body);
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON" }));
          return;
        }

        const sessionId = payload?.sessionId;
        if (!sessionId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing sessionId" }));
          return;
        }

        this.sessionManager.recordHeartbeat(sessionId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (url.pathname === MCP_STREAMABLE_PATH) {
        // Get session ID from header
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        let streamableTransport: StreamableHTTPServerTransport;
        let parsedBody: unknown;

        // Parse body for POST requests
        if (req.method === "POST") {
          let body = "";
          req.on("data", chunk => {
            body += chunk.toString();
          });

          await new Promise<void>(resolve => {
            req.on("end", resolve);
          });

          try {
            parsedBody = JSON.parse(body);
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
            return;
          }
        }

        // Check if this is an initialization request
        const isInitializeRequest =
          parsedBody &&
          typeof parsedBody === "object" &&
          true &&
          "method" in parsedBody &&
          parsedBody.method === "initialize";
        const sendJsonRpcError = (message: string, error?: unknown) => {
          if (res.headersSent) {
            return;
          }
          const id =
            parsedBody &&
            typeof parsedBody === "object" &&
            "id" in parsedBody
              ? parsedBody.id
              : null;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            id,
            error: {
              code: -32603,
              message,
              data: error instanceof Error ? error.message : undefined
            }
          }));
        };

        if (sessionId && this.transports.has(sessionId)) {
          // Use existing transport
          streamableTransport = this.transports.get(sessionId)!;
        } else if (isInitializeRequest || !sessionId) {
          // Create new transport for initialization or when no session ID
          const sessionContext: { sessionId?: string } = {};
          streamableTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: newSessionId => {
              this.transports.set(newSessionId, streamableTransport);
              sessionContext.sessionId = newSessionId;
              logger.info(
                `Streamable HTTP session initialized: ${newSessionId}`
              );
            },
          });

          // Create and connect MCP server
          let mcpServer;
          try {
            mcpServer = createMcpServer({
              debug: this.debug,
              sessionContext,
              daemonMode: true
            });
          } catch (error) {
            logger.error("Failed to create MCP server:", error);
            sendJsonRpcError("Server error", error);
            return;
          }

          // Setup cleanup handlers
          streamableTransport.onclose = async () => {
            if (streamableTransport.sessionId) {
              const cancelled = await executionTracker.cancelSessionExecutions(streamableTransport.sessionId);
              this.transports.delete(streamableTransport.sessionId);
              logger.info(
                `Streamable HTTP session closed: ${streamableTransport.sessionId} (cancelled ${cancelled} executions)`
              );
            }
          };

          streamableTransport.onerror = async error => {
            if (streamableTransport.sessionId) {
              logger.error(
                `Streamable HTTP transport error for session ${streamableTransport.sessionId}:`,
                error
              );
              await executionTracker.cancelSessionExecutions(streamableTransport.sessionId);
              this.transports.delete(streamableTransport.sessionId);
            }
          };

          try {
            logger.info("Connecting MCP server to Streamable HTTP transport");
            await mcpServer.connect(streamableTransport);
            logger.info("MCP server connected to Streamable HTTP transport");
          } catch (error) {
            logger.error("MCP server connect failed:", error);
            sendJsonRpcError("Server error", error);
            return;
          }
        } else {
          // Invalid session
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Session not found" }));
          return;
        }

        // Let the transport handle the request
        try {
          await streamableTransport.handleRequest(req, res, parsedBody);
        } catch (error) {
          logger.error("Streamable HTTP request handling failed:", error);
          sendJsonRpcError("Server error", error);
        }
      } else {
        // 404 for unknown paths
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      }
    });

    // Start HTTP server
    return new Promise((resolve, reject) => {
      this.httpServer!.listen(this.port, this.host, () => {
        logger.info(
          `automobile:${this.host}:${this.port}${MCP_STREAMABLE_PATH}`
        );
        resolve();
      });

      this.httpServer!.on("error", error => {
        logger.error(`HTTP server error: ${error}`);
        reject(error);
      });
    });
  }

  /**
   * Write PID file with daemon metadata
   */
  private async writePidFile(): Promise<void> {
    const pidData: PidFileData = {
      pid: process.pid,
      socketPath: SOCKET_PATH,
      port: this.port,
      startedAt: Date.now(),
      version: DAEMON_VERSION,
    };

    await writeFile(PID_FILE_PATH, JSON.stringify(pidData, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
    logger.info(`PID file written to ${PID_FILE_PATH}`);
  }

  /**
   * Remove PID file
   */
  private async removePidFile(): Promise<void> {
    if (existsSync(PID_FILE_PATH)) {
      await unlink(PID_FILE_PATH);
      logger.info(`PID file removed: ${PID_FILE_PATH}`);
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheckTimer(): void {
    const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
    const MAX_FAILED_CHECKS = 3; // Allow 3 consecutive failures before taking action
    let failedCheckCount = 0;

    this.healthCheckTimer = setInterval(async () => {
      try {
        // Check if HTTP server is responsive
        if (!this.httpServer) {
          logger.warn("Health check failed: HTTP server not initialized");
          failedCheckCount++;
        } else if (!this.httpServer.listening) {
          logger.warn("Health check failed: HTTP server not listening");
          failedCheckCount++;
        } else {
          // Check if socket server is active
          if (!this.socketServer || !this.socketServer.isListening()) {
            logger.warn("Health check failed: Socket server not listening");
            failedCheckCount++;
          } else {
            // Health check passed
            failedCheckCount = 0;
            logger.debug("Health check passed");
          }
        }

        // If too many failures, attempt recovery
        if (failedCheckCount >= MAX_FAILED_CHECKS) {
          logger.error(`Health check failed ${failedCheckCount} times, attempting recovery...`);
          await this.attemptRecovery();
          failedCheckCount = 0;
        }
      } catch (error) {
        logger.warn(`Health check error: ${error}`);
        failedCheckCount++;
      }
    }, HEALTH_CHECK_INTERVAL);

    // Keep timer alive even if there are no other references
    this.healthCheckTimer.unref();
  }

  /**
   * Start periodic heartbeat checks to cancel stale sessions
   */
  private startHeartbeatMonitor(): void {
    const HEARTBEAT_CHECK_INTERVAL_MS = 10000;
    const INITIAL_HEARTBEAT_GRACE_MS = 20_000;

    this.heartbeatMonitorTimer = setInterval(async () => {
      const now = Date.now();
      const sessions = this.sessionManager.getAllSessions();

      for (const session of sessions) {
        if (!session.hasReceivedHeartbeat && now - session.createdAt < INITIAL_HEARTBEAT_GRACE_MS) {
          continue;
        }
        if (executionTracker.hasActiveSessionUuidExecutions(session.sessionId)) {
          continue;
        }
        const timeoutMs = session.heartbeatTimeoutMs ?? SessionManager.DEFAULT_HEARTBEAT_TIMEOUT_MS;
        const lastHeartbeat = session.lastHeartbeat ?? session.lastUsedAt;
        if (now - lastHeartbeat > timeoutMs) {
          logger.warn(`Session ${session.sessionId} heartbeat timeout, cancelling`);
          await this.cancelAndReleaseSession(session.sessionId);
        }
      }
    }, HEARTBEAT_CHECK_INTERVAL_MS);

    this.heartbeatMonitorTimer.unref();
  }

  private async cancelAndReleaseSession(sessionId: string): Promise<void> {
    const cancelled = await executionTracker.cancelSessionUuidExecutions(sessionId);
    const deviceId = await this.sessionManager.releaseSession(sessionId);
    if (deviceId) {
      await this.devicePool.releaseDevice(deviceId);
    }
    logger.info(`Cancelled session ${sessionId} (${cancelled} executions) and released device ${deviceId ?? "unknown"}`);
  }

  /**
   * Attempt to recover daemon components
   */
  private async attemptRecovery(): Promise<void> {
    try {
      logger.info("Attempting daemon recovery...");

      // Try to restart socket server if it's not responding
      if (this.socketServer && !this.socketServer.isListening()) {
        logger.info("Restarting socket server...");
        try {
          await this.socketServer.close();
        } catch (error) {
          logger.warn(`Error closing socket server during recovery: ${error}`);
        }

        // Recreate socket server
        const mcpEndpoint = `http://${this.host}:${this.port}${MCP_STREAMABLE_PATH}`;
        this.socketServer = new UnixSocketServer(SOCKET_PATH, mcpEndpoint);
        try {
          await this.socketServer.start();
          logger.info("Socket server restarted successfully");
        } catch (error) {
          logger.error(`Failed to restart socket server: ${error}`);
        }
      }
    } catch (error) {
      logger.error(`Recovery attempt failed: ${error}`);
    }
  }

  /**
   * Initialize device pool with timeout
   * Waits for device discovery with configurable timeout
   */
  private async initializeDevicePoolWithTimeout(timeoutMs: number): Promise<void> {
    const timeoutPromise = new Promise<void>(resolve => {
      setTimeout(() => {
        logger.warn(`Device pool initialization timed out after ${timeoutMs}ms`);
        resolve();
      }, timeoutMs);
    });

    const initPromise = this.initializeDevicePool();

    // Race between initialization and timeout
    await Promise.race([initPromise, timeoutPromise]);

    // Log final device pool status
    const deviceCount = this.devicePool.getTotalDeviceCount();
    if (deviceCount === 0) {
      logger.warn("Device pool is empty after initialization.");
      logger.warn("Tests will fail until devices are available.");
      logger.warn("Start an emulator or connect a physical device, then restart the daemon.");
    } else {
      logger.info(`Device pool ready with ${deviceCount} device(s)`);
    }
  }

  /**
   * Initialize device pool with discovered devices
   */
  private async initializeDevicePool(): Promise<void> {
    try {
      const deviceManager = new MultiPlatformDeviceManager();
      const bootedDevices = await deviceManager.getBootedDevices("android");

      const deviceIds = bootedDevices.map(d => d.deviceId);

      if (deviceIds.length > 0) {
        await this.devicePool.initializeWithDevices(deviceIds);
        logger.info(`Device pool initialized with ${deviceIds.length} devices: ${deviceIds.join(", ")}`);
      } else {
        logger.warn("No devices detected during daemon startup. Device pool is empty.");
        logger.warn("Start an emulator or connect a physical device before creating sessions.");
      }
    } catch (error) {
      logger.error(`Failed to initialize device pool: ${error}`);
      // Continue daemon startup even if device discovery fails
      // Tools will handle "no devices" errors when sessions are created
    }
  }

  private initializeDatabase(): void {
    try {
      getDatabase();
    } catch (error) {
      logger.error(`Failed to initialize database: ${error}`);
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down daemon...`);
      await this.stop();
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }

  /**
   * Stop the daemon gracefully
   */
  async stop(): Promise<void> {
    logger.info("Stopping daemon...");

    // Clear health check timer
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    if (this.heartbeatMonitorTimer) {
      clearInterval(this.heartbeatMonitorTimer);
      this.heartbeatMonitorTimer = null;
    }

    // Close Unix socket server
    if (this.socketServer) {
      await this.socketServer.close();
    }

    await stopVideoRecordingSocketServer();
    await stopTestRecordingSocketServer();

    // Close all active HTTP sessions
    for (const [sessionId, streamableTransport] of this.transports) {
      try {
        await streamableTransport.close();
      } catch (error) {
        logger.warn(
          `Error closing Streamable HTTP session ${sessionId}:`,
          error
        );
      }
    }
    this.transports.clear();

    // Close HTTP server
    if (this.httpServer) {
      await new Promise<void>(resolve => {
        this.httpServer!.close(() => {
          logger.info("HTTP server stopped");
          resolve();
        });
      });
    }

    // Remove PID file
    await this.removePidFile();

    await closeDatabase();

    logger.info("Daemon stopped");
    logger.close();
  }

  /**
   * Get the SessionManager instance
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Get the DevicePool instance
   */
  getDevicePool(): DevicePool {
    return this.devicePool;
  }
}

/**
 * Start the daemon process
 */
export async function startDaemon(options: DaemonOptions = {}): Promise<void> {
  const daemon = new Daemon(options);
  await daemon.start();
}
