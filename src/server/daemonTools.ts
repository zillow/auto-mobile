import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { DaemonState } from "../daemon/daemonState";
import { ActionableError } from "../models";
import { createJSONToolResponse } from "../utils/toolUtils";
import { logger } from "../utils/logger";

/**
 * Register internal daemon tools
 * These tools are used for daemon state queries and management
 */
export function registerDaemonTools(): void {

  // Available Devices Tool
  ToolRegistry.register(
    "daemon_available_devices",
    "Query number of available devices in daemon pool",
    z.object({}).strict(),
    async () => {
      try {
        logger.info("[daemon_available_devices] TOOL CALLED!");
        const state = DaemonState.getInstance();
        logger.info("[daemon_available_devices] Got DaemonState instance");
        const isInitialized = state.isInitialized();
        logger.info(`[daemon_available_devices] DaemonState initialized: ${isInitialized}`);

        if (!isInitialized) {
          logger.error("[daemon_available_devices] DaemonState not initialized!");
          return createJSONToolResponse({
            message: "Daemon not running or device pool not initialized",
            availableDevices: 0,
            totalDevices: 0,
          });
        }

        const devicePool = state.getDevicePool();
        logger.info("[daemon_available_devices] Got device pool");
        const stats = devicePool.getStats();
        logger.info(`[daemon_available_devices] Device pool stats: ${JSON.stringify(stats)}`);

        return createJSONToolResponse({
          message: `Device pool status: ${stats.idle} idle, ${stats.assigned} assigned, ${stats.error} error (${stats.total} total)`,
          availableDevices: stats.idle,
          totalDevices: stats.total,
          assignedDevices: stats.assigned,
          errorDevices: stats.error,
          stats: stats,
        });
      } catch (error) {
        logger.error(`[daemon_available_devices] ERROR: ${error}`);
        logger.error(`[daemon_available_devices] Stack: ${error instanceof Error ? error.stack : "no stack"}`);
        throw error;
      }
    }
  );

  // Session Info Tool
  ToolRegistry.register(
    "daemon_session_info",
    "Get information about an existing session",
    z.object({
      sessionId: z.string().describe("Session UUID"),
    }).strict(),
    async (args: { sessionId: string }) => {
      try {
        const manager = DaemonState.getInstance().getSessionManager();
        const session = manager.getSession(args.sessionId);
        if (!session) {
          throw new ActionableError(`Session not found: ${args.sessionId}`);
        }
        return createJSONToolResponse({
          sessionId: session.sessionId,
          assignedDevice: session.assignedDevice,
          createdAt: session.createdAt,
          lastUsedAt: session.lastUsedAt,
          expiresAt: session.expiresAt,
          cacheSize: JSON.stringify(session.cacheData).length,
        });
      } catch (error) {
        if (error instanceof ActionableError) {
          throw error;
        }
        throw new ActionableError(
          `Failed to get session info: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Release Session Tool
  ToolRegistry.register(
    "daemon_release_session",
    "Release a session and free its device",
    z.object({
      sessionId: z.string().describe("Session UUID to release"),
    }).strict(),
    async (args: { sessionId: string }) => {
      try {
        const manager = DaemonState.getInstance().getSessionManager();
        const pool = DaemonState.getInstance().getDevicePool();
        const session = manager.getSession(args.sessionId);
        if (!session) {
          throw new ActionableError(`Session not found: ${args.sessionId}`);
        }
        const deviceId = session.assignedDevice;
        manager.releaseSession(args.sessionId);
        pool.releaseDevice(deviceId);
        return createJSONToolResponse({
          message: `Session ${args.sessionId} released`,
          device: deviceId,
        });
      } catch (error) {
        if (error instanceof ActionableError) {
          throw error;
        }
        throw new ActionableError(
          `Failed to release session: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Refresh Device Pool Tool
  ToolRegistry.register(
    "daemon_refresh_devices",
    "Refresh device pool by discovering connected devices",
    z.object({}).strict(),
    async () => {
      try {
        const pool = DaemonState.getInstance().getDevicePool();
        const addedCount = await pool.refreshDevices();
        const stats = pool.getStats();
        return createJSONToolResponse({
          message: `Device pool refreshed: added ${addedCount} new devices`,
          addedDevices: addedCount,
          totalDevices: stats.total,
          availableDevices: stats.idle,
          stats: stats,
        });
      } catch (error) {
        throw new ActionableError(
          `Failed to refresh device pool: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
