import { SessionManager } from "../daemon/sessionManager";
import { DevicePool } from "../daemon/devicePool";
import { AndroidAccessibilityServiceManager } from "../utils/AccessibilityServiceManager";
import { NavigationGraphManager } from "../features/navigation/NavigationGraphManager";
import { ActionableError, BootedDevice } from "../models";
import { logger } from "../utils/logger";

/**
 * Tool Execution Context
 *
 * Provides session and device context to tools executing within the daemon.
 * Enables tools to:
 * - Access assigned device for session
 * - Update session cache after execution
 * - Share state across tool calls within same session
 */
export interface ToolExecutionContext {
  sessionId?: string;
  deviceId?: string;
  sessionManager?: SessionManager;
  devicePool?: DevicePool;
}

/**
 * Create tool execution context from session UUID
 *
 * Ensures session exists and device is assigned if session UUID provided.
 */
export async function createToolExecutionContext(
  sessionUuid: string | undefined,
  sessionManager: SessionManager,
  devicePool: DevicePool
): Promise<ToolExecutionContext> {
  if (!sessionUuid) {
    return {};
  }

  const existingSession = sessionManager.getSession(sessionUuid);

  // Get or create session
  const session = await sessionManager.getOrCreateSession(sessionUuid, devicePool);

  if (!existingSession) {
    await ensureAccessibilityServiceReady(session.assignedDevice, sessionUuid);

    // Start test coverage session for navigation graph tracking
    // This enables automatic tracking of screens and transitions during test execution
    const navManager = NavigationGraphManager.getInstance();
    if (navManager.getCurrentAppId()) {
      await navManager.startTestSession(sessionUuid);
      logger.info(`[ToolExecutionContext] Started test coverage tracking for session ${sessionUuid}`);
    }
  }

  return {
    sessionId: sessionUuid,
    deviceId: session.assignedDevice,
    sessionManager,
    devicePool,
  };
}

async function ensureAccessibilityServiceReady(deviceId: string, sessionId: string): Promise<void> {
  const device: BootedDevice = {
    name: deviceId,
    platform: "android",
    deviceId
  };
  logger.info(`[ToolExecutionContext] Ensuring accessibility service is ready for session ${sessionId}`);
  const serviceManager = AndroidAccessibilityServiceManager.getInstance(device);
  const setupResult = await serviceManager.setup();
  if (!setupResult.success) {
    throw new ActionableError(
      `Failed to setup accessibility service for session ${sessionId}: ${setupResult.error || setupResult.message}`
    );
  }
}

/**
 * Update session cache after tool execution
 *
 * Tools can use this to cache results (hierarchy, screenshot, etc.)
 * for reuse across tool calls within the same session.
 */
export async function updateSessionCache(
  context: ToolExecutionContext,
  cacheKey: string,
  cacheValue: any
): Promise<void> {
  if (!context.sessionId || !context.sessionManager) {
    return;
  }

  const session = context.sessionManager.getSession(context.sessionId);
  if (!session) {
    return;
  }

  if (!session.cacheData.customData) {
    session.cacheData.customData = {};
  }

  session.cacheData.customData[cacheKey] = cacheValue;
  context.sessionManager.updateSessionCache(context.sessionId, session.cacheData);
}

/**
 * Get cached data from session
 *
 * Tools can use this to retrieve previously cached data
 * from earlier tool calls within the same session.
 */
export function getSessionCache(
  context: ToolExecutionContext,
  cacheKey: string
): any {
  if (!context.sessionId || !context.sessionManager) {
    return undefined;
  }

  const session = context.sessionManager.getSession(context.sessionId);
  if (!session) {
    return undefined;
  }

  return session.cacheData.customData?.[cacheKey];
}
