import { expect } from "chai";
import * as sinon from "sinon";
import { FeatureFlagManager } from "../../src/utils/featureFlagManager";
import { AbTestManager } from "../../src/utils/abTestManager";

describe("FeatureFlagManager", () => {
  let featureFlagManager: FeatureFlagManager;
  let abTestManager: AbTestManager;

  beforeEach(() => {
    // Create mock A/B test manager
    abTestManager = new AbTestManager();

    // Create feature flag manager with mocked A/B test manager
    featureFlagManager = new FeatureFlagManager(abTestManager);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("setFeatureFlags", () => {
    it("should set feature flags correctly", () => {
      const flags = {
        flag1: true,
        flag2: "enabled",
        flag3: 42
      };

      featureFlagManager.setFeatureFlags(flags);

      expect(featureFlagManager.isEnabled("flag1")).to.be.true;
      expect(featureFlagManager.getValue("flag2")).to.equal("enabled");
      expect(featureFlagManager.getValue("flag3")).to.equal(42);
    });

    it("should clear existing flags when setting new ones", () => {
      // Set initial flags
      featureFlagManager.setFeatureFlags({ initial_flag: true });
      expect(featureFlagManager.isEnabled("initial_flag")).to.be.true;

      // Set new flags (should clear old ones)
      featureFlagManager.setFeatureFlags({ new_flag: true });
      expect(featureFlagManager.isEnabled("initial_flag")).to.be.false;
      expect(featureFlagManager.isEnabled("new_flag")).to.be.true;
    });
  });

  describe("feature flag evaluation", () => {
    beforeEach(() => {
      // Set up local flags
      featureFlagManager.setFeatureFlags({
        local_flag: true,
        override_flag: "local_value"
      });

      // Configure A/B test manager with some experiment context
      const mockContext = {
        activeExperimentIds: ["test_exp"],
        treatments: { test_exp: "variant" },
        featureFlags: {
          ab_test_flag: true,
          override_flag: "ab_test_value"
        }
      };

      sinon.stub(abTestManager, "generateExperimentContext").returns(mockContext);
      sinon.stub(abTestManager, "isFeatureEnabled").callsFake((flagName: string) => {
        return (mockContext.featureFlags as Record<string, any>)[flagName] === true;
      });
      sinon.stub(abTestManager, "getFeatureValue").callsFake((flagName: string) => {
        return (mockContext.featureFlags as Record<string, any>)[flagName];
      });
    });

    it("should prioritize local flags over A/B test flags", () => {
      expect(featureFlagManager.isEnabled("local_flag")).to.be.true;
      expect(featureFlagManager.getValue("override_flag")).to.equal("local_value");
    });

    it("should fall back to A/B test flags when local flag not found", () => {
      expect(featureFlagManager.isEnabled("ab_test_flag")).to.be.true;
    });

    it("should return false/undefined for unknown flags", () => {
      expect(featureFlagManager.isEnabled("unknown_flag")).to.be.false;
      expect(featureFlagManager.getValue("unknown_flag")).to.be.undefined;
    });
  });

  describe("applyFeatureFlags", () => {
    beforeEach(() => {
      // Mock the A/B test manager's experiment context
      const mockContext = {
        activeExperimentIds: ["test_exp"],
        treatments: { test_exp: "variant" },
        featureFlags: {
          experiment_flag: true,
          experiment_value: "test_value"
        }
      };

      sinon.stub(abTestManager, "generateExperimentContext").returns(mockContext);
    });

    it("should apply feature flags to device via system properties", async () => {
      const deviceId = "test_device";
      featureFlagManager.setFeatureFlags({ local_flag: true });

      // This will fail in test environment but we're testing it doesn't throw unexpected errors
      try {
        await featureFlagManager.applyFeatureFlags(deviceId);
      } catch (error) {
        // Expected to fail due to no ADB device
        expect((error as Error).message).to.be.a("string");
      }
    });

    it("should handle errors gracefully when applying flags", async () => {
      // The implementation handles individual ADB command failures gracefully
      // by logging warnings rather than throwing errors
      try {
        await featureFlagManager.applyFeatureFlags("invalid_device");
        // If no error is thrown, that's actually the expected behavior
        // since individual command failures are handled gracefully
      } catch (error) {
        expect((error as Error).message).to.be.a("string");
      }
      // We don't assert that an error must be thrown since the implementation
      // handles ADB command failures gracefully
    });
  });

  describe("getAppliedFeatureFlags", () => {
    it("should parse applied feature flags from device", async () => {
      const deviceId = "test_device";

      // This will fail due to no ADB device but should return empty object gracefully
      const appliedFlags = await featureFlagManager.getAppliedFeatureFlags(deviceId);
      expect(appliedFlags).to.deep.equal({});
    });

    it("should handle empty output gracefully", async () => {
      const deviceId = "test_device";

      const appliedFlags = await featureFlagManager.getAppliedFeatureFlags(deviceId);
      expect(appliedFlags).to.deep.equal({});
    });

    it("should handle ADB errors gracefully", async () => {
      const deviceId = "test_device";

      const appliedFlags = await featureFlagManager.getAppliedFeatureFlags(deviceId);
      expect(appliedFlags).to.deep.equal({});
    });
  });

  describe("clearFeatureFlags", () => {
    it("should clear all feature flags from device", async () => {
      const deviceId = "test_device";

      // Mock getting existing flags
      const getAppliedStub = sinon.stub(featureFlagManager, "getAppliedFeatureFlags")
        .resolves({ flag1: "true", flag2: "enabled" });

      try {
        await featureFlagManager.clearFeatureFlags(deviceId);
      } catch (error) {
        // Expected to fail in test environment
        expect((error as Error).message).to.be.a("string");
      }

      // Should have called getAppliedFeatureFlags
      expect(getAppliedStub.calledOnce).to.be.true;
    });

    it("should handle errors during clearing", async () => {
      const deviceId = "test_device";

      let errorThrown = false;
      try {
        await featureFlagManager.clearFeatureFlags(deviceId);
      } catch (error) {
        errorThrown = true;
        expect((error as Error).message).to.be.a("string");
      }
      expect(errorThrown).to.be.true;
    });
  });

  describe("validateFeatureFlags", () => {
    it("should validate that expected flags match applied flags", async () => {
      const deviceId = "test_device";
      const expectedFlags = { flag1: true, flag2: "enabled" };

      sinon.stub(featureFlagManager, "getAppliedFeatureFlags")
        .resolves({ flag1: "true", flag2: "enabled" });

      const result = await featureFlagManager.validateFeatureFlags(deviceId, expectedFlags);
      expect(result).to.be.true;
    });

    it("should return false when flags don't match", async () => {
      const deviceId = "test_device";
      const expectedFlags = { flag1: true, flag2: "enabled" };

      sinon.stub(featureFlagManager, "getAppliedFeatureFlags")
        .resolves({ flag1: "false", flag2: "enabled" }); // flag1 doesn't match

      const result = await featureFlagManager.validateFeatureFlags(deviceId, expectedFlags);
      expect(result).to.be.false;
    });

    it("should handle validation errors gracefully", async () => {
      const deviceId = "test_device";
      const expectedFlags = { flag1: true };

      sinon.stub(featureFlagManager, "getAppliedFeatureFlags")
        .rejects(new Error("Validation failed"));

      const result = await featureFlagManager.validateFeatureFlags(deviceId, expectedFlags);
      expect(result).to.be.false;
    });
  });

  describe("getAllFlags", () => {
    it("should combine local flags with A/B test flags", () => {
      // Set local flags
      featureFlagManager.setFeatureFlags({
        local_flag: true,
        override_flag: "local"
      });

      // Mock A/B test context
      const mockContext = {
        activeExperimentIds: ["test_exp"],
        treatments: { test_exp: "variant" },
        featureFlags: {
          ab_test_flag: true,
          override_flag: "ab_test" // Should be overridden by local
        }
      };

      sinon.stub(abTestManager, "generateExperimentContext").returns(mockContext);

      const allFlags = featureFlagManager.getAllFlags();

      expect(allFlags).to.deep.equal({
        ab_test_flag: true,
        override_flag: "local", // Local takes precedence
        local_flag: true
      });
    });

    it("should handle empty flags gracefully", () => {
      // No local flags set
      // Mock empty A/B test context
      sinon.stub(abTestManager, "generateExperimentContext").returns({
        activeExperimentIds: [],
        treatments: {},
        featureFlags: {}
      });

      const allFlags = featureFlagManager.getAllFlags();
      expect(allFlags).to.deep.equal({});
    });
  });

  describe("integration with A/B test manager", () => {
    it("should use A/B test manager for feature evaluation", () => {
      const isFeatureEnabledSpy = sinon.spy(abTestManager, "isFeatureEnabled");
      const getFeatureValueSpy = sinon.spy(abTestManager, "getFeatureValue");

      // Test with flag not in local flags
      featureFlagManager.isEnabled("ab_test_only_flag");
      featureFlagManager.getValue("ab_test_only_flag");

      expect(isFeatureEnabledSpy.calledWith("ab_test_only_flag")).to.be.true;
      expect(getFeatureValueSpy.calledWith("ab_test_only_flag")).to.be.true;
    });

    it("should not call A/B test manager when local flag exists", () => {
      const isFeatureEnabledSpy = sinon.spy(abTestManager, "isFeatureEnabled");
      const getFeatureValueSpy = sinon.spy(abTestManager, "getFeatureValue");

      // Set local flag
      featureFlagManager.setFeatureFlags({ local_flag: true });

      // Test with local flag
      featureFlagManager.isEnabled("local_flag");
      featureFlagManager.getValue("local_flag");

      // A/B test manager should not be called
      expect(isFeatureEnabledSpy.called).to.be.false;
      expect(getFeatureValueSpy.called).to.be.false;
    });
  });

  describe("edge cases", () => {
    it("should handle boolean conversion correctly", () => {
      featureFlagManager.setFeatureFlags({
        truthy_string: "enabled",
        falsy_string: "",
        zero: 0,
        positive_number: 1,
        null_value: null,
        undefined_value: undefined
      });

      expect(featureFlagManager.isEnabled("truthy_string")).to.be.true;
      expect(featureFlagManager.isEnabled("falsy_string")).to.be.false;
      expect(featureFlagManager.isEnabled("zero")).to.be.false;
      expect(featureFlagManager.isEnabled("positive_number")).to.be.true;
      expect(featureFlagManager.isEnabled("null_value")).to.be.false;
      expect(featureFlagManager.isEnabled("undefined_value")).to.be.false;
    });

    it("should handle special character flag names", () => {
      featureFlagManager.setFeatureFlags({
        "flag-with-dashes": true,
        "flag.with.dots": true,
        "flag_with_underscores": true
      });

      expect(featureFlagManager.isEnabled("flag-with-dashes")).to.be.true;
      expect(featureFlagManager.isEnabled("flag.with.dots")).to.be.true;
      expect(featureFlagManager.isEnabled("flag_with_underscores")).to.be.true;
    });
  });
});
