import { PlanStep } from "../../models/Plan";
import { logger } from "../../utils/logger";

/**
 * Set of MCP tool names that are relevant for test plan recording.
 * Infrastructure tools (device management, recording meta-tools) are excluded.
 */
export const PLAN_RELEVANT_TOOLS = new Set([
  // App lifecycle
  "launchApp",
  "terminateApp",
  // Observation
  "observe",
  // Interaction
  "tapOn",
  "swipeOn",
  "inputText",
  "clearText",
  "pressButton",
  "pressKey",
  "dragAndDrop",
  "pinchOn",
  "imeAction",
  // Form filling
  "setUIState",
]);

/**
 * Internal routing params injected by ToolRegistry.registerDeviceAware() that
 * should not appear in recorded PlanStep params.
 *
 * Keep in sync with the params injected in src/server/toolRegistry.ts
 * (search for "args.deviceId", "args.sessionUuid", "args.platform", etc.)
 */
export const INTERNAL_PARAMS = new Set([
  "platform",
  "deviceId",
  "sessionUuid",
  "device",
  "devices",
  "keepScreenAwake",
]);

export function stripInternalParams(args: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (!INTERNAL_PARAMS.has(key)) {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Records successful MCP tool calls as PlanStep entries.
 * Designed to be wired into ToolRegistry's wrappedHandler success path.
 */
export class McpCallRecorder {
  private steps: PlanStep[] = [];
  private recording = false;

  start(): void {
    this.steps = [];
    this.recording = true;
    logger.info("[McpCallRecorder] Recording started");
  }

  stop(): PlanStep[] {
    this.recording = false;
    const result = [...this.steps];
    this.steps = [];
    logger.info(`[McpCallRecorder] Recording stopped with ${result.length} steps`);
    return result;
  }

  isRecording(): boolean {
    return this.recording;
  }

  get stepCount(): number {
    return this.steps.length;
  }

  record(toolName: string, args: Record<string, unknown>): void {
    if (!this.recording) {return;}
    if (!PLAN_RELEVANT_TOOLS.has(toolName)) {return;}

    const params = stripInternalParams(args);
    this.steps.push({ tool: toolName, params });
    logger.info(`[McpCallRecorder] Recorded step ${this.steps.length}: ${toolName}`);
  }
}
