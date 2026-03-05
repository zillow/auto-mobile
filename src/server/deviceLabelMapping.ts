import { DaemonState } from "../daemon/daemonState";
import { ActionableError } from "../models";
import { createToolExecutionContext, updateSessionCache } from "./ToolExecutionContext";
import type { SessionOptions } from "./ToolExecutionContext";
import { logger } from "../utils/logger";

type DeviceLabelMap = Record<string, string>;

const DEVICE_LABEL_CACHE_KEY = "deviceLabelMap";

const buildDeviceLabelList = (labels: string[]): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const label of labels) {
    if (typeof label !== "string") {
      continue;
    }
    const trimmed = label.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
};

export const buildDeviceLabelMap = (
  labels: string[],
  baseSessionUuid: string,
  primaryLabel?: string
): DeviceLabelMap => {
  const uniqueLabels = buildDeviceLabelList(labels);
  if (uniqueLabels.length === 0) {
    return {};
  }

  const resolvedPrimaryLabel =
    (primaryLabel && uniqueLabels.includes(primaryLabel))
      ? primaryLabel
      : (uniqueLabels.includes("A") ? "A" : uniqueLabels[0]);

  const map: DeviceLabelMap = {};
  for (const label of uniqueLabels) {
    map[label] = label === resolvedPrimaryLabel
      ? baseSessionUuid
      : `${baseSessionUuid}:${label}`;
  }

  return map;
};

export const getDeviceLabelMap = (baseSessionUuid: string): DeviceLabelMap | null => {
  if (!DaemonState.getInstance().isInitialized()) {
    return null;
  }

  const sessionManager = DaemonState.getInstance().getSessionManager();
  const session = sessionManager.getSession(baseSessionUuid);
  if (!session) {
    return null;
  }

  const map = session.cacheData.customData?.[DEVICE_LABEL_CACHE_KEY];
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return null;
  }

  return map as DeviceLabelMap;
};

export const registerDeviceLabelMap = async (
  baseSessionUuid: string,
  labels: string[],
  primaryLabel?: string,
  sessionOptions: SessionOptions = {}
): Promise<DeviceLabelMap> => {
  if (!DaemonState.getInstance().isInitialized()) {
    throw new ActionableError("Device labels require an active daemon session.");
  }

  const devicePool = DaemonState.getInstance().getDevicePool();
  const sessionManager = DaemonState.getInstance().getSessionManager();
  const deviceLabelMap = buildDeviceLabelMap(labels, baseSessionUuid, primaryLabel);

  if (Object.keys(deviceLabelMap).length === 0) {
    return deviceLabelMap;
  }

  const baseContext = await createToolExecutionContext(baseSessionUuid, sessionManager, devicePool, sessionOptions);
  await updateSessionCache(baseContext, DEVICE_LABEL_CACHE_KEY, deviceLabelMap);

  const assignedSessions = new Set(Object.values(deviceLabelMap));
  assignedSessions.delete(baseSessionUuid);

  for (const sessionUuid of assignedSessions) {
    await createToolExecutionContext(sessionUuid, sessionManager, devicePool, sessionOptions);
  }

  logger.info(`[DeviceLabelMap] Registered labels for session ${baseSessionUuid}: ${Object.keys(deviceLabelMap).join(", ")}`);
  return deviceLabelMap;
};

export const releaseDeviceLabelSessions = async (baseSessionUuid: string): Promise<string[]> => {
  if (!DaemonState.getInstance().isInitialized()) {
    return [];
  }

  const map = getDeviceLabelMap(baseSessionUuid);
  if (!map) {
    return [];
  }

  const devicePool = DaemonState.getInstance().getDevicePool();
  const sessionManager = DaemonState.getInstance().getSessionManager();
  const sessions = new Set(Object.values(map));
  const released: string[] = [];

  sessions.delete(baseSessionUuid);

  for (const sessionUuid of sessions) {
    const session = sessionManager.getSession(sessionUuid);
    if (!session) {
      continue;
    }
    const deviceId = session.assignedDevice;
    sessionManager.releaseSession(sessionUuid);
    await devicePool.releaseDevice(deviceId);
    released.push(sessionUuid);
  }

  if (released.length > 0) {
    logger.info(`[DeviceLabelMap] Released label sessions for base ${baseSessionUuid}: ${released.join(", ")}`);
  }

  return released;
};
