import { expect, describe, test } from "bun:test";
import { PlanValidator } from "../../src/utils/plan/PlanValidator";
import { Plan } from "../../src/models/Plan";
import { ActionableError } from "../../src/models";

describe("PlanValidator", () => {
  describe("validate", () => {
    test("should validate a simple single-device plan", () => {
      const plan: Plan = {
        name: "Simple Plan",
        steps: [
          { tool: "observe", params: {} },
          { tool: "tapOn", params: { text: "Login" } },
        ],
      };

      expect(() => PlanValidator.validate(plan)).not.toThrow();
    });

    test("should validate a multi-device plan with correct device labels", () => {
      const plan: Plan = {
        name: "Multi-Device Plan",
        devices: ["A", "B"],
        steps: [
          { tool: "observe", params: { device: "A" } },
          { tool: "tapOn", params: { text: "Login", device: "B" } },
          { tool: "observe", params: { device: "A" } },
        ],
      };

      expect(() => PlanValidator.validate(plan)).not.toThrow();
    });

    test("should validate critical sections without device labels", () => {
      const plan: Plan = {
        name: "Plan with Critical Section",
        devices: ["A", "B"],
        steps: [
          { tool: "observe", params: { device: "A" } },
          {
            tool: "criticalSection",
            params: {
              lock: "sync1",
              deviceCount: 2,
              steps: [
                { tool: "tapOn", params: { text: "Sync", device: "A" } },
              ],
            },
          },
          { tool: "observe", params: { device: "B" } },
        ],
      };

      expect(() => PlanValidator.validate(plan)).not.toThrow();
    });

    test("should throw when devices array is empty", () => {
      const plan: Plan = {
        name: "Invalid Plan",
        devices: [],
        steps: [{ tool: "observe", params: {} }],
      };

      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
      expect(() => PlanValidator.validate(plan)).toThrow(
        "devices' array cannot be empty"
      );
    });

    test("should throw when devices contains duplicates", () => {
      const plan: Plan = {
        name: "Invalid Plan",
        devices: ["A", "B", "A"],
        steps: [
          { tool: "observe", params: { device: "A" } },
          { tool: "observe", params: { device: "B" } },
        ],
      };

      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
      expect(() => PlanValidator.validate(plan)).toThrow("duplicate labels");
    });

    test("should throw when device labels contain non-strings", () => {
      const plan: Plan = {
        name: "Invalid Plan",
        devices: ["A", "" as any, "B"],
        steps: [
          { tool: "observe", params: { device: "A" } },
          { tool: "observe", params: { device: "B" } },
        ],
      };

      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
      expect(() => PlanValidator.validate(plan)).toThrow(
        "Device labels must be non-empty strings"
      );
    });

    test("should throw when devices is declared but step is missing device label", () => {
      const plan: Plan = {
        name: "Invalid Plan",
        devices: ["A", "B"],
        steps: [
          { tool: "observe", params: { device: "A" } },
          { tool: "tapOn", params: { text: "Login" } }, // Missing device label
        ],
      };

      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
      expect(() => PlanValidator.validate(plan)).toThrow(
        "missing 'device' parameter"
      );
      expect(() => PlanValidator.validate(plan)).toThrow("step 1 (tapOn)");
    });

    test("should throw when step uses undeclared device label", () => {
      const plan: Plan = {
        name: "Invalid Plan",
        devices: ["A", "B"],
        steps: [
          { tool: "observe", params: { device: "A" } },
          { tool: "tapOn", params: { text: "Login", device: "C" } }, // Undeclared device
        ],
      };

      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
      expect(() => PlanValidator.validate(plan)).toThrow(
        "invalid device labels"
      );
      expect(() => PlanValidator.validate(plan)).toThrow('device="C"');
    });

    test("should throw when plan name is missing", () => {
      const plan: Plan = {
        name: "",
        steps: [{ tool: "observe", params: {} }],
      };

      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
      expect(() => PlanValidator.validate(plan)).toThrow(
        "Plan must have a valid name"
      );
    });

    test("should throw when steps array is missing", () => {
      const plan: any = {
        name: "Test Plan",
      };

      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
      expect(() => PlanValidator.validate(plan)).toThrow(
        "Plan must have a steps array"
      );
    });
  });

  describe("hasMultiDeviceFeatures", () => {
    test("should return true when devices field is present", () => {
      const plan: Plan = {
        name: "Plan",
        devices: ["A"],
        steps: [{ tool: "observe", params: { device: "A" } }],
      };

      expect(PlanValidator.hasMultiDeviceFeatures(plan)).toBe(true);
    });

    test("should return true when any step uses device parameter", () => {
      const plan: Plan = {
        name: "Plan",
        steps: [
          { tool: "observe", params: {} },
          { tool: "tapOn", params: { device: "A" } },
        ],
      };

      expect(PlanValidator.hasMultiDeviceFeatures(plan)).toBe(true);
    });

    test("should return true when plan uses criticalSection", () => {
      const plan: Plan = {
        name: "Plan",
        steps: [
          { tool: "observe", params: {} },
          {
            tool: "criticalSection",
            params: {
              lock: "sync1",
              deviceCount: 2,
              steps: [],
            },
          },
        ],
      };

      expect(PlanValidator.hasMultiDeviceFeatures(plan)).toBe(true);
    });

    test("should return false for simple single-device plans", () => {
      const plan: Plan = {
        name: "Plan",
        steps: [
          { tool: "observe", params: {} },
          { tool: "tapOn", params: { text: "Login" } },
        ],
      };

      expect(PlanValidator.hasMultiDeviceFeatures(plan)).toBe(false);
    });
  });

  describe("validateMultiDeviceRequirements", () => {
    test("should pass when plan uses multi-device features and declares devices", () => {
      const plan: Plan = {
        name: "Plan",
        devices: ["A", "B"],
        steps: [
          { tool: "observe", params: { device: "A" } },
          { tool: "tapOn", params: { device: "B" } },
        ],
      };

      expect(() =>
        PlanValidator.validateMultiDeviceRequirements(plan)
      ).not.toThrow();
    });

    test("should throw when plan uses device labels but doesn't declare devices", () => {
      const plan: Plan = {
        name: "Plan",
        steps: [
          { tool: "observe", params: {} },
          { tool: "tapOn", params: { device: "A" } },
        ],
      };

      expect(() =>
        PlanValidator.validateMultiDeviceRequirements(plan)
      ).toThrow(ActionableError);
      expect(() =>
        PlanValidator.validateMultiDeviceRequirements(plan)
      ).toThrow("does not declare 'devices' field");
    });

    test("should throw when plan uses criticalSection but doesn't declare devices", () => {
      const plan: Plan = {
        name: "Plan",
        steps: [
          { tool: "observe", params: {} },
          {
            tool: "criticalSection",
            params: {
              lock: "sync1",
              deviceCount: 2,
              steps: [],
            },
          },
        ],
      };

      expect(() =>
        PlanValidator.validateMultiDeviceRequirements(plan)
      ).toThrow(ActionableError);
      expect(() =>
        PlanValidator.validateMultiDeviceRequirements(plan)
      ).toThrow("does not declare 'devices' field");
    });

    test("should pass for simple single-device plans without devices field", () => {
      const plan: Plan = {
        name: "Plan",
        steps: [
          { tool: "observe", params: {} },
          { tool: "tapOn", params: { text: "Login" } },
        ],
      };

      expect(() =>
        PlanValidator.validateMultiDeviceRequirements(plan)
      ).not.toThrow();
    });
  });
});
