import { describe, expect, test } from "bun:test";
import yaml from "js-yaml";
import { YamlPlanSerializer } from "../../../src/utils/plan/PlanSerializer";
import type { Plan } from "../../../src/models/Plan";

/**
 * Tests for PlanSerializer focusing on the pure importPlanFromYaml logic.
 *
 * exportPlanFromLogs is not tested here because it requires filesystem access
 * (reading log directories and writing output files) without injectable dependencies.
 */
describe("YamlPlanSerializer", () => {
  const serializer = new YamlPlanSerializer();

  describe("importPlanFromYaml", () => {
    test("imports a valid plan with name and steps", () => {
      const yamlContent = yaml.dump({
        name: "My Plan",
        description: "A test plan",
        mcpVersion: "1.0.0",
        metadata: {
          createdAt: "2024-01-01T00:00:00.000Z",
          version: "1.0.0",
        },
        steps: [
          { tool: "tapOn", params: { text: "Hello" } },
          { tool: "inputText", params: { text: "World" } },
        ],
      });

      const plan = serializer.importPlanFromYaml(yamlContent);

      expect(plan.name).toBe("My Plan");
      expect(plan.description).toBe("A test plan");
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].tool).toBe("tapOn");
      expect(plan.steps[0].params).toEqual({ text: "Hello", action: "tap" });
      expect(plan.steps[1].tool).toBe("inputText");
      expect(plan.steps[1].params).toEqual({ text: "World" });
      // Note: migration adds action: "tap" to tapOn steps
    });

    test("imports a minimal valid plan", () => {
      const yamlContent = yaml.dump({
        name: "Minimal",
        steps: [{ tool: "observe", params: {} }],
      });

      const plan = serializer.importPlanFromYaml(yamlContent);

      expect(plan.name).toBe("Minimal");
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].tool).toBe("observe");
    });

    test("applies migration for legacy planName field", () => {
      const yamlContent = yaml.dump({
        planName: "Legacy Plan",
        steps: [{ tool: "tapOn", params: { text: "Go" } }],
      });

      const plan = serializer.importPlanFromYaml(yamlContent);

      expect(plan.name).toBe("Legacy Plan");
    });

    test("normalizes legacy command field to tool", () => {
      const yamlContent = yaml.dump({
        name: "Command Plan",
        mcpVersion: "1.0.0",
        metadata: {
          createdAt: "2024-01-01T00:00:00.000Z",
          version: "1.0.0",
        },
        steps: [{ command: "tapOn", params: { text: "Hello" } }],
      });

      const plan = serializer.importPlanFromYaml(yamlContent);

      expect(plan.steps[0].tool).toBe("tapOn");
    });

    test("normalizes inline step parameters into params object", () => {
      const yamlContent = yaml.dump({
        name: "Inline Params",
        mcpVersion: "1.0.0",
        metadata: {
          createdAt: "2024-01-01T00:00:00.000Z",
          version: "1.0.0",
        },
        steps: [{ tool: "tapOn", text: "Button", action: "tap" }],
      });

      const plan = serializer.importPlanFromYaml(yamlContent);

      expect(plan.steps[0].params.text).toBe("Button");
    });

    test("sets default description when not provided", () => {
      const yamlContent = yaml.dump({
        name: "No Desc",
        mcpVersion: "1.0.0",
        metadata: {
          createdAt: "2024-01-01T00:00:00.000Z",
          version: "1.0.0",
        },
        steps: [
          { tool: "tapOn", params: { text: "A" } },
          { tool: "tapOn", params: { text: "B" } },
        ],
      });

      const plan = serializer.importPlanFromYaml(yamlContent);

      expect(plan.description).toBe("Plan with 2 steps");
    });

    test("preserves metadata when provided", () => {
      const yamlContent = yaml.dump({
        name: "With Metadata",
        mcpVersion: "1.0.0",
        metadata: {
          createdAt: "2024-06-15T12:00:00.000Z",
          version: "2.0.0",
        },
        steps: [{ tool: "observe", params: {} }],
      });

      const plan = serializer.importPlanFromYaml(yamlContent);

      expect(plan.metadata!.createdAt).toBe("2024-06-15T12:00:00.000Z");
      expect(plan.metadata!.version).toBe("2.0.0");
    });

    test("throws for invalid YAML syntax", () => {
      const badYaml = "name: Test\nsteps:\n  - tool: tapOn\n    params: {invalid: [}";

      expect(() => serializer.importPlanFromYaml(badYaml)).toThrow(
        "Failed to parse plan YAML"
      );
    });

    test("throws when name is missing", () => {
      const yamlContent = yaml.dump({
        steps: [{ tool: "tapOn", params: { text: "Go" } }],
      });

      // After migration, name defaults are tried; without any name source it should fail
      expect(() => serializer.importPlanFromYaml(yamlContent)).toThrow();
    });

    test("throws when steps is missing", () => {
      const yamlContent = yaml.dump({
        name: "No Steps Plan",
      });

      expect(() => serializer.importPlanFromYaml(yamlContent)).toThrow();
    });

    test("throws when steps is not an array", () => {
      const yamlContent = yaml.dump({
        name: "Bad Steps",
        steps: "not an array",
      });

      expect(() => serializer.importPlanFromYaml(yamlContent)).toThrow();
    });

    test("roundtrips plan through YAML serialization and deserialization", () => {
      const originalPlan: Plan = {
        name: "Roundtrip Plan",
        description: "Test roundtrip",
        mcpVersion: "1.0.0",
        metadata: {
          createdAt: "2024-01-01T00:00:00.000Z",
          version: "1.0.0",
        },
        steps: [
          { tool: "tapOn", params: { text: "Login", action: "tap" } },
          { tool: "inputText", params: { text: "user@example.com" } },
          { tool: "pressButton", params: { button: "enter" } },
        ],
      };

      const yamlContent = yaml.dump(originalPlan, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
      });

      const reimported = serializer.importPlanFromYaml(yamlContent);

      expect(reimported.name).toBe(originalPlan.name);
      expect(reimported.description).toBe(originalPlan.description);
      expect(reimported.steps).toHaveLength(originalPlan.steps.length);
      for (let i = 0; i < originalPlan.steps.length; i++) {
        expect(reimported.steps[i].tool).toBe(originalPlan.steps[i].tool);
        expect(reimported.steps[i].params).toEqual(originalPlan.steps[i].params);
      }
    });

    test("handles plan with devices field", () => {
      const yamlContent = yaml.dump({
        name: "Multi Device Plan",
        mcpVersion: "1.0.0",
        metadata: {
          createdAt: "2024-01-01T00:00:00.000Z",
          version: "1.0.0",
        },
        devices: ["A", "B"],
        steps: [
          { tool: "tapOn", params: { text: "Hello", device: "A" } },
          { tool: "tapOn", params: { text: "World", device: "B" } },
        ],
      });

      const plan = serializer.importPlanFromYaml(yamlContent);

      expect(plan.devices).toEqual(["A", "B"]);
      expect(plan.steps[0].params.device).toBe("A");
      expect(plan.steps[1].params.device).toBe("B");
    });

    test("handles plan with step labels", () => {
      const yamlContent = yaml.dump({
        name: "Labeled Plan",
        mcpVersion: "1.0.0",
        metadata: {
          createdAt: "2024-01-01T00:00:00.000Z",
          version: "1.0.0",
        },
        steps: [
          { tool: "tapOn", params: { text: "Login" }, label: "Click login button" },
        ],
      });

      const plan = serializer.importPlanFromYaml(yamlContent);

      expect(plan.steps[0].label).toBe("Click login button");
    });

    test("throws for completely non-object input", () => {
      const yamlContent = "just a string";

      expect(() => serializer.importPlanFromYaml(yamlContent)).toThrow();
    });
  });
});
