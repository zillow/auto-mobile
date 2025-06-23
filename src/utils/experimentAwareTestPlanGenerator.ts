import { Plan, PlanStep } from "../models/Plan";
import { ExperimentContext } from "../models/McpServerConfiguration";
import { AbTestManager } from "./abTestManager";
import { logger } from "./logger";

export interface LoggedToolCall {
    timestamp: string;
    tool: string;
    params: Record<string, any>;
    result: { success: boolean; data?: any; error?: string };
}

export class ExperimentAwareTestPlanGenerator {
  private abTestManager: AbTestManager;

  constructor(abTestManager: AbTestManager) {
    this.abTestManager = abTestManager;
  }

  /**
     * Generate a test plan with experiment context
     */
  public generatePlan(
    toolCalls: LoggedToolCall[],
    experimentContext?: ExperimentContext
  ): Plan {
    const basePlan = this.generateBasePlan(toolCalls);

    // Get experiment context if not provided
    const context = experimentContext || this.abTestManager.generateExperimentContext();

    // Add experiment-specific metadata and steps if there are active experiments
    if (context.activeExperimentIds.length > 0) {
      basePlan.metadata = {
        createdAt: basePlan.metadata?.createdAt || new Date().toISOString(),
        version: basePlan.metadata?.version || "1.0.0",
        ...(basePlan.metadata || {}),
        experiments: context.activeExperimentIds,
        treatments: context.treatments,
        featureFlags: context.featureFlags
      };

      // Add experiment setup steps at the beginning
      const setupSteps = this.generateExperimentSetupSteps(context);
      basePlan.steps.unshift(...setupSteps);

      // Add experiment validation steps at the end
      const validationSteps = this.generateExperimentValidationSteps(context);
      basePlan.steps.push(...validationSteps);

      // Update plan name and description to reflect experiment context
      const experimentNames = context.activeExperimentIds.join(", ");
      basePlan.name = `${basePlan.name} - Experiments: ${experimentNames}`;
      basePlan.description = `${basePlan.description}\n\nActive experiments: ${experimentNames}`;

      logger.info(`Generated experiment-aware test plan with ${context.activeExperimentIds.length} experiments`);
    }

    return basePlan;
  }

  /**
     * Generate base plan from tool calls (similar to existing plan generation)
     */
  private generateBasePlan(toolCalls: LoggedToolCall[]): Plan {
    // Filter successful tool calls and create steps
    const successfulCalls = toolCalls.filter(call => call.result.success);

    const steps: PlanStep[] = successfulCalls.map(call => ({
      tool: call.tool,
      params: call.params
    }));

    return {
      name: "Generated Test Plan",
      description: `Test plan generated from ${steps.length} tool calls`,
      steps,
      metadata: {
        createdAt: new Date().toISOString(),
        version: "1.0.0",
        generatedFromToolCalls: true
      }
    };
  }

  /**
     * Generate experiment setup steps
     */
  private generateExperimentSetupSteps(context: ExperimentContext): PlanStep[] {
    const setupSteps: PlanStep[] = [];

    // Set feature flags first
    if (Object.keys(context.featureFlags).length > 0) {
      setupSteps.push({
        tool: "setFeatureFlags",
        params: {
          flags: context.featureFlags
        }
      });
    }

    // Apply experiment treatments
    context.activeExperimentIds.forEach((experimentId: string) => {
      const treatment = context.treatments[experimentId];
      if (treatment) {
        const treatmentParams = this.abTestManager.getTreatmentForExperiment(experimentId)?.parameters || {};

        // Add step to configure experiment parameters
        setupSteps.push({
          tool: "configureExperiment",
          params: {
            experimentId,
            treatmentId: treatment,
            parameters: treatmentParams
          }
        });
      }
    });

    // Add comment step for clarity
    if (setupSteps.length > 0) {
      setupSteps.unshift({
        tool: "comment",
        params: {
          message: `Setting up A/B test experiments: ${context.activeExperimentIds.join(", ")}`
        }
      });
    }

    return setupSteps;
  }

  /**
     * Generate experiment validation steps
     */
  private generateExperimentValidationSteps(context: ExperimentContext): PlanStep[] {
    const validationSteps: PlanStep[] = [];

    // Add comment step for clarity
    if (context.activeExperimentIds.length > 0) {
      validationSteps.push({
        tool: "comment",
        params: {
          message: `Validating A/B test experiment effects: ${context.activeExperimentIds.join(", ")}`
        }
      });
    }

    // Validate feature flags are applied correctly
    Object.entries(context.featureFlags).forEach(([flagName, expectedValue]) => {
      validationSteps.push({
        tool: "validateFeatureFlag",
        params: {
          flag: flagName,
          expectedValue
        }
      });
    });

    // Validate experiment-specific UI elements or behaviors
    context.activeExperimentIds.forEach((experimentId: string) => {
      const treatment = this.abTestManager.getTreatmentForExperiment(experimentId);
      if (treatment) {
        // Generate validation steps based on treatment parameters
        const validationStep = this.generateExperimentSpecificValidation(experimentId, treatment.parameters);
        if (validationStep) {
          validationSteps.push(validationStep);
        }
      }
    });

    return validationSteps;
  }

  /**
     * Generate experiment-specific validation steps based on treatment parameters
     */
  private generateExperimentSpecificValidation(experimentId: string, parameters: Record<string, any>): PlanStep | null {
    // This is where you would add logic specific to your experiments
    // For example, if an experiment changes UI elements, you'd validate those changes

    // Example validation for common experiment patterns
    if (parameters.new_ui_enabled === true) {
      return {
        tool: "assertVisible",
        params: {
          text: "New UI Element"
        }
      };
    }

    if (parameters.feature_enabled === false) {
      return {
        tool: "assertNotVisible",
        params: {
          text: "Disabled Feature"
        }
      };
    }

    // Default validation: just check that the experiment is active
    return {
      tool: "validateExperimentActive",
      params: {
        experimentId
      }
    };
  }

  /**
     * Generate a plan for a specific experiment treatment
     */
  public generateExperimentSpecificPlan(
    experimentId: string,
    treatmentId: string,
    baseToolCalls: LoggedToolCall[]
  ): Plan {
    // Create a mock experiment context for this specific experiment
    const experimentContext: ExperimentContext = {
      activeExperimentIds: [experimentId],
      treatments: { [experimentId]: treatmentId },
      featureFlags: {}
    };

    // Get treatment configuration
    const treatment = this.abTestManager.getTreatmentForExperiment(experimentId);
    if (treatment) {
      // Apply feature overrides from the treatment
      if (treatment.featureOverrides) {
        experimentContext.featureFlags = { ...treatment.featureOverrides };
      }
    }

    return this.generatePlan(baseToolCalls, experimentContext);
  }

  /**
     * Generate multiple plans for different experiment variants
     */
  public generateVariantPlans(
    experimentId: string,
    treatments: string[],
    baseToolCalls: LoggedToolCall[]
  ): Plan[] {
    return treatments.map(treatmentId => {
      const plan = this.generateExperimentSpecificPlan(experimentId, treatmentId, baseToolCalls);
      plan.name = `${plan.name} - ${experimentId}:${treatmentId}`;
      return plan;
    });
  }

  /**
     * Generate control vs treatment comparison plans
     */
  public generateComparisonPlans(
    experimentId: string,
    controlTreatment: string,
    testTreatment: string,
    baseToolCalls: LoggedToolCall[]
  ): { control: Plan; treatment: Plan } {
    const controlPlan = this.generateExperimentSpecificPlan(experimentId, controlTreatment, baseToolCalls);
    const treatmentPlan = this.generateExperimentSpecificPlan(experimentId, testTreatment, baseToolCalls);

    controlPlan.name = `${controlPlan.name} - Control (${controlTreatment})`;
    treatmentPlan.name = `${treatmentPlan.name} - Treatment (${testTreatment})`;

    return { control: controlPlan, treatment: treatmentPlan };
  }
}
