import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { DaemonState } from "../daemon/daemonState";
import { ActionableError } from "../models";
import { createJSONToolResponse } from "../utils/toolUtils";

/**
 * Register internal daemon tools
 * These tools are used for daemon state queries and management
 */
export function registerDaemonTools(): void {

  // Available Devices Tool
  ToolRegistry.register(
    "daemon_available_devices",
    "Query the number of available devices in the daemon pool",
    z.object({}).strict(),
    async () => {
      try {
        const pool = DaemonState.getInstance().getDevicePool();
        const idleDevices = pool.getIdleDevices();
        return createJSONToolResponse({
          availableDevices: idleDevices.length,
        });
      } catch (error) {
        throw new ActionableError(
          `Failed to query available devices: ${error instanceof Error ? error.message : String(error)}`
        );
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
}
