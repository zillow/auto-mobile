#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createHttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createMcpServer } from "./server";
import { createProxyMcpServer } from "./server/proxyServer";
import { logger } from "./utils/logger";
import { runCliCommand } from "./cli";
import { runDaemonCommand } from "./daemon/manager";
import { startDaemon } from "./daemon/daemon";
import type { DaemonOptions } from "./daemon/types";
import { startVideoRecordingSocketServer, stopVideoRecordingSocketServer } from "./daemon/videoRecordingSocketServer";
import { startTestRecordingSocketServer, stopTestRecordingSocketServer } from "./daemon/testRecordingSocketServer";
import { startDeviceSnapshotSocketServer, stopDeviceSnapshotSocketServer } from "./daemon/deviceSnapshotSocketServer";
import { startAppearanceSocketServer, stopAppearanceSocketServer } from "./daemon/appearanceSocketServer";
import { startAppearanceSyncScheduler, stopAppearanceSyncScheduler } from "./utils/appearance/AppearanceSyncScheduler";
import { startHostEmulatorAutoConnect, stopHostEmulatorAutoConnect } from "./utils/hostEmulatorAutoConnect";
import { execSync } from "node:child_process";
import { defaultTimer } from "./utils/SystemTimer";
import { executionTracker } from "./server/executionTracker";
import { FeatureFlagService } from "./features/featureFlags/FeatureFlagService";
import type { FeatureFlagKey } from "./features/featureFlags/FeatureFlagDefinitions";
import { serverConfig, type PlanExecutionLockScope } from "./utils/ServerConfig";
import type { VideoRecordingConfigInput } from "./models";
import { startupBenchmark } from "./utils/startupBenchmark";
import { AndroidAccessibilityServiceManager } from "./utils/AccessibilityServiceManager";
import { XCTestServiceBuilder } from "./utils/XCTestServiceBuilder";
import { IOSXCTestServiceManager } from "./utils/XCTestServiceManager";

startupBenchmark.mark("processEntry");

// Detect port from git branch name for worktree isolation
// e.g., work/164-feature-name -> port 9164
function detectPortFromBranch(): number {
  const basePort = 9000;

  // Check environment variable first (explicit override)
  // @deprecated AUTO_MOBILE_PORT - use AUTOMOBILE_PORT instead
  const envPort = process.env.AUTOMOBILE_PORT ?? process.env.AUTO_MOBILE_PORT;
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
  memPerfAuditMode: boolean;
  a11yAuditMode: boolean;
  a11yLevel?: string;
  a11yFailureMode?: string;
  a11yMinSeverity?: string;
  a11yUseBaseline: boolean;
  predictiveUi: boolean;
  rawElementSearch: boolean;
  planExecutionLockScope: PlanExecutionLockScope;
  videoRecordingDefaults: VideoRecordingConfigInput;
  daemonMode: boolean;
  daemonCommand?: string;
  daemonArgs: string[];
  skipAccessibilityDownload: boolean;
  noProxy: boolean;
  noDaemon: boolean;
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

  // Detect no-proxy mode (skip daemon proxy, execute tools directly)
  // By default, MCP server proxies to daemon for stable device management
  // --direct is kept as an undocumented alias for backwards compatibility
  const noProxy = args.includes("--no-proxy") || args.includes("--direct");

  // Detect no-daemon mode (keep proxy architecture but disable daemon auto-start)
  const noDaemon = args.includes("--no-daemon");

  // Detect daemon management command
  const daemonCommandIndex = args.indexOf("--daemon");
  const daemonCommand =
    daemonCommandIndex >= 0 ? args[daemonCommandIndex + 1] : undefined;
  const daemonArgs =
    daemonCommandIndex >= 0 ? args.slice(daemonCommandIndex + 2) : [];

  // Detect debug-perf mode for performance timing output
  const debugPerf =
    args.includes("--debug-perf") || process.env.AUTOMOBILE_DEBUG_PERF === "1";

  // Detect debug mode to enable debug tools (debugSearch, bugReport)
  const debug =
    args.includes("--debug") || process.env.AUTOMOBILE_DEBUG === "1";

  // UI performance mode is enabled by default (captures TTI, displayed metrics)
  // Use --no-ui-perf-mode to disable
  const uiPerfMode = !args.includes("--no-ui-perf-mode");

  // Detect memory performance audit mode
  const memPerfAuditMode = args.includes("--mem-perf-audit");

  // Detect accessibility audit mode
  const a11yAuditMode = args.includes("--accessibility-audit");
  let a11yLevel: string | undefined;
  let a11yFailureMode: string | undefined;
  let a11yMinSeverity: string | undefined;
  let a11yUseBaseline = false;
  const predictiveUi = args.includes("--predictive") || args.includes("--predictive-ui");
  const rawElementSearch = args.includes("--raw-element-search");
  const skipAccessibilityDownload = args.includes("--skip-accessibility-download");
  let planExecutionLockScope: PlanExecutionLockScope = "session";
  const videoRecordingDefaults: VideoRecordingConfigInput = {};

  const parsePositiveNumber = (
    value: string | undefined,
    label: string,
    allowFloat: boolean
  ): number | undefined => {
    if (!value) {
      return undefined;
    }
    const parsed = allowFloat ? Number(value) : parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      logger.warn(`Invalid ${label}: ${value}`);
      return undefined;
    }
    return allowFloat ? parsed : Math.round(parsed);
  };

  const allowedQualityPresets = new Set(["low", "medium", "high"]);
  const allowedFormats = new Set(["mp4"]);

  const applyQualityPreset = (value: string | undefined, source: string) => {
    if (!value) {
      return;
    }
    if (!allowedQualityPresets.has(value)) {
      logger.warn(`Invalid video quality preset (${source}): ${value}`);
      return;
    }
    videoRecordingDefaults.qualityPreset = value;
  };

  const applyFormat = (value: string | undefined, source: string) => {
    if (!value) {
      return;
    }
    if (!allowedFormats.has(value)) {
      logger.warn(`Invalid video format (${source}): ${value}`);
      return;
    }
    videoRecordingDefaults.format = value;
  };

  // @deprecated AUTO_MOBILE_VIDEO_* - use AUTOMOBILE_VIDEO_* instead
  applyQualityPreset(
    process.env.AUTOMOBILE_VIDEO_QUALITY_PRESET ??
      process.env.AUTO_MOBILE_VIDEO_QUALITY_PRESET,
    "env"
  );
  const envTargetBitrate = process.env.AUTOMOBILE_VIDEO_TARGET_BITRATE_KBPS ??
    process.env.AUTO_MOBILE_VIDEO_TARGET_BITRATE_KBPS;
  const envMaxThroughput = process.env.AUTOMOBILE_VIDEO_MAX_THROUGHPUT_MBPS ??
    process.env.AUTO_MOBILE_VIDEO_MAX_THROUGHPUT_MBPS;
  const envFps = process.env.AUTOMOBILE_VIDEO_FPS ??
    process.env.AUTO_MOBILE_VIDEO_FPS;
  const envArchiveMb = process.env.AUTOMOBILE_VIDEO_MAX_ARCHIVE_MB ??
    process.env.AUTO_MOBILE_VIDEO_MAX_ARCHIVE_MB;
  const envFormat = process.env.AUTOMOBILE_VIDEO_FORMAT ??
    process.env.AUTO_MOBILE_VIDEO_FORMAT;

  const parsedTargetBitrate = parsePositiveNumber(envTargetBitrate, "video target bitrate", false);
  if (parsedTargetBitrate !== undefined) {
    videoRecordingDefaults.targetBitrateKbps = parsedTargetBitrate;
  }

  const parsedMaxThroughput = parsePositiveNumber(envMaxThroughput, "video max throughput", true);
  if (parsedMaxThroughput !== undefined) {
    videoRecordingDefaults.maxThroughputMbps = parsedMaxThroughput;
  }

  const parsedFps = parsePositiveNumber(envFps, "video fps", false);
  if (parsedFps !== undefined) {
    videoRecordingDefaults.fps = parsedFps;
  }

  const parsedArchive = parsePositiveNumber(envArchiveMb, "video max archive size", true);
  if (parsedArchive !== undefined) {
    videoRecordingDefaults.maxArchiveSizeMb = parsedArchive;
  }

  applyFormat(envFormat, "env");

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
    } else if (arg === "--plan-execution-lock-scope") {
      const scope = args[i + 1];
      if (scope === "global" || scope === "session") {
        planExecutionLockScope = scope;
      } else {
        logger.warn(`Invalid plan execution lock scope: ${scope}. Using default: ${planExecutionLockScope}`);
      }
      i++;
    } else if (arg === "--video-quality" || arg === "--video-quality-preset") {
      const qualityPreset = args[i + 1];
      applyQualityPreset(qualityPreset, "cli");
      i++;
    } else if (arg === "--video-target-bitrate-kbps") {
      const parsed = parsePositiveNumber(args[i + 1], "video target bitrate", false);
      if (parsed !== undefined) {
        videoRecordingDefaults.targetBitrateKbps = parsed;
      }
      i++;
    } else if (arg === "--video-max-throughput-mbps") {
      const parsed = parsePositiveNumber(args[i + 1], "video max throughput", true);
      if (parsed !== undefined) {
        videoRecordingDefaults.maxThroughputMbps = parsed;
      }
      i++;
    } else if (arg === "--video-fps") {
      const parsed = parsePositiveNumber(args[i + 1], "video fps", false);
      if (parsed !== undefined) {
        videoRecordingDefaults.fps = parsed;
      }
      i++;
    } else if (arg === "--video-format") {
      const format = args[i + 1];
      applyFormat(format, "cli");
      i++;
    } else if (arg === "--video-archive-size-mb") {
      const parsed = parsePositiveNumber(args[i + 1], "video max archive size", true);
      if (parsed !== undefined) {
        videoRecordingDefaults.maxArchiveSizeMb = parsed;
      }
      i++;
    }
  }

  return {
    cliMode,
    cliArgs,
    transport,
    debugPerf,
    debug,
    uiPerfMode,
    memPerfAuditMode,
    a11yAuditMode,
    a11yLevel,
    a11yFailureMode,
    a11yMinSeverity,
    a11yUseBaseline,
    predictiveUi,
    rawElementSearch,
    planExecutionLockScope,
    videoRecordingDefaults,
    daemonMode,
    daemonCommand,
    daemonArgs,
    skipAccessibilityDownload,
    noProxy,
    noDaemon,
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
  const serverStartTime = defaultTimer.now();

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
      const uptimeMs = defaultTimer.now() - serverStartTime;
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
        const sessionContext: { sessionId?: string } = {};
        streamableTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: newSessionId => {
            transports.set(newSessionId, streamableTransport);
            sessionContext.sessionId = newSessionId;
            logger.info(`Streamable HTTP session initialized: ${newSessionId}`);
          }
        });

        // Create and connect MCP server
        let mcpServer;
        try {
          mcpServer = createMcpServer({ debug, sessionContext });
        } catch (error) {
          logger.error("Failed to create MCP server:", error);
          sendJsonRpcError("Server error", error);
          return;
        }

        // Setup cleanup handlers
        streamableTransport.onclose = async () => {
          if (streamableTransport.sessionId) {
            const cancelled = await executionTracker.cancelSessionExecutions(streamableTransport.sessionId);
            transports.delete(streamableTransport.sessionId);
            logger.info(`Streamable HTTP session closed: ${streamableTransport.sessionId} (cancelled ${cancelled} executions)`);
          }
        };

        streamableTransport.onerror = async error => {
          if (streamableTransport.sessionId) {
            logger.error(`Streamable HTTP transport error for session ${streamableTransport.sessionId}:`, error);
            await executionTracker.cancelSessionExecutions(streamableTransport.sessionId);
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
  startupBenchmark.startPhase("serverListening");
  server.listen(transport.port!, transport.host!, () => {
    logger.info(`automobile:${transport.host}:${transport.port}/auto-mobile/streamable`);
    logger.info(`Connect using: npx -y mcp-remote http://${transport.host}:${transport.port}/auto-mobile/streamable`);
    startupBenchmark.endPhase("serverListening");
    startupBenchmark.emit("mcp-server", {
      transport: "streamable",
      host: transport.host,
      port: transport.port
    });
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

    await stopHostEmulatorAutoConnect();
    await stopVideoRecordingSocketServer();
    await stopTestRecordingSocketServer();
    await stopDeviceSnapshotSocketServer();
    await IOSXCTestServiceManager.shutdownAll();
    await AndroidAccessibilityServiceManager.cleanupPrefetchedApk();

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
      const mcpServer = createMcpServer({ debug, sessionContext: { sessionId } });

      // Handle cleanup when connection closes
      sseTransport.onclose = async () => {
        const cancelled = await executionTracker.cancelSessionExecutions(sessionId);
        sessions.delete(sessionId);
        logger.info(`SSE session closed: ${sessionId} (cancelled ${cancelled} executions)`);
      };

      sseTransport.onerror = async error => {
        logger.error(`SSE transport error for session ${sessionId}:`, error);
        await executionTracker.cancelSessionExecutions(sessionId);
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
  startupBenchmark.startPhase("serverListening");
  server.listen(transport.port!, transport.host!, () => {
    logger.info(`automobile:${transport.host}:${transport.port}/auto-mobile/sse`);
    logger.info(`Connect using: npx -y mcp-remote http://${transport.host}:${transport.port}/auto-mobile/sse`);
    startupBenchmark.endPhase("serverListening");
    startupBenchmark.emit("mcp-server", {
      transport: "sse",
      host: transport.host,
      port: transport.port
    });
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

    await stopHostEmulatorAutoConnect();
    await stopVideoRecordingSocketServer();
    await stopTestRecordingSocketServer();
    await stopDeviceSnapshotSocketServer();
    await IOSXCTestServiceManager.shutdownAll();
    await AndroidAccessibilityServiceManager.cleanupPrefetchedApk();

    server.close(() => {
      logger.info("SSE server shut down");
      logger.close();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Create and start Streamable HTTP proxy server (connects to daemon)
async function startStreamableProxyServer(transport: TransportConfig, daemonOptions: DaemonOptions): Promise<void> {
  const server = createHttpServer();
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // Server instance tracking for health checks
  const serverInstanceId = randomUUID();
  const serverStartTime = defaultTimer.now();

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

    // Health check endpoint
    if (url.pathname === "/health" || url.pathname === "/auto-mobile/health") {
      const uptimeMs = defaultTimer.now() - serverStartTime;
      const health = {
        status: "ok",
        server: "AutoMobile",
        mode: "proxy",
        instanceId: serverInstanceId,
        port: transport.port,
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

      const isInitializeRequest = parsedBody && typeof parsedBody === "object" && "method" in parsedBody && parsedBody.method === "initialize";
      const sendJsonRpcError = (message: string, error?: unknown) => {
        if (res.headersSent) {
          return;
        }
        const id = parsedBody && typeof parsedBody === "object" && "id" in parsedBody ? parsedBody.id : null;
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
        streamableTransport = transports.get(sessionId)!;
      } else if (isInitializeRequest || !sessionId) {
        const sessionContext: { sessionId?: string } = {};
        streamableTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: newSessionId => {
            transports.set(newSessionId, streamableTransport);
            sessionContext.sessionId = newSessionId;
            logger.info(`Streamable HTTP proxy session initialized: ${newSessionId}`);
          }
        });

        // Create proxy MCP server
        let proxyResult;
        try {
          proxyResult = createProxyMcpServer({
            sessionContext,
            proxyConfig: { autoStartDaemon: !noDaemon, daemonOptions }
          });
        } catch (error) {
          logger.error("Failed to create proxy MCP server:", error);
          sendJsonRpcError("Server error", error);
          return;
        }

        const mcpServer = proxyResult.server;
        const proxyInstance = proxyResult.proxy;

        // Setup cleanup handlers
        streamableTransport.onclose = async () => {
          if (streamableTransport.sessionId) {
            transports.delete(streamableTransport.sessionId);
            await proxyInstance.close();
            logger.info(`Streamable HTTP proxy session closed: ${streamableTransport.sessionId}`);
          }
        };

        streamableTransport.onerror = async error => {
          if (streamableTransport.sessionId) {
            logger.error(`Streamable HTTP proxy transport error for session ${streamableTransport.sessionId}:`, error);
            transports.delete(streamableTransport.sessionId);
          }
        };

        try {
          logger.info("Connecting proxy MCP server to Streamable HTTP transport");
          await mcpServer.connect(streamableTransport);
          logger.info("Proxy MCP server connected to Streamable HTTP transport");
        } catch (error) {
          logger.error("Proxy MCP server connect failed:", error);
          sendJsonRpcError("Server error", error);
          return;
        }
      } else {
        logger.warn(`Session not found: ${sessionId}. Server may have restarted.`);
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: "Session not found",
          message: "The session may have expired or the server was restarted. Please reinitialize the connection.",
          serverInstanceId,
          activeSessions: transports.size
        }));
        return;
      }

      try {
        await streamableTransport.handleRequest(req, res, parsedBody);
      } catch (error) {
        logger.error("Streamable HTTP proxy request handling failed:", error);
        sendJsonRpcError("Server error", error);
      }
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });

  startupBenchmark.startPhase("serverListening");
  server.listen(transport.port!, transport.host!, () => {
    logger.info(`automobile:${transport.host}:${transport.port}/auto-mobile/streamable (proxy mode)`);
    logger.info(`Connect using: npx -y mcp-remote http://${transport.host}:${transport.port}/auto-mobile/streamable`);
    startupBenchmark.endPhase("serverListening");
    startupBenchmark.emit("mcp-server", {
      transport: "streamable",
      mode: "proxy",
      host: transport.host,
      port: transport.port
    });
  });

  // Handle server shutdown
  const shutdown = async () => {
    logger.info("Shutting down Streamable HTTP proxy server...");
    for (const [sessionId, streamableTransport] of transports) {
      try {
        await streamableTransport.close();
      } catch (error) {
        logger.warn(`Error closing Streamable HTTP session ${sessionId}:`, error);
      }
    }
    transports.clear();

    server.close(() => {
      logger.info("Streamable HTTP proxy server shut down");
      logger.close();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Create and start SSE proxy server (connects to daemon)
async function startSSEProxyServer(transport: TransportConfig, daemonOptions: DaemonOptions): Promise<void> {
  const server = createHttpServer();
  const sessions = new Map<string, SSEServerTransport>();

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
      const sseTransport = new SSEServerTransport("/auto-mobile/messages", res);
      const sessionId = sseTransport.sessionId;

      sessions.set(sessionId, sseTransport);

      // Create proxy MCP server
      const { server: mcpServer, proxy: sseProxy } = createProxyMcpServer({
        sessionContext: { sessionId },
        proxyConfig: { autoStartDaemon: !noDaemon, daemonOptions }
      });

      sseTransport.onclose = async () => {
        sessions.delete(sessionId);
        await sseProxy.close();
        logger.info(`SSE proxy session closed: ${sessionId}`);
      };

      sseTransport.onerror = async error => {
        logger.error(`SSE proxy transport error for session ${sessionId}:`, error);
        sessions.delete(sessionId);
      };

      await mcpServer.connect(sseTransport);
      logger.info(`SSE proxy session started: ${sessionId}`);

    } else if (req.method === "POST" && url.pathname === "/auto-mobile/messages") {
      const sessionId = url.searchParams.get("sessionId");

      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid or missing sessionId" }));
        return;
      }

      const sseTransport = sessions.get(sessionId)!;

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
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });

  startupBenchmark.startPhase("serverListening");
  server.listen(transport.port!, transport.host!, () => {
    logger.info(`automobile:${transport.host}:${transport.port}/auto-mobile/sse (proxy mode)`);
    logger.info(`Connect using: npx -y mcp-remote http://${transport.host}:${transport.port}/auto-mobile/sse`);
    startupBenchmark.endPhase("serverListening");
    startupBenchmark.emit("mcp-server", {
      transport: "sse",
      mode: "proxy",
      host: transport.host,
      port: transport.port
    });
  });

  const shutdown = async () => {
    logger.info("Shutting down SSE proxy server...");
    for (const [sessionId, sseTransport] of sessions) {
      try {
        await sseTransport.close();
      } catch (error) {
        logger.warn(`Error closing SSE session ${sessionId}:`, error);
      }
    }
    sessions.clear();

    server.close(() => {
      logger.info("SSE proxy server shut down");
      logger.close();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

process.on("SIGINT", async () => {
  logger.info("Received SIGINT signal, shutting down");
  await stopHostEmulatorAutoConnect();
  await stopVideoRecordingSocketServer();
  await stopTestRecordingSocketServer();
  await stopDeviceSnapshotSocketServer();
  await stopAppearanceSocketServer();
  stopAppearanceSyncScheduler();
  await AndroidAccessibilityServiceManager.cleanupPrefetchedApk();
  logger.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM signal, shutting down");
  await stopHostEmulatorAutoConnect();
  await stopVideoRecordingSocketServer();
  await stopTestRecordingSocketServer();
  await stopDeviceSnapshotSocketServer();
  await stopAppearanceSocketServer();
  stopAppearanceSyncScheduler();
  await AndroidAccessibilityServiceManager.cleanupPrefetchedApk();
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
      memPerfAuditMode,
      a11yAuditMode,
      a11yLevel,
      a11yFailureMode,
      a11yMinSeverity,
      a11yUseBaseline,
      predictiveUi,
      rawElementSearch,
      planExecutionLockScope,
      videoRecordingDefaults,
      daemonMode,
      daemonCommand,
      daemonArgs,
      skipAccessibilityDownload,
      noProxy,
      noDaemon,
    } = parseArgs();

    serverConfig.setPlanExecutionLockScope(planExecutionLockScope);
    serverConfig.setVideoRecordingDefaults(videoRecordingDefaults);
    serverConfig.setSkipAccessibilityDownload(skipAccessibilityDownload);
    if (skipAccessibilityDownload) {
      logger.info("Accessibility APK download disabled (--skip-accessibility-download)");
    } else {
      // Start prefetching the accessibility service APK in the background
      // This runs asynchronously and will be ready when first device connects
      AndroidAccessibilityServiceManager.prefetchApk();
    }

    // Start iOS XCTestService build prefetch (macOS only)
    // This runs asynchronously and will be ready when first iOS device connects
    if (process.platform === "darwin") {
      XCTestServiceBuilder.prefetchBuild();
    }

    const featureFlagService = FeatureFlagService.getInstance();
    await featureFlagService.initialize();

    const accessibilityConfig = a11yAuditMode
      ? {
        level: (a11yLevel as "A" | "AA" | "AAA" | undefined) || "AA",
        failureMode: (a11yFailureMode as "report" | "threshold" | "strict" | undefined) || "report",
        minSeverity: (a11yMinSeverity as "error" | "warning" | "info" | undefined) ||
            ((a11yFailureMode as "report" | "threshold" | "strict" | undefined) === "strict" ? "error" : "warning"),
        useBaseline: a11yUseBaseline,
      }
      : null;

    const cliOverrides: Array<[FeatureFlagKey, boolean, string, Record<string, unknown> | null | undefined]> = [
      ["debug", debug, "--debug"],
      ["debug-perf", debugPerf, "--debug-perf"],
      ["ui-perf-mode", uiPerfMode, "--ui-perf-mode"],
      ["mem-perf-audit", memPerfAuditMode, "--mem-perf-audit"],
      ["accessibility-audit", a11yAuditMode, "--accessibility-audit", accessibilityConfig],
      ["predictive-ui", predictiveUi, "--predictive/--predictive-ui"],
      ["raw-element-search", rawElementSearch, "--raw-element-search"],
    ];

    for (const [key, enabled, flagLabel, config] of cliOverrides) {
      if (!enabled) {
        continue;
      }
      await featureFlagService.setFlag(key, true, config);
      logger.info(`Feature flag enabled (${flagLabel})`);
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
      // Exit explicitly after daemon command completes to prevent process from hanging
      // Same issue as CLI mode - event loop may have pending operations
      logger.close();
      process.exit(0);
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
    } else {
      // In proxy mode (default), the MCP server proxies requests to the daemon
      // The daemon manages device state and tool execution
      // In no-proxy mode (--no-proxy flag), the MCP server executes tools directly
      const useProxyMode = !noProxy;

      // Construct daemon options from CLI args to pass when auto-starting daemon
      const proxyDaemonOptions: DaemonOptions = {
        debug,
        debugPerf,
        planExecutionLockScope,
        videoQualityPreset: videoRecordingDefaults.qualityPreset,
        videoTargetBitrateKbps: videoRecordingDefaults.targetBitrateKbps,
        videoMaxThroughputMbps: videoRecordingDefaults.maxThroughputMbps,
        videoFps: videoRecordingDefaults.fps,
        videoFormat: videoRecordingDefaults.format,
        videoMaxArchiveSizeMb: videoRecordingDefaults.maxArchiveSizeMb,
      };

      if (useProxyMode) {
        logger.info("Starting MCP server in proxy mode (connecting to daemon)");
      } else {
        logger.info("Starting MCP server in direct mode (--no-proxy flag)");
        // Start auxiliary services only in direct mode
        await startHostEmulatorAutoConnect();
        await startVideoRecordingSocketServer();
        await startTestRecordingSocketServer();
        await startDeviceSnapshotSocketServer();
        await startAppearanceSocketServer();
        startAppearanceSyncScheduler();
      }

      if (transport.type === "streamable") {
        // Run as Streamable HTTP server
        logger.info(`Starting Streamable HTTP transport on ${transport.host}:${transport.port}`);
        logger.enableStdoutLogging();
        if (useProxyMode) {
          await startStreamableProxyServer(transport, proxyDaemonOptions);
        } else {
          await startStreamableServer(transport, debug);
        }
      } else if (transport.type === "sse") {
        // Run as SSE server (deprecated)
        logger.info(`Starting SSE transport on ${transport.host}:${transport.port} (deprecated - consider using streamable)`);
        logger.enableStdoutLogging();
        if (useProxyMode) {
          await startSSEProxyServer(transport, proxyDaemonOptions);
        } else {
          await startSSEServer(transport, debug);
        }
      } else {
        // Run as MCP server with STDIO transport (default)
        const stdioTransport = new StdioServerTransport();
        let server;
        let stdioProxy: ReturnType<typeof createProxyMcpServer>["proxy"] | undefined;
        try {
          if (useProxyMode) {
            const result = createProxyMcpServer({
              proxyConfig: { autoStartDaemon: !noDaemon, daemonOptions: proxyDaemonOptions }
            });
            server = result.server;
            stdioProxy = result.proxy;
          } else {
            server = createMcpServer({ debug });
          }
        } catch (error) {
          logger.error("Failed to create MCP server:", error);
          throw error;
        }
        try {
          logger.info("Connecting MCP server to stdio transport");
          startupBenchmark.startPhase("serverListening");
          await server.connect(stdioTransport);
          startupBenchmark.endPhase("serverListening");
          logger.info("MCP server connected to stdio transport");
          logger.info(`AutoMobile MCP server running on stdio (${useProxyMode ? "proxy" : "direct"} mode)`);
          startupBenchmark.emit("mcp-server", { transport: "stdio", mode: useProxyMode ? "proxy" : "direct" });

          // Register cleanup for proxy mode
          if (stdioProxy) {
            const cleanupProxy = async () => {
              await stdioProxy!.close();
            };
            process.on("beforeExit", cleanupProxy);
          }
        } catch (error) {
          logger.error("MCP server connect failed:", error);
          throw error;
        }
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
