import { createServer as createHttpServer, Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "../server";
import { logger } from "../utils/logger";
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
    logger.info("Starting AutoMobile daemon...");

    // Find an available port
    this.port = await this.findAvailablePort(this.port);

    // Start HTTP MCP server
    await this.startHttpServer();

    // Start Unix socket server
    const mcpEndpoint = `http://${this.host}:${this.port}${MCP_STREAMABLE_PATH}`;
    this.socketServer = new UnixSocketServer(SOCKET_PATH, mcpEndpoint);
    await this.socketServer.start();

    // Write PID file
    await this.writePidFile();

    // Setup shutdown handlers
    this.setupShutdownHandlers();

    // Start health check timer (every 30 seconds)
    this.startHealthCheckTimer();

    logger.info(
      `Daemon started: PID ${process.pid}, socket ${SOCKET_PATH}, HTTP port ${this.port}`
    );
  }

  /**
   * Find an available port in the configured range
   */
  private async findAvailablePort(preferredPort: number): Promise<number> {
    for (
      let port = preferredPort;
      port <= DAEMON_PORT_RANGE_END && port >= DAEMON_PORT_RANGE_START;
      port++
    ) {
      if (await this.isPortAvailable(port)) {
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
      testServer.once("error", () => {
        resolve(false);
      });
      testServer.listen(port, this.host, () => {
        testServer.close(() => {
          resolve(true);
        });
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

        if (sessionId && this.transports.has(sessionId)) {
          // Use existing transport
          streamableTransport = this.transports.get(sessionId)!;
        } else if (isInitializeRequest || !sessionId) {
          // Create new transport for initialization or when no session ID
          streamableTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: newSessionId => {
              this.transports.set(newSessionId, streamableTransport);
              logger.info(
                `Streamable HTTP session initialized: ${newSessionId}`
              );
            },
          });

          // Create and connect MCP server
          const mcpServer = createMcpServer({ debug: this.debug });

          // Setup cleanup handlers
          streamableTransport.onclose = () => {
            if (streamableTransport.sessionId) {
              this.transports.delete(streamableTransport.sessionId);
              logger.info(
                `Streamable HTTP session closed: ${streamableTransport.sessionId}`
              );
            }
          };

          streamableTransport.onerror = error => {
            if (streamableTransport.sessionId) {
              logger.error(
                `Streamable HTTP transport error for session ${streamableTransport.sessionId}:`,
                error
              );
              this.transports.delete(streamableTransport.sessionId);
            }
          };

          await mcpServer.connect(streamableTransport);
        } else {
          // Invalid session
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Session not found" }));
          return;
        }

        // Let the transport handle the request
        await streamableTransport.handleRequest(req, res, parsedBody);
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
          `AutoMobile MCP Streamable HTTP server running on http://${this.host}:${this.port}${MCP_STREAMABLE_PATH}`
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

    // Close Unix socket server
    if (this.socketServer) {
      await this.socketServer.close();
    }

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
