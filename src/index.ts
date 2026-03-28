#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
import { FeatureFlagService } from "./features/featureFlags/FeatureFlagService";
import type { FeatureFlagKey } from "./features/featureFlags/FeatureFlagDefinitions";
import { serverConfig, type PlanExecutionLockScope } from "./utils/ServerConfig";
import type { VideoRecordingConfigInput } from "./models";
import { startupBenchmark } from "./utils/startupBenchmark";
import { AndroidCtrlProxyManager } from "./utils/CtrlProxyManager";
import { IOSCtrlProxyBuilder } from "./utils/IOSCtrlProxyBuilder";

startupBenchmark.mark("processEntry");

// Parse command line arguments
function parseArgs(): {
  cliMode: boolean;
  cliArgs: string[];
  daemonPort: number | undefined;
  daemonHost: string;
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
  skipCtrlProxyDownload: boolean;
  noProxy: boolean;
  noDaemon: boolean;
  } {
  const args = process.argv.slice(2);

  let daemonPort: number | undefined;
  let daemonHost = "localhost";

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
  const skipCtrlProxyDownload = args.includes("--skip-ctrl-proxy-download") || args.includes("--skip-accessibility-download");
  const networkMockable = args.includes("--network-mockable");
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

    if (arg === "--port") {
      const port = parseInt(args[i + 1], 10);
      if (!isNaN(port) && port > 0 && port < 65536) {
        daemonPort = port;
        i++; // Skip the port argument
      } else {
        logger.warn(`Invalid port: ${args[i + 1]}`);
        i++; // Skip the invalid argument
      }
    } else if (arg === "--host") {
      const host = args[i + 1];
      if (host && !host.startsWith("--")) {
        daemonHost = host;
        i++; // Skip the host argument
      } else {
        logger.warn(`Invalid host: ${host}`);
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
    daemonPort,
    daemonHost,
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
    skipCtrlProxyDownload,
    networkMockable,
    noProxy,
    noDaemon,
  };
}

process.on("SIGINT", async () => {
  logger.info("Received SIGINT signal, shutting down");
  await stopHostEmulatorAutoConnect();
  await stopVideoRecordingSocketServer();
  await stopTestRecordingSocketServer();
  await stopDeviceSnapshotSocketServer();
  await stopAppearanceSocketServer();
  stopAppearanceSyncScheduler();
  await AndroidCtrlProxyManager.cleanupPrefetchedApk();
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
  await AndroidCtrlProxyManager.cleanupPrefetchedApk();
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
      daemonPort,
      daemonHost,
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
      skipCtrlProxyDownload,
      networkMockable,
      noProxy,
      noDaemon,
    } = parseArgs();

    serverConfig.setPlanExecutionLockScope(planExecutionLockScope);
    serverConfig.setVideoRecordingDefaults(videoRecordingDefaults);
    serverConfig.setSkipCtrlProxyDownload(skipCtrlProxyDownload);
    serverConfig.setNetworkMockableEnabled(networkMockable);
    if (skipCtrlProxyDownload) {
      logger.info("CtrlProxy APK download disabled (--skip-ctrl-proxy-download)");
    } else {
      // Start prefetching the accessibility service APK in the background
      // This runs asynchronously and will be ready when first device connects
      AndroidCtrlProxyManager.prefetchApk();
    }

    // Start iOS CtrlProxy iOS build prefetch (macOS only)
    // This runs asynchronously and will be ready when first iOS device connects
    if (process.platform === "darwin") {
      IOSCtrlProxyBuilder.prefetchBuild();
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
      await startDaemon({
        port: daemonPort,
        host: daemonHost,
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
        networkMockable,
        noUiPerfMode: !uiPerfMode,
        memPerfAudit: memPerfAuditMode,
        accessibilityAudit: a11yAuditMode,
        accessibilityLevel: a11yLevel,
        accessibilityFailureMode: a11yFailureMode,
        accessibilityMinSeverity: a11yMinSeverity,
        accessibilityUseBaseline: a11yUseBaseline,
        predictiveUi,
        rawElementSearch,
        skipCtrlProxyDownload,
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

      // Detect when the MCP client disconnects (stdin closes / pipe breaks).
      // Without this, the bun process stays alive indefinitely as an orphan
      // when the client (Claude Code, Cursor, etc.) exits or crashes.
      const shutdownOnStdinClose = () => {
        logger.info("stdin closed — MCP client disconnected, shutting down");
        logger.close();
        process.exit(0);
      };
      process.stdin.on("end", shutdownOnStdinClose);
      process.stdin.on("error", shutdownOnStdinClose);
      process.stdin.on("close", shutdownOnStdinClose);

      // Run as MCP server with STDIO transport
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
