import { AbTestTreatment, ExperimentContext, Experiment } from "../models/McpServerConfiguration";
import { ConfigurationManager } from "./configurationManager";
import { logger } from "./logger";

export class AbTestManager {
  private experiments: Map<string, Experiment> = new Map();
  private treatments: Map<string, AbTestTreatment> = new Map();
  private currentAssignments: Map<string, string> = new Map();
  private configManager: ConfigurationManager;

  constructor() {
    this.configManager = ConfigurationManager.getInstance();
  }

  /**
     * Configure experiments with provided configuration
     */
  public configureExperiments(experiments: Experiment[], treatments: Record<string, AbTestTreatment>): void {
    // Clear existing experiments and treatments
    this.experiments.clear();
    this.treatments.clear();
    this.currentAssignments.clear();

    // Load experiments
    experiments.forEach(experiment => {
      this.experiments.set(experiment.id, experiment);
      logger.info(`Loaded experiment: ${experiment.id}${experiment.name ? ` (${experiment.name})` : ""}`);
    });

    // Load treatments and create assignments
    Object.values(treatments).forEach(treatment => {
      this.treatments.set(treatment.experimentId, treatment);
      this.currentAssignments.set(treatment.experimentId, treatment.treatmentId);
      logger.info(`Loaded treatment: ${treatment.experimentId} -> ${treatment.treatmentId}`);
    });
  }

  /**
     * Get all active experiments
     */
  public getActiveExperiments(): Experiment[] {
    return Array.from(this.experiments.values());
  }

  /**
     * Get treatment for a specific experiment
     */
  public getTreatmentForExperiment(experimentId: string): AbTestTreatment | null {
    return this.treatments.get(experimentId) || null;
  }

  /**
   * Check if a feature is enabled based on experiment overrides
   */
  public isFeatureEnabled(featureName: string): boolean {
    // Check experiment-specific feature overrides
    for (const treatment of this.treatments.values()) {
      if (treatment.featureOverrides && featureName in treatment.featureOverrides) {
        const value = treatment.featureOverrides[featureName];
        logger.debug(`Feature ${featureName} from experiment ${treatment.experimentId}: ${value}`);
        return Boolean(value);
      }
    }

    // No feature found
    return false;
  }

  /**
   * Get feature value (supports strings, numbers, booleans)
   */
  public getFeatureValue(featureName: string): any {
    // Check experiment-specific feature overrides
    for (const treatment of this.treatments.values()) {
      if (treatment.featureOverrides && featureName in treatment.featureOverrides) {
        const value = treatment.featureOverrides[featureName];
        logger.debug(`Feature ${featureName} from experiment ${treatment.experimentId}: ${value}`);
        return value;
      }
    }

    // No feature found
    return undefined;
  }

  /**
     * Get experiment parameter value
     */
  public getExperimentParameter(experimentId: string, parameterName: string): any {
    const treatment = this.treatments.get(experimentId);
    if (!treatment) {
      return undefined;
    }
    return treatment.parameters[parameterName];
  }

  /**
     * Generate experiment context for test plan generation
     */
  public generateExperimentContext(): ExperimentContext {
    const activeExperiments = this.getActiveExperiments();
    const treatments: Record<string, string> = {};

    activeExperiments.forEach(experiment => {
      const assignment = this.currentAssignments.get(experiment.id);
      if (assignment) {
        treatments[experiment.id] = assignment;
      }
    });

    // Collect all feature overrides from treatments
    const featureFlags: Record<string, any> = {};

    // Apply experiment-specific overrides
    for (const treatment of this.treatments.values()) {
      if (treatment.featureOverrides) {
        Object.assign(featureFlags, treatment.featureOverrides);
      }
    }

    return {
      activeExperimentIds: activeExperiments.map(exp => exp.id),
      treatments,
      featureFlags
    };
  }

  /**
     * Load experiments and treatments from configuration
     */
  public loadFromConfiguration(): void {
    const experiments = this.configManager.getAbTestExperiments();
    const treatments = this.configManager.getAllAbTestTreatments();

    this.configureExperiments(experiments, treatments);
  }

  /**
     * Get current experiment assignments
     */
  public getCurrentAssignments(): Record<string, string> {
    return Object.fromEntries(this.currentAssignments);
  }

  /**
     * Check if an experiment is active
     */
  public isExperimentActive(experimentId: string): boolean {
    return this.experiments.has(experimentId);
  }

  /**
     * Get all experiments (active and inactive)
     */
  public getAllExperiments(): Experiment[] {
    return Array.from(this.experiments.values());
  }
}
