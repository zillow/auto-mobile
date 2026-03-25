import yaml from "js-yaml";
import { Plan, PlanStep } from "../models";
import { logger } from "../utils/logger";
import { getMcpServerVersion } from "../utils/mcpVersion";
import { PlanValidator } from "../utils/plan/PlanValidator";
import { McpCallRecorder } from "../features/record/McpCallRecorder";
import { defaultTimer, type Timer } from "../utils/SystemTimer";

export interface McpRecordingStartResult {
  recording: boolean;
  startedAt: string;
  alreadyActive?: boolean;
  currentStepCount?: number;
}

export interface McpRecordingStopResult {
  planName: string;
  planContent: string;
  stepCount: number;
  durationMs: number;
  startedAt: string;
  stoppedAt: string;
}

export interface McpRecordingStatus {
  recording: boolean;
  startedAt: string;
  stepCount: number;
  durationMs: number;
}

interface McpRecordingSession {
  recorder: McpCallRecorder;
  startedAt: number;
}

let activeSession: McpRecordingSession | null = null;

/** Reset module state — test-only. */
export function resetMcpRecordingState(): void {
  activeSession = null;
}

export function getMcpRecorder(): McpCallRecorder | null {
  return activeSession?.recorder ?? null;
}

export function getMcpRecordingStatus(timer: Timer = defaultTimer): McpRecordingStatus | null {
  if (!activeSession) return null;
  return {
    recording: activeSession.recorder.isRecording(),
    startedAt: new Date(activeSession.startedAt).toISOString(),
    stepCount: activeSession.recorder.stepCount,
    durationMs: timer.now() - activeSession.startedAt,
  };
}

export function startMcpRecording(timer: Timer = defaultTimer): McpRecordingStartResult {
  if (activeSession) {
    logger.info("[McpRecording] Recording already active, returning existing session");
    return {
      recording: true,
      startedAt: new Date(activeSession.startedAt).toISOString(),
      alreadyActive: true,
      currentStepCount: activeSession.recorder.stepCount,
    };
  }

  const recorder = new McpCallRecorder();
  recorder.start();

  activeSession = {
    recorder,
    startedAt: timer.now(),
  };

  logger.info("[McpRecording] Started MCP call recording");

  return {
    recording: true,
    startedAt: new Date(activeSession.startedAt).toISOString(),
  };
}

const formatPlanName = (planName?: string, timer: Timer = defaultTimer): string => {
  if (planName && planName.trim().length > 0) {
    return planName.trim();
  }
  const timestamp = new Date(timer.now()).toISOString().replace(/[:.]/g, "-");
  return `mcp-recorded-plan-${timestamp}`;
};

export function stopMcpRecording(
  planName?: string,
  timer: Timer = defaultTimer
): McpRecordingStopResult {
  const session = activeSession;
  if (!session) {
    throw new Error("No active MCP recording. Call startMcpRecording first.");
  }

  const steps = session.recorder.stop();
  const stoppedAt = timer.now();
  const resolvedName = formatPlanName(planName, timer);

  if (steps.length === 0) {
    activeSession = null;
    throw new Error(
      "No MCP tool calls were recorded. Ensure plan-relevant tools were called during the recording. " +
      "Call recordSteps with action: \"begin\" to start a new session."
    );
  }

  try {
    const plan: Plan = {
      name: resolvedName,
      steps,
      mcpVersion: getMcpServerVersion(),
      metadata: {
        createdAt: new Date(stoppedAt).toISOString(),
        version: "1.0.0",
        generatedFromToolCalls: true,
        recording: {
          startedAt: new Date(session.startedAt).toISOString(),
          stoppedAt: new Date(stoppedAt).toISOString(),
          durationMs: stoppedAt - session.startedAt,
          interactionCount: steps.length,
        },
      },
    };

    PlanValidator.validate(plan);

    const planContent = yaml.dump(plan, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });

    activeSession = null;
    logger.info(`[McpRecording] Stopped recording with ${steps.length} steps`);

    return {
      planName: resolvedName,
      planContent,
      stepCount: steps.length,
      durationMs: stoppedAt - session.startedAt,
      startedAt: new Date(session.startedAt).toISOString(),
      stoppedAt: new Date(stoppedAt).toISOString(),
    };
  } catch (error) {
    activeSession = null;
    throw error;
  }
}
