import os from "node:os";
import path from "node:path";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { getSocketPath, SocketServerConfig } from "../socketServer/SocketServerTypes";
import { UnifiedSocketServer } from "./UnifiedSocketServer";
import {
  FailuresDomainHandler,
  PerformanceDomainHandler,
  ObservationDomainHandler,
  RecordingDomainHandler,
  AppearanceDomainHandler,
  DeviceDomainHandler,
} from "./handlers";

export * from "./UnifiedSocketTypes";
export * from "./DomainHandler";
export * from "./UnifiedSocketServer";
export * from "./handlers";

const SOCKET_CONFIG: SocketServerConfig = {
  defaultPath: path.join(os.homedir(), ".auto-mobile", "api.sock"),
  externalPath: "/tmp/auto-mobile-api.sock",
};

/**
 * Create a new UnifiedSocketServer with all domain handlers registered.
 */
export function createUnifiedSocketServer(timer: Timer = defaultTimer): UnifiedSocketServer {
  const socketPath = getSocketPath(SOCKET_CONFIG);
  const server = new UnifiedSocketServer(socketPath, timer);

  // Register all domain handlers
  server.registerHandler(new FailuresDomainHandler());
  server.registerHandler(new PerformanceDomainHandler());
  server.registerHandler(new ObservationDomainHandler());
  server.registerHandler(new RecordingDomainHandler());
  server.registerHandler(new AppearanceDomainHandler());
  server.registerHandler(new DeviceDomainHandler());

  return server;
}

// Singleton instance
let unifiedSocketServer: UnifiedSocketServer | null = null;

/**
 * Get the unified socket server singleton, or null if not started.
 */
export function getUnifiedSocketServer(): UnifiedSocketServer | null {
  return unifiedSocketServer;
}

/**
 * Start the unified socket server singleton.
 */
export async function startUnifiedSocketServer(
  timer: Timer = defaultTimer
): Promise<UnifiedSocketServer> {
  if (!unifiedSocketServer) {
    unifiedSocketServer = createUnifiedSocketServer(timer);
  }
  if (!unifiedSocketServer.isListening()) {
    await unifiedSocketServer.start();
  }
  return unifiedSocketServer;
}

/**
 * Stop the unified socket server singleton.
 */
export async function stopUnifiedSocketServer(): Promise<void> {
  if (!unifiedSocketServer) {
    return;
  }
  await unifiedSocketServer.close();
  unifiedSocketServer = null;
}
