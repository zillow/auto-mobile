import { PlanStep } from "../../models/Plan";
import { logger } from "../logger";

/**
 * Internal helper for normalizing plan steps
 * Converts legacy formats to current PlanStep structure
 */
export class PlanNormalizer {
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

    // Create normalized step - start with empty params object
    const normalizedStep: PlanStep = {
      tool: toolName,
      params: {}
    };

    // Copy all properties except tool, command, and label into params
    Object.keys(step).forEach(key => {
      if (key !== "tool" && key !== "command" && key !== "label") {
        normalizedStep.params[key] = step[key];
      }
    });

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
