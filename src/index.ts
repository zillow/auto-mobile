#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createHttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createMcpServer } from "./server";
import { logger } from "./utils/logger";
import { runCliCommand } from "./cli";
import { setDebugPerfEnabled } from "./utils/PerformanceTracker";
import { setDebugModeEnabled } from "./utils/debug";
import { serverConfig } from "./utils/ServerConfig";
import { runDaemonCommand } from "./daemon/manager";
import { startDaemon } from "./daemon/daemon";
import { execSync } from "node:child_process";

// Detect port from git branch name for worktree isolation
// e.g., work/164-feature-name -> port 9164
function detectPortFromBranch(): number {
  const basePort = 9000;

  // Check environment variable first (explicit override)
  const envPort = process.env.AUTO_MOBILE_PORT;
  if (envPort) {
    const port = parseInt(envPort, 10);
    if (!isNaN(port) && port > 0 && port < 65536) {
      return port;
    }
  }

  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();

    // Extract issue number from branch name patterns:
    // work/164-feature-name, feature/164-name, fix/164, issue-164, etc.
    const match = branch.match(/\b(\d{1,4})\b/);
    if (match) {
      const issueNumber = parseInt(match[1], 10);
      // Keep port in valid range (9001-9999 for issue numbers 1-999)
      if (issueNumber > 0 && issueNumber < 1000) {
        return basePort + issueNumber;
      }
    }
  } catch {
    // Not in a git repo or git not available, use default
  }

  return basePort;
}

// Interface for transport configuration
interface TransportConfig {
  type: "stdio" | "sse" | "streamable";
  port?: number;
  host?: string;
}

// Parse command line arguments
function parseArgs(): {
  cliMode: boolean;
  cliArgs: string[];
  transport: TransportConfig;
  debugPerf: boolean;
  debug: boolean;
  uiPerfMode: boolean;
  uiPerfDebug: boolean;
  memPerfAuditMode: boolean;
  a11yAuditMode: boolean;
  a11yLevel?: string;
  a11yFailureMode?: string;
  a11yMinSeverity?: string;
  a11yUseBaseline: boolean;
  daemonMode: boolean;
  daemonCommand?: string;
  daemonArgs: string[];
  } {
  const args = process.argv.slice(2);

  // Default transport configuration
  // Port is auto-detected from git branch for worktree isolation
  const transport: TransportConfig = {
    type: "stdio",
    port: detectPortFromBranch(),
    host: "localhost"
  };

  // Detect CLI mode based on command line flag
  const cliMode = args.includes("--cli");

  // Detect daemon mode (internal daemon process)
  const daemonMode = args.includes("--daemon-mode");

  // Detect daemon management command
  const daemonCommandIndex = args.indexOf("--daemon");
  const daemonCommand =
    daemonCommandIndex >= 0 ? args[daemonCommandIndex + 1] : undefined;
  const daemonArgs =
    daemonCommandIndex >= 0 ? args.slice(daemonCommandIndex + 2) : [];

  // Detect debug-perf mode for performance timing output
  const debugPerf = args.includes("--debug-perf");

  // Detect debug mode to enable debug tools (rawViewHierarchy, debugSearch, bugReport)
  const debug = args.includes("--debug");

  // Detect UI performance audit mode
  const uiPerfMode = args.includes("--ui-perf-mode");
  const uiPerfDebug = args.includes("--ui-perf-debug");

  // Detect memory performance audit mode
  const memPerfAuditMode = args.includes("--mem-perf-audit");

  // Detect accessibility audit mode
  const a11yAuditMode = args.includes("--accessibility-audit");
  let a11yLevel: string | undefined;
  let a11yFailureMode: string | undefined;
  let a11yMinSeverity: string | undefined;
  let a11yUseBaseline = false;

  // Extract CLI-specific arguments (everything after --cli)
  const cliIndex = args.indexOf("--cli");
  const cliArgs = cliMode ? args.slice(cliIndex + 1) : [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Skip CLI mode arguments
    if (arg === "--cli") {
      break;
    }

    // Transport configuration
    if (arg === "--transport") {
      const transportType = args[i + 1];
      if (transportType === "sse" || transportType === "stdio" || transportType === "streamable") {
        transport.type = transportType;
        i++; // Skip the transport type argument
      } else {
        logger.warn(`Invalid transport type: ${transportType}. Using default: stdio`);
        i++; // Skip the invalid argument
      }
    } else if (arg === "--port") {
      const port = parseInt(args[i + 1], 10);
      if (!isNaN(port) && port > 0 && port < 65536) {
        transport.port = port;
        i++; // Skip the port argument
      } else {
        logger.warn(`Invalid port: ${args[i + 1]}. Using default: ${transport.port}`);
        i++; // Skip the invalid argument
      }
    } else if (arg === "--host") {
      const host = args[i + 1];
      if (host && !host.startsWith("--")) {
        transport.host = host;
        i++; // Skip the host argument
      } else {
        logger.warn(`Invalid host: ${host}. Using default: ${transport.host}`);
        i++; // Skip the invalid argument
      }
    } else if (arg === "--a11y-level") {
      // Accessibility audit options
      a11yLevel = args[i + 1];
      i++;
    } else if (arg === "--a11y-failure-mode") {
      a11yFailureMode = args[i + 1];
      i++;
    } else if (arg === "--a11y-min-severity") {
      a11yMinSeverity = args[i + 1];
      i++;
    } else if (arg === "--a11y-use-baseline") {
      a11yUseBaseline = true;
    }
  }

  return {
    cliMode,
    cliArgs,
    transport,
    debugPerf,
    debug,
    uiPerfMode,
    uiPerfDebug,
    memPerfAuditMode,
    a11yAuditMode,
    a11yLevel,
    a11yFailureMode,
    a11yMinSeverity,
    a11yUseBaseline,
    daemonMode,
    daemonCommand,
    daemonArgs,
  };
}

// Format uptime in human-readable form
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

// Create and start Streamable HTTP server
async function startStreamableServer(transport: TransportConfig, debug: boolean): Promise<void> {
  const server = createHttpServer();
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // Server instance tracking for health checks and restart detection
  const serverInstanceId = randomUUID();
  const serverStartTime = Date.now();

  server.on("request", async (req, res) => {
    // CORS headers for development
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, MCP-Session-Id");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url!, `http://${req.headers.host}`);

    // Health check endpoint for connection status and restart detection
    if (url.pathname === "/health" || url.pathname === "/auto-mobile/health") {
      const uptimeMs = Date.now() - serverStartTime;
      let branch: string | undefined;
      try {
        branch = execSync("git rev-parse --abbrev-ref HEAD", {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"]
        }).trim();
      } catch {
        // Not in git repo
      }
      const health = {
        status: "ok",
        server: "AutoMobile",
        version: "0.0.6",
        instanceId: serverInstanceId,
        port: transport.port,
        branch,
        uptime: {
          ms: uptimeMs,
          human: formatUptime(uptimeMs)
        },
        activeSessions: transports.size,
        transport: "streamable"
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(health, null, 2));
      return;
    }

    if (url.pathname === "/auto-mobile/streamable") {
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
      const isInitializeRequest = parsedBody && typeof parsedBody === "object" && true && "method" in parsedBody && parsedBody.method === "initialize";
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

      if (sessionId && transports.has(sessionId)) {
        // Use existing transport
        streamableTransport = transports.get(sessionId)!;
      } else if (isInitializeRequest || !sessionId) {
        // Create new transport for initialization or when no session ID
        streamableTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: newSessionId => {
            transports.set(newSessionId, streamableTransport);
            logger.info(`Streamable HTTP session initialized: ${newSessionId}`);
          }
        });

        // Create and connect MCP server
        let mcpServer;
        try {
          mcpServer = createMcpServer({ debug });
        } catch (error) {
          logger.error("Failed to create MCP server:", error);
          sendJsonRpcError("Server error", error);
          return;
        }

        // Setup cleanup handlers
        streamableTransport.onclose = () => {
          if (streamableTransport.sessionId) {
            transports.delete(streamableTransport.sessionId);
            logger.info(`Streamable HTTP session closed: ${streamableTransport.sessionId}`);
          }
        };

        streamableTransport.onerror = error => {
          if (streamableTransport.sessionId) {
            logger.error(`Streamable HTTP transport error for session ${streamableTransport.sessionId}:`, error);
            transports.delete(streamableTransport.sessionId);
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
        // Session not found - likely server restarted
        logger.warn(`Session not found: ${sessionId}. Server may have restarted. Active sessions: ${transports.size}`);
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: "Session not found",
          message: "The session may have expired or the server was restarted. Please reinitialize the connection.",
          hint: "If using mcp-remote, restart the MCP client to establish a new session.",
          serverInstanceId,
          activeSessions: transports.size
        }));
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
  server.listen(transport.port!, transport.host!, () => {
    logger.info(`AutoMobile MCP Streamable HTTP server running on http://${transport.host}:${transport.port}/auto-mobile/streamable`);
    logger.info(`Connect using: npx -y mcp-remote http://${transport.host}:${transport.port}/auto-mobile/streamable`);
  });

  // Handle server shutdown
  const shutdown = async () => {
    logger.info("Shutting down Streamable HTTP server...");

    // Close all active sessions
    for (const [sessionId, streamableTransport] of transports) {
      try {
        await streamableTransport.close();
      } catch (error) {
        logger.warn(`Error closing Streamable HTTP session ${sessionId}:`, error);
      }
    }
    transports.clear();

    server.close(() => {
      logger.info("Streamable HTTP server shut down");
      logger.close();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Create and start SSE server
async function startSSEServer(transport: TransportConfig, debug: boolean): Promise<void> {
  const server = createHttpServer();
  const sessions = new Map<string, SSEServerTransport>();

  // Handle SSE connections (GET requests)
  server.on("request", async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    // CORS headers for development
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/auto-mobile/sse") {
      // Create SSE transport for this session
      const sseTransport = new SSEServerTransport("/auto-mobile/messages", res);
      const sessionId = sseTransport.sessionId;

      sessions.set(sessionId, sseTransport);

      // Create MCP server instance for this session
      const mcpServer = createMcpServer({ debug });

      // Handle cleanup when connection closes
      sseTransport.onclose = () => {
        sessions.delete(sessionId);
        logger.info(`SSE session closed: ${sessionId}`);
      };

      sseTransport.onerror = error => {
        logger.error(`SSE transport error for session ${sessionId}:`, error);
        sessions.delete(sessionId);
      };

      // Connect MCP server to SSE transport
      await mcpServer.connect(sseTransport);
      logger.info(`SSE session started: ${sessionId}`);

    } else if (req.method === "POST" && url.pathname === "/auto-mobile/messages") {
      // Handle incoming messages from SSE clients
      const sessionId = url.searchParams.get("sessionId");

      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid or missing sessionId" }));
        return;
      }

      const sseTransport = sessions.get(sessionId)!;

      // Parse request body
      let body = "";
      req.on("data", chunk => {
        body += chunk.toString();
      });

      req.on("end", async () => {
        try {
          const parsedBody = JSON.parse(body);
          await sseTransport.handlePostMessage(req, res, parsedBody);
        } catch (error) {
          logger.error(`Error handling POST message for session ${sessionId}:`, error);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON" }));
        }
      });

    } else {
      // 404 for unknown paths
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });

  // Start HTTP server
  server.listen(transport.port!, transport.host!, () => {
    logger.info(`AutoMobile MCP SSE server running on http://${transport.host}:${transport.port}/auto-mobile/sse`);
    logger.info(`Connect using: npx -y mcp-remote http://${transport.host}:${transport.port}/auto-mobile/sse`);
  });

  // Handle server shutdown
  const shutdown = async () => {
    logger.info("Shutting down SSE server...");

    // Close all active sessions
    for (const [sessionId, sseTransport] of sessions) {
      try {
        await sseTransport.close();
      } catch (error) {
        logger.warn(`Error closing SSE session ${sessionId}:`, error);
      }
    }
    sessions.clear();

    server.close(() => {
      logger.info("SSE server shut down");
      logger.close();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

process.on("SIGINT", async () => {
  logger.info("Received SIGINT signal, shutting down");
  logger.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM signal, shutting down");
  logger.close();
  process.exit(0);
});

process.on("uncaughtException", error => {
  // Don't exit on uncaught exception, just log them
  logger.info(`Uncaught exception: ${error.message}`);
  logger.info(`Trace: ${error.stack}`);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection at:", promise, "reason:", reason);
  // Don't exit on unhandled rejections, just log them
});

async function main() {
  try {
    // Parse command line arguments
    const {
      cliMode,
      cliArgs,
      transport,
      debugPerf,
      debug,
      uiPerfMode,
      uiPerfDebug,
      memPerfAuditMode,
      a11yAuditMode,
      a11yLevel,
      a11yFailureMode,
      a11yMinSeverity,
      a11yUseBaseline,
      daemonMode,
      daemonCommand,
      daemonArgs,
    } = parseArgs();

    // Enable performance tracking if --debug-perf flag is set
    if (debugPerf) {
      setDebugPerfEnabled(true);
      logger.info("Performance timing enabled (--debug-perf)");
    }

    // Enable debug mode if --debug flag is set
    if (debug) {
      setDebugModeEnabled(true);
      logger.info("Debug mode enabled (--debug)");
    }

    // Enable UI performance audit mode if --ui-perf-mode flag is set
    if (uiPerfMode) {
      serverConfig.setUiPerfMode(true);
      logger.info("UI performance audit mode enabled (--ui-perf-mode)");
    }

    // Enable UI performance debug mode if --ui-perf-debug flag is set
    if (uiPerfDebug) {
      serverConfig.setUiPerfDebugMode(true);
      logger.info("UI performance debug mode enabled (--ui-perf-debug)");
    }

    // Enable memory performance audit mode if --mem-perf-audit flag is set
    if (memPerfAuditMode) {
      serverConfig.setMemPerfAuditMode(true);
      logger.info("Memory performance audit mode enabled (--mem-perf-audit)");
    }

    // Enable accessibility audit mode if --accessibility-audit flag is set
    if (a11yAuditMode) {
      const level = (a11yLevel as "A" | "AA" | "AAA" | undefined) || "AA";
      const failureMode = (a11yFailureMode as "report" | "threshold" | "strict" | undefined) || "report";
      const minSeverity = (a11yMinSeverity as "error" | "warning" | "info" | undefined) || (failureMode === "strict" ? "error" : "warning");

      serverConfig.setAccessibilityAuditConfig({
        level,
        failureMode,
        useBaseline: a11yUseBaseline,
        minSeverity,
      });

      logger.info(`Accessibility audit mode enabled (level: ${level}, failure mode: ${failureMode}, baseline: ${a11yUseBaseline})`);
    }

    if (daemonMode) {
      // Check if --port was explicitly passed, otherwise let daemon use its default
      const explicitPort = process.argv.includes("--port");
      await startDaemon({
        port: explicitPort ? transport.port : undefined,
        host: transport.host,
        debug,
        debugPerf,
      });
      return;
    }

    if (daemonCommand) {
      await runDaemonCommand(daemonCommand, daemonArgs);
      return;
    }

    if (cliMode) {
      // Run in CLI mode
      logger.info("Running in CLI mode");
      // logger.enableStdoutLogging();
      await runCliCommand(cliArgs);
      // CRITICAL: Exit explicitly after CLI command completes to prevent process from hanging
      // The event loop may have pending operations (ADB connections, file descriptors) that
      // prevent Node.js from exiting naturally. Force exit with code 0 to ensure clean termination.
      logger.close();
      process.exit(0);
    } else if (transport.type === "streamable") {
      // Run as Streamable HTTP server
      logger.info(`Starting Streamable HTTP transport on ${transport.host}:${transport.port}`);
      logger.enableStdoutLogging();
      await startStreamableServer(transport, debug);
    } else if (transport.type === "sse") {
      // Run as SSE server (deprecated)
      logger.info(`Starting SSE transport on ${transport.host}:${transport.port} (deprecated - consider using streamable)`);
      logger.enableStdoutLogging();
      await startSSEServer(transport, debug);
    } else {
      // Run as MCP server with STDIO transport (default)
      const stdioTransport = new StdioServerTransport();
      let server;
      try {
        server = createMcpServer({ debug });
      } catch (error) {
        logger.error("Failed to create MCP server:", error);
        throw error;
      }
      try {
        logger.info("Connecting MCP server to stdio transport");
        await server.connect(stdioTransport);
        logger.info("MCP server connected to stdio transport");
        logger.info("AutoMobile MCP server running on stdio");
      } catch (error) {
        logger.error("MCP server connect failed:", error);
        throw error;
      }
    }
  } catch (err) {
    logger.error("Error initializing server:", err);
    throw err;
  }
}

main().catch(err => {
  console.error("Fatal error in main():", err);
  logger.error("Fatal error in main():", err);
  logger.close();
  process.exit(1);
});
