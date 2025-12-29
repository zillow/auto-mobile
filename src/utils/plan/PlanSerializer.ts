import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import { Plan, PlanStep } from "../../models/Plan";
import { logger } from "../logger";
import { PlanNormalizer } from "./PlanNormalizer";

/**
 * Interface for plan serialization/deserialization
 * Handles YAML export and import of plans
 */
export interface PlanSerializer {
  /**
   * Export a plan from logged tool calls in a directory
   * @param logDir Directory containing log files
   * @param planName Name for the exported plan
   * @param outputPath Path where the plan YAML will be written
   * @returns Promise with export result including success status, plan path, content, and step count
   */
  exportPlanFromLogs(
    logDir: string,
    planName: string,
    outputPath: string,
  ): Promise<{
    success: boolean;
    planPath?: string;
    planContent?: string;
    stepCount?: number;
    error?: string;
  }>;

  /**
   * Import a plan from YAML content
   * @param yamlContent YAML string containing plan definition
   * @returns Parsed Plan object
   * @throws Error if YAML is invalid or plan structure is incorrect
   */
  importPlanFromYaml(yamlContent: string): Plan;
}

// Tools that should be omitted from plans
const OMITTED_TOOLS = new Set([
  "startDevice",
  "killDevice",
  "listDeviceImages",
  "checkRunningDevices",
  "listDevices",
  "setActiveDevice"
]);

/**
 * YAML-based plan serialization implementation
 * Provides YAML export and import capabilities for Plan objects
 */
export class YamlPlanSerializer implements PlanSerializer {
  /**
   * Check if a tool call should be included in the plan
   */
  private static shouldIncludeInPlan(toolName: string, isLastObserve: boolean): boolean {
    if (OMITTED_TOOLS.has(toolName)) {
      return false;
    }

    // Include all non-observe tools
    if (toolName !== "observe") {
      return true;
    }

    // For observe calls, only include the last one
    return isLastObserve;
  }

  /**
   * Export a plan from logged tool calls in a directory
   * @param logDir Directory containing log files
   * @param planName Name for the exported plan
   * @param outputPath Path where the plan YAML will be written
   * @returns Promise with export result including success status, plan path, content, and step count
   */
  async exportPlanFromLogs(
    logDir: string,
    planName: string,
    outputPath: string
  ): Promise<{
    success: boolean;
    planPath?: string;
    planContent?: string;
    stepCount?: number;
    error?: string;
  }> {
    try {
      // Read all log files in the directory
      const files = await fs.readdir(logDir);
      const logFiles = files.filter(f => f.endsWith(".json")).sort();

      if (logFiles.length === 0) {
        return { success: false, error: "No log files found" };
      }

      // Collect all successful tool calls
      const allToolCalls: Array<{
        timestamp: string;
        tool: string;
        params: Record<string, any>;
        result: { success: boolean; data?: any; error?: string };
      }> = [];

      for (const logFile of logFiles) {
        try {
          const logPath = path.join(logDir, logFile);
          const content = await fs.readFile(logPath, "utf-8");

          // Handle both single JSON objects and newline-delimited JSON
          const lines = content.trim().split("\n").filter(line => line.trim());

          for (const line of lines) {
            try {
              const logEntry = JSON.parse(line.trim());
              if (logEntry.result?.success) {
                allToolCalls.push(logEntry);
              }
            } catch (parseError) {
              logger.warn(`Failed to parse line in ${logFile}: ${parseError}`);
            }
          }
        } catch (error) {
          logger.warn(`Failed to read log file ${logFile}: ${error}`);
        }
      }

      if (allToolCalls.length === 0) {
        return { success: false, error: "No successful tool calls found in logs" };
      }

      // Sort by timestamp
      allToolCalls.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Find the last observe call
      let lastObserveIndex = -1;
      for (let i = allToolCalls.length - 1; i >= 0; i--) {
        if (allToolCalls[i].tool === "observe") {
          lastObserveIndex = i;
          break;
        }
      }

      // Filter tools and create plan steps
      const planSteps: PlanStep[] = [];

      for (let i = 0; i < allToolCalls.length; i++) {
        const toolCall = allToolCalls[i];
        const isLastObserve = i === lastObserveIndex;

        if (YamlPlanSerializer.shouldIncludeInPlan(toolCall.tool, isLastObserve)) {
          planSteps.push({
            tool: toolCall.tool,
            params: toolCall.params
          });
        }
      }

      // Create the plan
      const plan: Plan = {
        name: planName,
        description: `Exported plan with ${planSteps.length} steps`,
        steps: planSteps,
        metadata: {
          createdAt: new Date().toISOString(),
          version: "1.0.0"
        }
      };

      // Convert to YAML
      const yamlContent = yaml.dump(plan, {
        indent: 2,
        lineWidth: -1,
        noRefs: true
      });

      // Write to file
      await fs.writeFile(outputPath, yamlContent, "utf-8");
      logger.info(`Plan exported to ${outputPath}`);

      return {
        success: true,
        planPath: outputPath,
        planContent: yamlContent,
        stepCount: planSteps.length
      };

    } catch (error) {
      logger.error(`Failed to export plan: ${error}`);
      return { success: false, error: `${error}` };
    }
  }

  /**
   * Import a plan from YAML content
   * @param yamlContent YAML string containing plan definition
   * @returns Parsed Plan object
   * @throws Error if YAML is invalid or plan structure is incorrect
   */
  importPlanFromYaml(yamlContent: string): Plan {
    try {
      logger.info("=== Starting importPlanFromYaml ===");
      logger.info("Parsing YAML content:", yamlContent.substring(0, 200) + "...");

      let rawPlan: any;
      try {
        rawPlan = yaml.load(yamlContent) as any;
        logger.info("Raw plan loaded successfully");
      } catch (yamlError) {
        throw new Error(`YAML parsing failed: ${yamlError}`);
      }

      logger.info("Raw plan loaded:", JSON.stringify(rawPlan, null, 2));

      // Handle both legacy and new field names
      const planName = rawPlan.name || rawPlan.planName;
      const steps = rawPlan.steps;

      // Validate basic structure
      if (!planName || !steps || !Array.isArray(steps)) {
        throw new Error("Invalid plan structure: missing name/planName or steps");
      }

      logger.info(`Processing ${steps.length} steps`);

      // Normalize steps - convert 'command' to 'tool' if needed
      let normalizedSteps: PlanStep[];
      try {
        normalizedSteps = PlanNormalizer.normalizeSteps(steps);
      } catch (stepError) {
        throw new Error(`Step processing failed: ${stepError}`);
      }

      logger.info("=== Plan creation ===");

      const plan: Plan = {
        name: planName,
        description: rawPlan.description || `Plan with ${normalizedSteps.length} steps`,
        steps: normalizedSteps,
        metadata: rawPlan.metadata || {
          createdAt: new Date().toISOString(),
          version: "1.0.0"
        }
      };

      return plan;
    } catch (error) {
      throw new Error(`Failed to parse plan YAML: ${error}`);
    }
  }
}
