import { SessionManager } from "../daemon/sessionManager";
import type { Session } from "../daemon/sessionManager";
import { DevicePool } from "../daemon/devicePool";
import { AndroidAccessibilityServiceManager } from "../utils/AccessibilityServiceManager";
import { NavigationGraphManager } from "../features/navigation/NavigationGraphManager";
import { ActionableError, BootedDevice, Platform } from "../models";
import { logger } from "../utils/logger";
import { KeepScreenAwakeManager, KEEP_SCREEN_AWAKE_STATE_KEY, KeepScreenAwakeState } from "../utils/KeepScreenAwakeManager";
import { AccessibilityServiceClient } from "../features/observe/AccessibilityServiceClient";
import { createPerformanceTracker, type TimingData } from "../utils/PerformanceTracker";

/**
 * Storage for accessibility service setup timing.
 * Keyed by deviceId, consumed once when observe reads it.
 */
const pendingSetupTimings = new Map<string, TimingData>();

/**
 * Store setup timing for a device.
 * Called after accessibility service setup completes.
 */
export function storeSetupTiming(deviceId: string, timing: TimingData): void {
  pendingSetupTimings.set(deviceId, timing);
  logger.info(`[ToolExecutionContext] Stored setup timing for deviceId=${deviceId}`);
}

/**
 * Get and consume the setup timing for a device.
 * Returns the timing data if present and clears it from storage.
 */
export function consumeSetupTiming(deviceId: string): TimingData | null {
  const timing = pendingSetupTimings.get(deviceId);
  const availableKeys = Array.from(pendingSetupTimings.keys());
  if (timing) {
    pendingSetupTimings.delete(deviceId);
    logger.info(`[ToolExecutionContext] Consumed setup timing for deviceId=${deviceId}`);
    return timing;
  }
  if (availableKeys.length > 0) {
    logger.warn(`[ToolExecutionContext] No setup timing for deviceId=${deviceId}, available keys: ${availableKeys.join(", ")}`);
  }
  return null;
}

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
  devicePlatform?: Platform;
  sessionManager?: SessionManager;
  devicePool?: DevicePool;
}

export interface SessionOptions {
  keepScreenAwake?: boolean;
  platform?: Platform;
}

/**
 * Create tool execution context from session UUID
 *
 * Ensures session exists and device is assigned if session UUID provided.
 */
export async function createToolExecutionContext(
  sessionUuid: string | undefined,
  sessionManager: SessionManager,
  devicePool: DevicePool,
  sessionOptions: SessionOptions = {}
): Promise<ToolExecutionContext> {
  if (!sessionUuid) {
    return {};
  }

  const existingSession = sessionManager.getSession(sessionUuid);

  // Get or create session
  const session = await sessionManager.getOrCreateSession(
    sessionUuid,
    devicePool,
    sessionOptions.platform
  );

  await ensureKeepScreenAwake(session, sessionManager, sessionOptions);

  if (!existingSession) {
    if (session.platform === "android") {
      await ensureAccessibilityServiceReady(session.assignedDevice, sessionUuid);
    }

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
    devicePlatform: session.platform,
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

  // Always track setup timing (it's one-time per session and valuable for debugging)
  const perf = createPerformanceTracker(true);
  perf.serial("ensureAccessibilityServiceReady");

  const serviceManager = AndroidAccessibilityServiceManager.getInstance(device);
  const setupResult = await serviceManager.setup(false, perf);

  if (!setupResult.success) {
    perf.end();
    const timings = perf.getTimings();
    if (timings) {
      logger.info(`[ToolExecutionContext] Accessibility service setup failed`, { perfTiming: JSON.stringify(timings, null, 2) });
    }
    throw new ActionableError(
      `Failed to setup accessibility service for session ${sessionId}: ${setupResult.error || setupResult.message}`
    );
  }

  // Wait for WebSocket connection to be ready after setup
  const accessibilityClient = AccessibilityServiceClient.getInstance(deviceId);
  const connected = await perf.track("waitForConnection", () => accessibilityClient.waitForConnection());

  perf.end();
  const timings = perf.getTimings();
  if (timings) {
    storeSetupTiming(deviceId, timings);
    logger.info(`[ToolExecutionContext] Accessibility service ready for session ${sessionId}`, { connected });
  } else {
    logger.warn(`[ToolExecutionContext] No timing data captured for setup (deviceId=${deviceId})`);
  }
}

async function ensureKeepScreenAwake(
  session: Session,
  sessionManager: SessionManager,
  sessionOptions: SessionOptions
): Promise<void> {
  if (session.platform !== "android") {
    return;
  }
  const existingState = session.cacheData.customData?.[KEEP_SCREEN_AWAKE_STATE_KEY] as KeepScreenAwakeState | undefined;
  if (existingState) {
    return;
  }

  const keepScreenAwake = sessionOptions.keepScreenAwake !== false;
  const device: BootedDevice = {
    name: session.assignedDevice,
    platform: "android",
    deviceId: session.assignedDevice
  };
  const manager = new KeepScreenAwakeManager(device);

  let state: KeepScreenAwakeState;
  try {
    state = await manager.apply(keepScreenAwake);
  } catch (error) {
    logger.warn(`[ToolExecutionContext] Failed to apply keep-awake for ${device.deviceId}: ${error}`);
    state = { applied: false, skipReason: "failed" };
  }

  const customData = {
    ...(session.cacheData.customData ?? {}),
    [KEEP_SCREEN_AWAKE_STATE_KEY]: state
  };
  sessionManager.updateSessionCache(session.sessionId, { customData });
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
