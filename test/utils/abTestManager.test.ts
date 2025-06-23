import { expect } from "chai";
import { AbTestManager } from "../../src/utils/abTestManager";
import { ConfigurationManager } from "../../src/utils/configurationManager";
import { AbTestTreatment, Experiment } from "../../src/models/McpServerConfiguration";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("AbTestManager", () => {
  let abTestManager: AbTestManager;
  let configManager: ConfigurationManager;
  let tempConfigPath: string;

  beforeEach(async () => {
    // Create a temporary config file for testing
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ab-test-"));
    tempConfigPath = path.join(tempDir, "test-config.json");

    // Set up configuration manager with temporary file
    configManager = ConfigurationManager.getInstance();
    configManager.setConfigFilePath(tempConfigPath);

    // Reset configuration to clean state
    await configManager.resetConfig();

    // Create fresh AbTestManager instance
    abTestManager = new AbTestManager();
  });

  afterEach(async () => {
    // Clean up temporary files
    try {
      await fs.unlink(tempConfigPath);
      await fs.rmdir(path.dirname(tempConfigPath));
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("configureExperiments", () => {
    it("should configure experiments and treatments correctly", () => {
      const experiments: Experiment[] = [
        { id: "checkout_flow", name: "Checkout Flow", description: "Testing new checkout experience" },
        { id: "search_algorithm", name: "Search Algorithm", description: "Testing ML-enhanced search" }
      ];

      const treatments: Record<string, AbTestTreatment> = {
        checkout_flow: {
          experimentId: "checkout_flow",
          treatmentId: "variant_a",
          parameters: {
            skip_address_validation: true,
            express_checkout_enabled: true
          },
          featureOverrides: {
            new_ui: true,
            old_flow: false
          }
        },
        search_algorithm: {
          experimentId: "search_algorithm",
          treatmentId: "control",
          parameters: {
            use_ml: false
          }
        }
      };

      abTestManager.configureExperiments(experiments, treatments);

      const activeExperiments = abTestManager.getActiveExperiments();
      expect(activeExperiments).to.have.length(2);
      expect(activeExperiments.map(e => e.id)).to.include("checkout_flow");
      expect(activeExperiments.map(e => e.id)).to.include("search_algorithm");

      const treatment = abTestManager.getTreatmentForExperiment("checkout_flow");
      expect(treatment).to.not.be.null;
      expect(treatment!.treatmentId).to.equal("variant_a");
      expect(treatment!.parameters.skip_address_validation).to.be.true;
    });

    it("should clear existing experiments when configuring new ones", () => {
      // Configure initial experiments
      const initialExperiments: Experiment[] = [
        { id: "test1", name: "Test 1" }
      ];

      const initialTreatments: Record<string, AbTestTreatment> = {
        test1: {
          experimentId: "test1",
          treatmentId: "control",
          parameters: {}
        }
      };

      abTestManager.configureExperiments(initialExperiments, initialTreatments);
      expect(abTestManager.getActiveExperiments()).to.have.length(1);

      // Configure new experiments (should clear the old ones)
      const newExperiments: Experiment[] = [
        { id: "test2", name: "Test 2" }
      ];

      const newTreatments: Record<string, AbTestTreatment> = {
        test2: {
          experimentId: "test2",
          treatmentId: "variant",
          parameters: {}
        }
      };

      abTestManager.configureExperiments(newExperiments, newTreatments);

      const activeExperiments = abTestManager.getActiveExperiments();
      expect(activeExperiments).to.have.length(1);
      expect(activeExperiments[0].id).to.equal("test2");

      // Old experiment should no longer be available
      expect(abTestManager.getTreatmentForExperiment("test1")).to.be.null;
    });
  });

  describe("feature flag evaluation", () => {
    beforeEach(async () => {
      // Configure experiments with feature overrides
      const experiments: Experiment[] = [
        { id: "ui_experiment", name: "UI Experiment" }
      ];

      const treatments: Record<string, AbTestTreatment> = {
        ui_experiment: {
          experimentId: "ui_experiment",
          treatmentId: "variant",
          parameters: {},
          featureOverrides: {
            global_feature_1: false, // Override global setting
            experiment_feature: true // New feature specific to experiment
          }
        }
      };

      abTestManager.configureExperiments(experiments, treatments);
    });

    it("should return experiment-specific feature overrides", () => {
      expect(abTestManager.isFeatureEnabled("global_feature_1")).to.be.false; // Overridden
      expect(abTestManager.isFeatureEnabled("experiment_feature")).to.be.true; // Experiment-specific
    });

    it("should fall back to global feature flags when no experiment override", () => {
      // Since global feature flags are removed from config, these should return false/undefined
      expect(abTestManager.isFeatureEnabled("global_feature_2")).to.be.false;
      expect(abTestManager.getFeatureValue("global_feature_2")).to.be.undefined;
      expect(abTestManager.getFeatureValue("global_feature_3")).to.be.undefined;
    });

    it("should return false/undefined for unknown features", () => {
      expect(abTestManager.isFeatureEnabled("unknown_feature")).to.be.false;
      expect(abTestManager.getFeatureValue("unknown_feature")).to.be.undefined;
    });
  });

  describe("experiment parameter access", () => {
    beforeEach(() => {
      const experiments: Experiment[] = [
        { id: "test_experiment", name: "Test Experiment" }
      ];

      const treatments: Record<string, AbTestTreatment> = {
        test_experiment: {
          experimentId: "test_experiment",
          treatmentId: "treatment_a",
          parameters: {
            param1: "value1",
            param2: 123,
            param3: true
          }
        }
      };

      abTestManager.configureExperiments(experiments, treatments);
    });

    it("should return experiment parameter values", () => {
      expect(abTestManager.getExperimentParameter("test_experiment", "param1")).to.equal("value1");
      expect(abTestManager.getExperimentParameter("test_experiment", "param2")).to.equal(123);
      expect(abTestManager.getExperimentParameter("test_experiment", "param3")).to.be.true;
    });

    it("should return undefined for unknown experiment or parameter", () => {
      expect(abTestManager.getExperimentParameter("unknown_experiment", "param1")).to.be.undefined;
      expect(abTestManager.getExperimentParameter("test_experiment", "unknown_param")).to.be.undefined;
    });
  });

  describe("experiment context generation", () => {
    beforeEach(async () => {
      // Configure experiments
      const experiments: Experiment[] = [
        { id: "exp1", name: "Experiment 1" },
        { id: "exp2", name: "Experiment 2" },
        { id: "exp3", name: "Experiment 3" }
      ];

      const treatments: Record<string, AbTestTreatment> = {
        exp1: {
          experimentId: "exp1",
          treatmentId: "variant",
          parameters: {},
          featureOverrides: {
            override_me: "overridden",
            exp1_feature: true
          }
        },
        exp2: {
          experimentId: "exp2",
          treatmentId: "control",
          parameters: {}
        },
        exp3: {
          experimentId: "exp3",
          treatmentId: "test",
          parameters: {}
        }
      };

      abTestManager.configureExperiments(experiments, treatments);
    });

    it("should generate correct experiment context", () => {
      const context = abTestManager.generateExperimentContext();

      expect(context.activeExperimentIds).to.include.members(["exp1", "exp2", "exp3"]);
      expect(context.treatments).to.deep.equal({
        exp1: "variant",
        exp2: "control",
        exp3: "test"
      });

      // Feature flags should include experiment overrides
      expect(context.featureFlags.override_me).to.equal("overridden");
      expect(context.featureFlags.exp1_feature).to.be.true;
    });
  });

  describe("loadFromConfiguration", () => {
    beforeEach(async () => {
      // Set up configuration with A/B test data
      await configManager.updateConfig({
        experiments: [
          { id: "config_exp1", name: "Config Exp1" },
          { id: "config_exp2", name: "Config Exp2" }
        ],
        treatments: {
          config_exp1: {
            experimentId: "config_exp1",
            treatmentId: "variant_a",
            parameters: {
              test_param: "test_value"
            }
          },
          config_exp2: {
            experimentId: "config_exp2",
            treatmentId: "control",
            parameters: {}
          }
        }
      });
    });

    it("should load experiments and treatments from configuration", () => {
      abTestManager.loadFromConfiguration();

      const activeExperiments = abTestManager.getActiveExperiments();
      expect(activeExperiments).to.have.length(2);
      const experimentIds = activeExperiments.map(e => e.id);
      expect(experimentIds).to.include("config_exp1");
      expect(experimentIds).to.include("config_exp2");

      const treatment = abTestManager.getTreatmentForExperiment("config_exp1");
      expect(treatment).to.not.be.null;
      expect(treatment!.treatmentId).to.equal("variant_a");
      expect(treatment!.parameters.test_param).to.equal("test_value");
    });

    it("should create experiment objects with proper names", () => {
      abTestManager.loadFromConfiguration();

      const activeExperiments = abTestManager.getActiveExperiments();
      const configExp1 = activeExperiments.find(exp => exp.id === "config_exp1");

      expect(configExp1).to.not.be.undefined;
      expect(configExp1!.name).to.equal("Config Exp1"); // Converted from snake_case
    });

    it("should handle empty configuration gracefully", () => {
      abTestManager.configureExperiments([], {});

      expect(abTestManager.getActiveExperiments()).to.have.length(0);
      expect(abTestManager.getTreatmentForExperiment("any")).to.be.null;
      expect(abTestManager.isFeatureEnabled("any")).to.be.false;
      expect(abTestManager.getFeatureValue("any")).to.be.undefined;

      const context = abTestManager.generateExperimentContext();
      expect(context.activeExperimentIds).to.have.length(0);
      expect(context.treatments).to.deep.equal({});
    });

    it("should fail when experiment has blank name", async () => {
      try {
        await configManager.updateConfig({
          experiments: [
            { id: "test_exp", name: "" }
          ]
        });
        expect.fail("Should have thrown an error");
      } catch (error) {
        const err = error as Error;
        expect(err.message).to.include("must have a non-blank name");
      }
    });
  });

  describe("experiment state queries", () => {
    beforeEach(() => {
      const experiments: Experiment[] = [
        { id: "active_exp", name: "Active Experiment" },
        { id: "inactive_exp", name: "Inactive Experiment" }
      ];

      const treatments: Record<string, AbTestTreatment> = {
        active_exp: {
          experimentId: "active_exp",
          treatmentId: "treatment",
          parameters: {}
        },
        inactive_exp: {
          experimentId: "inactive_exp",
          treatmentId: "treatment",
          parameters: {}
        }
      };

      abTestManager.configureExperiments(experiments, treatments);
    });

    it("should correctly identify active experiments", () => {
      expect(abTestManager.isExperimentActive("active_exp")).to.be.true;
      expect(abTestManager.isExperimentActive("inactive_exp")).to.be.true;
      expect(abTestManager.isExperimentActive("unknown_exp")).to.be.false;
    });

    it("should return current assignments", () => {
      const assignments = abTestManager.getCurrentAssignments();
      expect(assignments).to.deep.equal({
        active_exp: "treatment",
        inactive_exp: "treatment"
      });
    });

    it("should return all experiments", () => {
      const allExperiments = abTestManager.getAllExperiments();
      expect(allExperiments).to.have.length(2);
      const experimentIds = allExperiments.map(e => e.id);
      expect(experimentIds).to.include("active_exp");
      expect(experimentIds).to.include("inactive_exp");
    });
  });

  describe("edge cases", () => {
    it("should handle empty configuration gracefully", () => {
      abTestManager.configureExperiments([], {});

      expect(abTestManager.getActiveExperiments()).to.have.length(0);
      expect(abTestManager.getTreatmentForExperiment("any")).to.be.null;
      expect(abTestManager.isFeatureEnabled("any")).to.be.false;
      expect(abTestManager.getFeatureValue("any")).to.be.undefined;

      const context = abTestManager.generateExperimentContext();
      expect(context.activeExperimentIds).to.have.length(0);
      expect(context.treatments).to.deep.equal({});
    });

    it("should handle experiments without treatments", () => {
      const experiments: Experiment[] = [
        { id: "orphan_exp", name: "Orphan Experiment" }
      ];

      abTestManager.configureExperiments(experiments, {});

      expect(abTestManager.getActiveExperiments()).to.have.length(1);
      expect(abTestManager.getTreatmentForExperiment("orphan_exp")).to.be.null;
    });

    it("should handle treatment without feature overrides", () => {
      const experiments: Experiment[] = [
        { id: "simple_exp", name: "Simple Experiment" }
      ];

      const treatments: Record<string, AbTestTreatment> = {
        simple_exp: {
          experimentId: "simple_exp",
          treatmentId: "simple",
          parameters: { param: "value" }
          // No featureOverrides
        }
      };

      abTestManager.configureExperiments(experiments, treatments);

      expect(abTestManager.isFeatureEnabled("any_feature")).to.be.false;
      expect(abTestManager.getExperimentParameter("simple_exp", "param")).to.equal("value");
    });
  });
});
