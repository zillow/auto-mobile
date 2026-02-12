import { describe, expect, test } from "bun:test";
import { PlanValidator } from "../../../src/utils/plan/PlanValidator";
import { ActionableError } from "../../../src/models";
import type { Plan } from "../../../src/models/Plan";

describe("PlanValidator", () => {
  describe("validate", () => {
    test("accepts valid single-device plan", () => {
      const plan: Plan = {
        name: "Test Plan",
        steps: [{ tool: "tapOn", params: { text: "Login" } }],
      };
      expect(() => PlanValidator.validate(plan)).not.toThrow();
    });

    test("throws on missing name", () => {
      const plan = {
        name: "",
        steps: [{ tool: "tapOn", params: {} }],
      } as Plan;
      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
    });

    test("throws on non-string name", () => {
      const plan = {
        name: 123 as any,
        steps: [],
      } as Plan;
      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
    });

    test("throws on missing steps", () => {
      const plan = {
        name: "Test",
        steps: null as any,
      } as Plan;
      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
    });

    test("throws on non-array steps", () => {
      const plan = {
        name: "Test",
        steps: "not-an-array" as any,
      } as Plan;
      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
    });

    test("accepts valid multi-device plan", () => {
      const plan: Plan = {
        name: "Multi Device",
        devices: ["phone", "tablet"],
        steps: [
          { tool: "tapOn", params: { text: "Login", device: "phone" } },
          { tool: "tapOn", params: { text: "Login", device: "tablet" } },
        ],
      };
      expect(() => PlanValidator.validate(plan)).not.toThrow();
    });

    test("accepts plan with device definitions", () => {
      const plan: Plan = {
        name: "Multi Device",
        devices: [
          { label: "phone", platform: "android" },
          { label: "tablet", platform: "ios" },
        ],
        steps: [
          { tool: "tapOn", params: { text: "Login", device: "phone" } },
          { tool: "tapOn", params: { text: "Login", device: "tablet" } },
        ],
      };
      expect(() => PlanValidator.validate(plan)).not.toThrow();
    });

    test("throws on empty devices array", () => {
      const plan: Plan = {
        name: "Test",
        devices: [],
        steps: [],
      };
      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
    });

    test("throws on duplicate device labels", () => {
      const plan: Plan = {
        name: "Test",
        devices: ["phone", "phone"],
        steps: [],
      };
      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
    });

    test("throws on empty string device label", () => {
      const plan: Plan = {
        name: "Test",
        devices: ["phone", ""],
        steps: [],
      };
      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
    });

    test("throws on mixed device formats", () => {
      const plan: Plan = {
        name: "Test",
        devices: ["phone", { label: "tablet", platform: "android" }],
        steps: [],
      };
      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
    });

    test("throws on missing device label in steps", () => {
      const plan: Plan = {
        name: "Test",
        devices: ["phone"],
        steps: [{ tool: "tapOn", params: { text: "Login" } }],
      };
      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
    });

    test("throws on invalid device label in steps", () => {
      const plan: Plan = {
        name: "Test",
        devices: ["phone"],
        steps: [{ tool: "tapOn", params: { text: "Login", device: "tablet" } }],
      };
      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
    });

    test("criticalSection steps do not require device label", () => {
      const plan: Plan = {
        name: "Test",
        devices: ["phone", "tablet"],
        steps: [
          { tool: "tapOn", params: { text: "Login", device: "phone" } },
          { tool: "criticalSection", params: { name: "sync" } },
          { tool: "tapOn", params: { text: "Login", device: "tablet" } },
        ],
      };
      expect(() => PlanValidator.validate(plan)).not.toThrow();
    });

    test("throws when steps use device labels without declaring devices", () => {
      const plan: Plan = {
        name: "Test",
        steps: [{ tool: "tapOn", params: { text: "Login", device: "phone" } }],
      };
      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
    });

    test("throws when criticalSection used without declaring devices", () => {
      const plan: Plan = {
        name: "Test",
        steps: [{ tool: "criticalSection", params: { name: "sync" } }],
      };
      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
    });

    test("throws on invalid device platform", () => {
      const plan: Plan = {
        name: "Test",
        devices: [{ label: "phone", platform: "windows" as any }],
        steps: [],
      };
      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
    });

    test("throws on empty device label in definition", () => {
      const plan: Plan = {
        name: "Test",
        devices: [{ label: "", platform: "android" }],
        steps: [],
      };
      expect(() => PlanValidator.validate(plan)).toThrow(ActionableError);
    });
  });

  describe("hasMultiDeviceFeatures", () => {
    test("returns false for simple plan", () => {
      const plan: Plan = {
        name: "Test",
        steps: [{ tool: "tapOn", params: { text: "Login" } }],
      };
      expect(PlanValidator.hasMultiDeviceFeatures(plan)).toBe(false);
    });

    test("returns true when devices field present", () => {
      const plan: Plan = {
        name: "Test",
        devices: ["phone"],
        steps: [{ tool: "tapOn", params: { text: "Login", device: "phone" } }],
      };
      expect(PlanValidator.hasMultiDeviceFeatures(plan)).toBe(true);
    });

    test("returns true when step uses device param", () => {
      const plan: Plan = {
        name: "Test",
        steps: [{ tool: "tapOn", params: { text: "Login", device: "phone" } }],
      };
      expect(PlanValidator.hasMultiDeviceFeatures(plan)).toBe(true);
    });

    test("returns true when criticalSection used", () => {
      const plan: Plan = {
        name: "Test",
        steps: [{ tool: "criticalSection", params: {} }],
      };
      expect(PlanValidator.hasMultiDeviceFeatures(plan)).toBe(true);
    });
  });
});
