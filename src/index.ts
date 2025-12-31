#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createHttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createMcpServer } from "./server";
import { logger } from "./utils/logger";
import { ConfigurationManager } from "./utils/ConfigurationManager";
import { runCliCommand } from "./cli";
import { setDebugPerfEnabled } from "./utils/PerformanceTracker";
import { serverConfig } from "./utils/ServerConfig";

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
  a11yAuditMode: boolean;
  a11yLevel?: string;
  a11yFailureMode?: string;
  a11yMinSeverity?: string;
  a11yUseBaseline: boolean;
  } {
  const args = process.argv.slice(2);

  // Default transport configuration
  const transport: TransportConfig = {
    type: "stdio",
    port: 9000,
    host: "localhost"
  };

  // Detect CLI mode based on command line flag
  const cliMode = args.includes("--cli");

  // Detect debug-perf mode for performance timing output
  const debugPerf = args.includes("--debug-perf");

  // Detect debug mode to enable debug tools (rawViewHierarchy, debugSearch, bugReport)
  const debug = args.includes("--debug");

  // Detect UI performance audit mode
  const uiPerfMode = args.includes("--ui-perf-mode");

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
    a11yAuditMode,
    a11yLevel,
    a11yFailureMode,
    a11yMinSeverity,
    a11yUseBaseline,
  };
}

// Create and start Streamable HTTP server
async function startStreamableServer(transport: TransportConfig, debug: boolean): Promise<void> {
  const server = createHttpServer();
  const transports = new Map<string, StreamableHTTPServerTransport>();

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
        const mcpServer = createMcpServer({ debug });

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
    // Initialize configuration manager to load configuration from disk
    const configurationManager = ConfigurationManager.getInstance();
    await configurationManager.loadFromDisk();

    // Parse command line arguments
    const {
      cliMode,
      cliArgs,
      transport,
      debugPerf,
      debug,
      uiPerfMode,
      a11yAuditMode,
      a11yLevel,
      a11yFailureMode,
      a11yMinSeverity,
      a11yUseBaseline,
    } = parseArgs();

    // Enable performance tracking if --debug-perf flag is set
    if (debugPerf) {
      setDebugPerfEnabled(true);
      logger.info("Performance timing enabled (--debug-perf)");
    }

    // Log when debug mode is enabled
    if (debug) {
      logger.info("Debug tools enabled (--debug)");
    }

    // Enable UI performance audit mode if --ui-perf-mode flag is set
    if (uiPerfMode) {
      serverConfig.setUiPerfMode(true);
      logger.info("UI performance audit mode enabled (--ui-perf-mode)");
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

    if (cliMode) {
      // Run in CLI mode
      logger.info("Running in CLI mode");
      // logger.enableStdoutLogging();
      await runCliCommand(cliArgs);
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
      const server = createMcpServer({ debug });
      await server.connect(stdioTransport);
      logger.info("AutoMobile MCP server running on stdio");
    }
  } catch (err) {
    logger.error("Error initializing server:", err);
    throw err;
  }
}

main().catch(err => {
  logger.error("Fatal error in main():", err);
  logger.close();
  process.exit(1);
});
