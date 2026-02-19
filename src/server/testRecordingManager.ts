import { randomUUID } from "node:crypto";
import yaml from "js-yaml";
import { BootedDevice, Plan, PlanStep } from "../models";
import { logger } from "../utils/logger";
import { getMcpServerVersion } from "../utils/mcpVersion";
import { PlanValidator } from "../utils/plan/PlanValidator";
import { defaultTimer, type Timer } from "../utils/SystemTimer";
import { DualTrackRecorder } from "../features/record/android";

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
  recorder: DualTrackRecorder;
}

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
    eventCount: activeRecording.recorder.stepCount,
    durationMs,
  };
}

const buildPlanFromSteps = (
  steps: PlanStep[],
  session: RecordingSession,
  planName: string,
  stoppedAt: number
): { plan: Plan; stepCount: number } => {
  if (steps.length === 0) {
    throw new Error("No recorded interactions were captured.");
  }

  const startedAt = new Date(session.startedAt);
  const durationMs = stoppedAt - session.startedAt;

  const plan: Plan = {
    name: planName,
    description: `Recorded plan with ${steps.length} interaction(s).`,
    steps,
    mcpVersion: getMcpServerVersion(),
    metadata: {
      createdAt: new Date(stoppedAt).toISOString(),
      version: "1.0.0",
      recording: {
        recordingId: session.recordingId,
        startedAt: startedAt.toISOString(),
        stoppedAt: new Date(stoppedAt).toISOString(),
        durationMs,
        deviceId: session.deviceId,
        platform: session.platform,
        interactionCount: steps.length,
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

  const recordingId = randomUUID();
  const startedAt = timer.now();

  const recorder = new DualTrackRecorder(device);
  await recorder.start();

  const session: RecordingSession = {
    recordingId,
    deviceId: device.deviceId,
    platform: device.platform,
    startedAt,
    recorder,
  };

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

  const { steps } = await session.recorder.stop();
  activeRecording = null;

  const stoppedAt = timer.now();
  const resolvedPlanName = formatPlanName(planName);
  const { plan, stepCount } = buildPlanFromSteps(steps, session, resolvedPlanName, stoppedAt);
  const planContent = yaml.dump(plan, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });

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
