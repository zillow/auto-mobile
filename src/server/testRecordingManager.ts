import { randomUUID } from "node:crypto";
import yaml from "js-yaml";
import { BootedDevice, Plan, PlanStep, Element } from "../models";
import { AccessibilityServiceClient, InteractionEvent } from "../features/observe/android";
import { logger } from "../utils/logger";
import { getMcpServerVersion } from "../utils/mcpVersion";
import { PlanValidator } from "../utils/plan/PlanValidator";
import { defaultTimer, type Timer } from "../utils/SystemTimer";

export interface TestRecordingStartResult {
  recordingId: string;
  startedAt: string;
  deviceId: string;
  platform: string;
}

export interface TestRecordingStopResult {
  recordingId: string;
  startedAt: string;
  stoppedAt: string;
  durationMs: number;
  planName: string;
  planContent: string;
  stepCount: number;
  deviceId: string;
  platform: string;
}

export interface TestRecordingStatus {
  recordingId: string;
  deviceId: string;
  platform: string;
  startedAt: string;
  eventCount: number;
  durationMs: number;
}

interface RecordingSession {
  recordingId: string;
  deviceId: string;
  platform: string;
  startedAt: number;
  events: InteractionEvent[];
  unsubscribe: () => void;
  lastInputKey?: string;
  lastInputTimestamp?: number;
  lastInputIndex?: number;
  lastSwipeKey?: string;
  lastSwipeTimestamp?: number;
  lastSwipeIndex?: number;
}

const INPUT_COALESCE_WINDOW_MS = 800;
const SWIPE_COALESCE_WINDOW_MS = 600;

let activeRecording: RecordingSession | null = null;

export function getTestRecordingStatus(timer: Timer = defaultTimer): TestRecordingStatus | null {
  if (!activeRecording) {
    return null;
  }

  const durationMs = timer.now() - activeRecording.startedAt;

  return {
    recordingId: activeRecording.recordingId,
    deviceId: activeRecording.deviceId,
    platform: activeRecording.platform,
    startedAt: new Date(activeRecording.startedAt).toISOString(),
    eventCount: activeRecording.events.length,
    durationMs,
  };
}

const buildElementKey = (event: InteractionEvent): string | null => {
  const element = event.element;
  if (!element) {
    return null;
  }
  const resourceId = element["resource-id"] ?? "";
  const contentDesc = element["content-desc"] ?? "";
  const className = element["class"] ?? "";
  if (!resourceId && !contentDesc && !className) {
    return null;
  }
  return `${resourceId}|${contentDesc}|${className}`;
};

const recordInteraction = (session: RecordingSession, event: InteractionEvent, timer: Timer = defaultTimer): void => {
  const elementKey = buildElementKey(event);
  const timestamp = event.timestamp ?? timer.now();

  if (event.type === "inputText" && elementKey) {
    const lastTimestamp = session.lastInputTimestamp ?? 0;
    if (
      session.lastInputKey === elementKey &&
      session.lastInputIndex !== undefined &&
      timestamp - lastTimestamp <= INPUT_COALESCE_WINDOW_MS
    ) {
      const existing = session.events[session.lastInputIndex];
      if (existing && existing.type === "inputText") {
        existing.text = event.text ?? existing.text;
        existing.timestamp = timestamp;
        existing.packageName = event.packageName ?? existing.packageName;
        existing.screenClassName = event.screenClassName ?? existing.screenClassName;
      }
      session.lastInputTimestamp = timestamp;
      return;
    }
  }

  if (event.type === "swipe" && elementKey) {
    const lastTimestamp = session.lastSwipeTimestamp ?? 0;
    if (
      session.lastSwipeKey === elementKey &&
      session.lastSwipeIndex !== undefined &&
      timestamp - lastTimestamp <= SWIPE_COALESCE_WINDOW_MS
    ) {
      const existing = session.events[session.lastSwipeIndex];
      if (existing && existing.type === "swipe") {
        existing.scrollDeltaX = (existing.scrollDeltaX ?? 0) + (event.scrollDeltaX ?? 0);
        existing.scrollDeltaY = (existing.scrollDeltaY ?? 0) + (event.scrollDeltaY ?? 0);
        existing.timestamp = timestamp;
        existing.packageName = event.packageName ?? existing.packageName;
        existing.screenClassName = event.screenClassName ?? existing.screenClassName;
      }
      session.lastSwipeTimestamp = timestamp;
      return;
    }
  }

  session.events.push({ ...event, timestamp });
  const eventIndex = session.events.length - 1;

  if (event.type === "inputText") {
    session.lastInputKey = elementKey ?? undefined;
    session.lastInputTimestamp = timestamp;
    session.lastInputIndex = eventIndex;
  } else if (event.type === "swipe") {
    session.lastSwipeKey = elementKey ?? undefined;
    session.lastSwipeTimestamp = timestamp;
    session.lastSwipeIndex = eventIndex;
  }
};

const resolveSwipeDirection = (
  scrollDeltaX?: number,
  scrollDeltaY?: number
): "up" | "down" | "left" | "right" | null => {
  const deltaX = scrollDeltaX ?? 0;
  const deltaY = scrollDeltaY ?? 0;

  if (deltaX === 0 && deltaY === 0) {
    return null;
  }

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX > 0 ? "left" : "right";
  }

  return deltaY > 0 ? "up" : "down";
};

const buildRecordedMetadata = (event: InteractionEvent): Record<string, any> => {
  const element = event.element;
  const recordedElement = element
    ? {
      resourceId: element["resource-id"],
      text: element.text,
      contentDescription: element["content-desc"],
      className: element["class"],
      bounds: element.bounds,
    }
    : undefined;

  return {
    timestamp: new Date(event.timestamp).toISOString(),
    packageName: event.packageName,
    screenClassName: event.screenClassName,
    element: recordedElement,
    scrollDeltaX: event.scrollDeltaX,
    scrollDeltaY: event.scrollDeltaY,
  };
};

const buildSelector = (
  element?: Partial<Element>
): { elementId?: string; text?: string } | null => {
  if (!element) {
    return null;
  }
  const resourceId = element["resource-id"];
  if (resourceId) {
    return { elementId: resourceId };
  }

  const text = element.text ?? element["content-desc"];
  if (text) {
    return { text };
  }

  return null;
};

const buildPlanSteps = (events: InteractionEvent[]): PlanStep[] => {
  const steps: PlanStep[] = [];

  const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

  for (const event of sortedEvents) {
    if (event.type === "tap" || event.type === "longPress") {
      const selector = buildSelector(event.element);
      if (!selector) {
        logger.warn("[TestRecording] Skipping tap without selector");
        continue;
      }
      steps.push({
        tool: "tapOn",
        params: {
          ...selector,
          action: event.type === "longPress" ? "longPress" : "tap",
          recorded: buildRecordedMetadata(event),
        },
      });
      continue;
    }

    if (event.type === "inputText") {
      if (event.text === undefined) {
        logger.warn("[TestRecording] Skipping inputText without text payload");
        continue;
      }
      steps.push({
        tool: "inputText",
        params: {
          text: event.text,
          recorded: buildRecordedMetadata(event),
        },
      });
      continue;
    }

    if (event.type === "swipe") {
      const direction = resolveSwipeDirection(event.scrollDeltaX, event.scrollDeltaY);
      if (!direction) {
        logger.warn("[TestRecording] Skipping swipe without direction");
        continue;
      }

      const selector = buildSelector(event.element);
      const params: Record<string, any> = {
        direction,
        recorded: buildRecordedMetadata(event),
      };

      if (selector) {
        params.container = selector.elementId
          ? { elementId: selector.elementId }
          : { text: selector.text };
      }

      steps.push({ tool: "swipeOn", params });
    }
  }

  return steps;
};

const buildPlan = (session: RecordingSession, planName: string): { plan: Plan; stepCount: number } => {
  const steps = buildPlanSteps(session.events);
  if (steps.length === 0) {
    throw new Error("No recorded interactions were captured.");
  }

  const now = new Date();
  const startedAt = new Date(session.startedAt);
  const durationMs = now.getTime() - session.startedAt;
  const appId = session.events.find(event => event.packageName)?.packageName;

  const plan: Plan = {
    name: planName,
    description: `Recorded plan with ${steps.length} interaction(s).`,
    steps,
    mcpVersion: getMcpServerVersion(),
    metadata: {
      createdAt: now.toISOString(),
      version: "1.0.0",
      appId,
      recording: {
        recordingId: session.recordingId,
        startedAt: startedAt.toISOString(),
        stoppedAt: now.toISOString(),
        durationMs,
        deviceId: session.deviceId,
        platform: session.platform,
        interactionCount: session.events.length,
      },
    },
  };

  PlanValidator.validate(plan);

  return { plan, stepCount: steps.length };
};

const formatPlanName = (planName?: string): string => {
  if (planName && planName.trim().length > 0) {
    return planName.trim();
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `recorded-plan-${timestamp}`;
};

export async function startTestRecording(device: BootedDevice, timer: Timer = defaultTimer): Promise<TestRecordingStartResult> {
  if (activeRecording) {
    if (activeRecording.deviceId !== device.deviceId) {
      throw new Error(
        `Recording already active on device ${activeRecording.deviceId} (${activeRecording.recordingId}). ` +
        `Stop the existing recording before starting a new one on ${device.deviceId}.`
      );
    }
    logger.info(`[TestRecording] Recording already active (${activeRecording.recordingId}), returning existing session`);
    return {
      recordingId: activeRecording.recordingId,
      startedAt: new Date(activeRecording.startedAt).toISOString(),
      deviceId: activeRecording.deviceId,
      platform: activeRecording.platform,
    };
  }

  if (device.platform !== "android") {
    throw new Error(`Test recording is only supported on Android right now (got ${device.platform}).`);
  }

  const accessibilityClient = AccessibilityServiceClient.getInstance(device);
  const connected = await accessibilityClient.ensureConnected();
  if (!connected) {
    throw new Error("Unable to connect to the accessibility service for interaction capture.");
  }

  const recordingId = randomUUID();
  const startedAt = timer.now();

  const session: RecordingSession = {
    recordingId,
    deviceId: device.deviceId,
    platform: device.platform,
    startedAt,
    events: [],
    unsubscribe: () => {},
  };

  const unsubscribe = accessibilityClient.onInteraction(event => recordInteraction(session, event));
  session.unsubscribe = unsubscribe;

  activeRecording = session;

  logger.info(`[TestRecording] Started recording ${recordingId} on ${device.deviceId}`);

  return {
    recordingId,
    startedAt: new Date(startedAt).toISOString(),
    deviceId: device.deviceId,
    platform: device.platform,
  };
}

export async function stopTestRecording(
  recordingId?: string,
  planName?: string,
  timer: Timer = defaultTimer
): Promise<TestRecordingStopResult> {
  const session = activeRecording;
  if (!session) {
    throw new Error("No active recording. Start a recording before stopping.");
  }

  if (recordingId && recordingId !== session.recordingId) {
    throw new Error(
      `Recording ID ${recordingId} does not match active recording ${session.recordingId}.`
    );
  }

  session.unsubscribe();
  activeRecording = null;

  const resolvedPlanName = formatPlanName(planName);
  const { plan, stepCount } = buildPlan(session, resolvedPlanName);
  const planContent = yaml.dump(plan, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });

  const stoppedAt = timer.now();
  const durationMs = stoppedAt - session.startedAt;

  logger.info(`[TestRecording] Stopped recording ${session.recordingId} with ${stepCount} steps`);

  return {
    recordingId: session.recordingId,
    startedAt: new Date(session.startedAt).toISOString(),
    stoppedAt: new Date(stoppedAt).toISOString(),
    durationMs,
    planName: resolvedPlanName,
    planContent,
    stepCount,
    deviceId: session.deviceId,
    platform: session.platform,
  };
}
