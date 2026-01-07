import { PlanStep } from "../../models/Plan";
import { logger } from "../logger";

/**
 * Internal helper for normalizing plan steps
 * Converts legacy formats to current PlanStep structure
 */
export class PlanNormalizer {
  private static isRecord(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * Normalize a raw step object into a PlanStep
   * Handles conversion of 'command' to 'tool' and moves parameters into params object
   * @param step Raw step data from YAML
   * @param index Step index for error messages
   * @returns Normalized PlanStep
   */
  static normalizeStep(step: any, index: number): PlanStep {
    logger.info(`Processing step ${index}:`, JSON.stringify(step, null, 2));

    const toolName = step.tool || step.command;

    if (!toolName || typeof toolName !== "string") {
      throw new Error(`Invalid step at index ${index}: missing or invalid tool/command name`);
    }

    const inlineParams: Record<string, any> = {};
    Object.keys(step).forEach(key => {
      if (key !== "tool" && key !== "command" && key !== "label" && key !== "params") {
        inlineParams[key] = step[key];
      }
    });

    const paramsFromStep = PlanNormalizer.isRecord(step.params) ? step.params : {};

    // Create normalized step - prefer explicit params over inline fields
    const normalizedStep: PlanStep = {
      tool: toolName,
      params: {
        ...inlineParams,
        ...paramsFromStep
      }
    };

    if (typeof step.label === "string") {
      normalizedStep.label = step.label;
    }

    logger.info(`Normalized step ${index}:`, JSON.stringify(normalizedStep, null, 2));
    return normalizedStep;
  }

  /**
   * Normalize an array of steps
   * @param steps Raw steps array from YAML
   * @returns Array of normalized PlanSteps
   */
  static normalizeSteps(steps: any[]): PlanStep[] {
    return steps.map((step, index) => this.normalizeStep(step, index));
  }
}
