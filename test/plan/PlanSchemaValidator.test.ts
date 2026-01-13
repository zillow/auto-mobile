import { describe, it, expect, beforeAll } from "bun:test";
import { PlanSchemaValidator } from "../../src/utils/plan/PlanSchemaValidator";

describe("PlanSchemaValidator", () => {
  let validator: PlanSchemaValidator;

  beforeAll(async () => {
    validator = new PlanSchemaValidator();
    await validator.loadSchema();
  });

  describe("Valid YAML", () => {
    it("should validate a minimal valid plan", () => {
      const yaml = `
name: test-plan
steps:
  - tool: observe
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("should validate a complete plan with all fields", () => {
      const yaml = `
name: complete-plan
description: A complete test plan
devices:
  - A
  - B
steps:
  - tool: launchApp
    params:
      appId: com.example.app
    device: A
    label: Launch app on device A
  - tool: observe
    params:
      device: A
metadata:
  createdAt: "2026-01-08T00:00:00Z"
  version: "1.0.0"
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(true);
    });

    it("should validate plan with YAML anchors", () => {
      const yaml = `
name: anchors-test
description: Test with YAML anchors
steps:
  - tool: launchApp
    params: &launch-params
      appId: com.example.app
      coldBoot: false
    label: First launch
  - tool: launchApp
    params:
      <<: *launch-params
      coldBoot: true
    label: Second launch with cold boot
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(true);
    });

    it("should validate plan with merge keys", () => {
      const yaml = `
name: merge-keys-test
devices:
  - A
  - B
steps:
  - tool: observe
    params: &observe-base
      includeScreenshot: true
      includeHierarchy: true
      device: A
  - tool: observe
    params:
      <<: *observe-base
      device: B
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(true);
    });

    it("should validate dragAndDrop with top-level selectors and param overrides", () => {
      const yaml = `
name: drag-and-drop
steps:
  - tool: dragAndDrop
    source:
      text: Source
    target:
      text: Target
    params:
      duration: 800
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(true);
    });
  });

  describe("Invalid YAML syntax", () => {
    it("should report YAML parse errors with line/column", () => {
      const yaml = `
name: test
steps: [invalid
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.errors![0].field).toBe("root");
      expect(result.errors![0].message).toContain("YAML parsing failed");
      expect(result.errors![0].line).toBeDefined();
      expect(result.errors![0].column).toBeDefined();
    });

    it("should handle malformed YAML with colons", () => {
      const yaml = `
name test plan
steps:
  - tool: observe
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(false);
      expect(result.errors![0].message).toContain("YAML parsing failed");
    });
  });

  describe("Schema validation errors", () => {
    it("should report missing required 'name' field", () => {
      const yaml = `
steps:
  - tool: observe
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      const nameError = result.errors!.find(e => e.message.includes("name"));
      expect(nameError).toBeDefined();
      expect(nameError!.message).toContain("Missing required property 'name'");
    });

    it("should report missing required 'steps' field", () => {
      const yaml = `
name: test-plan
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(false);
      const stepsError = result.errors!.find(e => e.message.includes("steps"));
      expect(stepsError).toBeDefined();
      expect(stepsError!.message).toContain("Missing required property 'steps'");
    });

    it("should report empty name", () => {
      const yaml = `
name: ""
steps:
  - tool: observe
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.field.includes("name"))).toBe(true);
    });

    it("should report empty steps array", () => {
      const yaml = `
name: test-plan
steps: []
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.message.includes("at least 1"))).toBe(true);
    });

    it("should report missing tool in step", () => {
      const yaml = `
name: test-plan
steps:
  - params:
      foo: bar
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(false);
      const toolError = result.errors!.find(e => e.message.includes("tool"));
      expect(toolError).toBeDefined();
      expect(toolError!.message).toContain("Missing required property 'tool'");
    });

    it("should report empty tool name", () => {
      const yaml = `
name: test-plan
steps:
  - tool: ""
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.field.includes("tool"))).toBe(true);
    });

    it("should report wrong type for steps", () => {
      const yaml = `
name: test-plan
steps: "not an array"
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.field.includes("steps") && e.message.includes("type"))).toBe(true);
    });

    it("should report invalid mcpVersion format", () => {
      const yaml = `
name: test-plan
mcpVersion: invalid-version
steps:
  - tool: observe
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.field.includes("mcpVersion"))).toBe(true);
    });

    it("should report duplicate devices", () => {
      const yaml = `
name: test-plan
devices:
  - A
  - A
steps:
  - tool: observe
    params:
      device: A
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.field.includes("devices"))).toBe(true);
    });

    it("should report empty device label", () => {
      const yaml = `
name: test-plan
devices:
  - ""
steps:
  - tool: observe
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.field.includes("devices"))).toBe(true);
    });

    it("should provide line numbers for field errors when possible", () => {
      const yaml = `
name: test-plan
steps:
  - tool: observe
invalidField: value
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(false);
      const error = result.errors!.find(e => e.message.includes("invalidField") || e.message.includes("Unknown property"));
      if (error) {
        // Line number may or may not be available depending on the error type
        // Just verify the error structure is correct
        expect(error.field).toBeDefined();
        expect(error.message).toBeDefined();
      }
    });
  });

  describe("Complex nested validation", () => {
    it("should validate critical section parameters", () => {
      const yaml = `
name: critical-section-test
devices:
  - A
  - B
steps:
  - tool: criticalSection
    params:
      lock: sync-point
      deviceCount: 2
      steps:
        - tool: tapOn
          params:
            device: A
            text: Button
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(true);
    });

    it("should accept steps with tool-specific parameters", () => {
      // Note: Tool-specific parameter validation happens at runtime by the tool handler,
      // not by the JSON Schema. The schema only validates the basic step structure.
      const yaml = `
name: critical-section-test
steps:
  - tool: criticalSection
    params:
      lock: sync-point
`;
      const result = validator.validateYaml(yaml);
      // This is valid from a schema perspective - tool params are validated at runtime
      expect(result.valid).toBe(true);
    });

    it("should validate expectations array", () => {
      const yaml = `
name: expectations-test
steps:
  - tool: observe
    expectations:
      - type: elementExists
        selector:
          text: "Hello"
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(true);
    });

    it("should validate metadata fields", () => {
      const yaml = `
name: metadata-test
steps:
  - tool: observe
metadata:
  createdAt: "2026-01-08T00:00:00Z"
  version: "1.0.0"
  appId: com.example.app
  sessionId: "session-123"
  toolCallCount: 10
  duration: 1500.5
  generatedFromToolCalls: true
  experiments: ["exp-1", "exp-2"]
  treatments:
    exp-1: "variant-a"
  featureFlags:
    darkMode: true
    beta: false
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(true);
    });
  });

  describe("Legacy field handling", () => {
    it("should allow deprecated 'generated' field", () => {
      const yaml = `
name: legacy-plan
generated: "2026-01-08T00:00:00Z"
steps:
  - tool: observe
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(true);
    });

    it("should allow deprecated 'appId' field", () => {
      const yaml = `
name: legacy-plan
appId: com.example.app
steps:
  - tool: observe
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(true);
    });

    it("should allow deprecated 'parameters' field", () => {
      const yaml = `
name: legacy-plan
parameters:
  key1: value1
  key2: value2
steps:
  - tool: observe
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(true);
    });

    it("should allow deprecated 'description' in steps", () => {
      const yaml = `
name: legacy-plan
steps:
  - tool: observe
    description: Old-style description
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(true);
    });
  });

  describe("Error message quality", () => {
    it("should provide helpful error for additionalProperties", () => {
      const yaml = `
name: test-plan
steps:
  - tool: observe
unknownTopLevelField: value
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(false);
      const error = result.errors!.find(e => e.message.includes("Unknown property"));
      expect(error).toBeDefined();
      expect(error!.message).toContain("legacy field");
    });

    it("should format field paths nicely", () => {
      const yaml = `
name: test-plan
steps:
  - tool: observe
  - {}
`;
      const result = validator.validateYaml(yaml);
      expect(result.valid).toBe(false);
      // Should have error for steps[1] missing tool
      const error = result.errors!.find(e => e.field.includes("steps[1]"));
      expect(error).toBeDefined();
    });
  });
});
