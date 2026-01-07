import { expect, describe, test, beforeEach, afterEach } from "bun:test";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { exportPlanFromLogs, importPlanFromYaml, executePlan } from "../src/utils/planUtils";
import { Plan } from "../src/models/Plan";

describe("Plan Utils", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "plan-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("exportPlanFromLogs", () => {
    test("should export a plan from valid log files", async () => {
      // Create mock log entries
      const logEntries = [
        {
          timestamp: "2023-01-01T10:00:00.000Z",
          tool: "launchApp",
          params: { packageName: "com.example.app" },
          result: { success: true }
        },
        {
          timestamp: "2023-01-01T10:00:01.000Z",
          tool: "observe",
          params: { withViewHierarchy: true },
          result: { success: true }
        },
        {
          timestamp: "2023-01-01T10:00:02.000Z",
          tool: "tapOnText",
          params: { text: "Login" },
          result: { success: true }
        },
        {
          timestamp: "2023-01-01T10:00:03.000Z",
          tool: "observe",
          params: { withViewHierarchy: true },
          result: { success: true }
        }
      ];

      // Write log entries to files
      const logFile = path.join(tempDir, "test.json");
      const logContent = logEntries.map(entry => JSON.stringify(entry)).join("\n");
      await fs.writeFile(logFile, logContent);

      // Export plan
      const outputPath = path.join(tempDir, "test-plan.yaml");
      const result = await exportPlanFromLogs(tempDir, "Test Plan", outputPath);

      expect(result.success).toBe(true);
      expect(result.stepCount).toBe(3); // launchApp, tapOnText, last observe
      expect(result.planContent).toContain("Test Plan");
      expect(result.planContent).toContain("mcpVersion:");
      expect(result.planContent).toContain("launchApp");
      expect(result.planContent).toContain("tapOnText");
    });

    test("should omit emulator tools from plans", async () => {
      const logEntries = [
        {
          timestamp: "2023-01-01T10:00:00.000Z",
          tool: "startDevice",
          params: { avdName: "test" },
          result: { success: true }
        },
        {
          timestamp: "2023-01-01T10:00:01.000Z",
          tool: "launchApp",
          params: { packageName: "com.example.app" },
          result: { success: true }
        }
      ];

      const logFile = path.join(tempDir, "test.json");
      const logContent = logEntries.map(entry => JSON.stringify(entry)).join("\n");
      await fs.writeFile(logFile, logContent);

      const outputPath = path.join(tempDir, "test-plan.yaml");
      const result = await exportPlanFromLogs(tempDir, "Test Plan", outputPath);

      expect(result.success).toBe(true);
      expect(result.stepCount).toBe(1); // Only launchApp
      expect(result.planContent).not.toContain("startDevice");
      expect(result.planContent).toContain("launchApp");
    });

    test("should only include the last observe call", async () => {
      const logEntries = [
        {
          timestamp: "2023-01-01T10:00:00.000Z",
          tool: "observe",
          params: { withViewHierarchy: true },
          result: { success: true }
        },
        {
          timestamp: "2023-01-01T10:00:01.000Z",
          tool: "tapOnText",
          params: { text: "Login" },
          result: { success: true }
        },
        {
          timestamp: "2023-01-01T10:00:02.000Z",
          tool: "observe",
          params: { withViewHierarchy: false },
          result: { success: true }
        }
      ];

      const logFile = path.join(tempDir, "test.json");
      const logContent = logEntries.map(entry => JSON.stringify(entry)).join("\n");
      await fs.writeFile(logFile, logContent);

      const outputPath = path.join(tempDir, "test-plan.yaml");
      const result = await exportPlanFromLogs(tempDir, "Test Plan", outputPath);

      expect(result.success).toBe(true);
      expect(result.stepCount).toBe(2); // tapOnText + last observe

      // Check that the last observe has the correct params
      const planLines = result.planContent!.split("\n");
      const observeLines = planLines.filter(line => line.includes("withViewHierarchy"));
      expect(observeLines.length).toBe(1);
      expect(observeLines[0]).toContain("false");
    });

    test("should handle empty log directory", async () => {
      const outputPath = path.join(tempDir, "test-plan.yaml");
      const result = await exportPlanFromLogs(tempDir, "Test Plan", outputPath);

      expect(result.success).toBe(false);
      expect(result.error).toContain("No log files found");
    });

    test("should save to specified output path", async () => {
      const logEntries = [
        {
          timestamp: "2023-01-01T10:00:00.000Z",
          tool: "launchApp",
          params: { packageName: "com.example.app" },
          result: { success: true }
        }
      ];

      const logFile = path.join(tempDir, "test.json");
      const logContent = logEntries.map(entry => JSON.stringify(entry)).join("\n");
      await fs.writeFile(logFile, logContent);

      const outputPath = path.join(tempDir, "plan.yaml");
      const result = await exportPlanFromLogs(tempDir, "Test Plan", outputPath);

      expect(result.success).toBe(true);
      expect(result.planPath).toBe(outputPath);

      const savedContent = await fs.readFile(outputPath, "utf-8");
      expect(savedContent).toContain("Test Plan");
      expect(savedContent).toContain("launchApp");
    });
  });

  describe("importPlanFromYaml", () => {
    test("should import a valid YAML plan", () => {
      const yamlContent = `
name: Test Plan
description: A test plan
steps:
  - tool: launchApp
    appId: com.example.app
  - tool: tapOnText
    text: Login
metadata:
  createdAt: "2023-01-01T10:00:00.000Z"
  version: "0.0.1"
`;

      const plan = importPlanFromYaml(yamlContent);

      expect(plan.name).toBe("Test Plan");
      expect(plan.description).toBe("A test plan");
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].tool).toBe("launchApp");
      expect(plan.steps[0].params.appId).toBe("com.example.app");
      expect(plan.steps[1].tool).toBe("tapOn");
      expect(plan.steps[1].params.text).toBe("Login");
      expect(plan.steps[1].params.action).toBe("tap");
    });

    test("should throw error for invalid YAML", () => {
      const invalidYaml = "invalid: yaml: content: [";

      expect(() => importPlanFromYaml(invalidYaml)).toThrow();
    });

    test("should throw error for missing required fields", () => {
      const yamlContent = `
description: A plan without name
steps: []
`;

      expect(() => importPlanFromYaml(yamlContent)).toThrow("Invalid plan structure");
    });

    test("should throw error for invalid step structure", () => {
      const yamlContent = `
name: Test Plan
steps:
  - invalid_step: true
`;

      expect(() => importPlanFromYaml(yamlContent)).toThrow("Invalid step");
    });

    test("should migrate legacy plan fields and params", () => {
      const yamlContent = `
planName: Legacy Plan
metadata:
  description: Legacy description
steps:
  - command: launchApp
    packageName: com.example.app
  - tool: scroll
    containerElementId: list-id
    direction: down
  - tool: swipeOnScreen
    direction: up
    duration: 900
  - tool: tapOnText
    text: Login
`;

      const plan = importPlanFromYaml(yamlContent);

      expect(plan.name).toBe("Legacy Plan");
      expect(plan.description).toBe("Legacy description");
      expect(plan.steps[0].tool).toBe("launchApp");
      expect(plan.steps[0].params.appId).toBe("com.example.app");
      expect(plan.steps[1].tool).toBe("swipeOn");
      expect(plan.steps[1].params.container.elementId).toBe("list-id");
      expect(plan.steps[1].params.gestureType).toBe("scrollTowardsDirection");
      expect(plan.steps[2].tool).toBe("swipeOn");
      expect(plan.steps[2].params.autoTarget).toBe(false);
      expect(plan.steps[2].params.speed).toBe("slow");
      expect(plan.steps[3].tool).toBe("tapOn");
      expect(plan.steps[3].params.action).toBe("tap");
    });
  });

  describe("executePlan", () => {
    test("should return success for empty plan", async () => {
      const plan: Plan = {
        name: "Empty Plan",
        steps: []
      };

      const result = await executePlan(plan, 0);

      expect(result.success).toBe(true);
      expect(result.executedSteps).toBe(0);
      expect(result.totalSteps).toBe(0);
    });

    test("should start from step 0 when no startStep is provided", async () => {
      const plan: Plan = {
        name: "Test Plan",
        steps: []
      };

      const result = await executePlan(plan, 0);

      expect(result.success).toBe(true);
      expect(result.executedSteps).toBe(0);
      expect(result.totalSteps).toBe(0);
    });

    test("should start from step 0 when startStep is negative", async () => {
      const plan: Plan = {
        name: "Test Plan",
        steps: []
      };

      const result = await executePlan(plan, -5);

      expect(result.success).toBe(true);
      expect(result.executedSteps).toBe(0);
      expect(result.totalSteps).toBe(0);
    });

    test("should start from step 0 when startStep is not a number", async () => {
      const plan: Plan = {
        name: "Test Plan",
        steps: []
      };

      // @ts-ignore - Intentionally passing non-number for testing
      const result = await executePlan(plan, "invalid");

      expect(result.success).toBe(true);
      expect(result.executedSteps).toBe(0);
      expect(result.totalSteps).toBe(0);
    });

    test("should throw error when startStep is greater than total steps", async () => {
      const plan: Plan = {
        name: "Test Plan",
        steps: [
          { tool: "observe", params: { withViewHierarchy: false } },
          { tool: "observe", params: { withViewHierarchy: true } }
        ]
      };

      const result = await executePlan(plan, 5);

      expect(result.success).toBe(false);
      expect(result.failedStep?.error).toContain("Start step index 5 is out of bounds");
      expect(result.failedStep?.error).toContain("valid range: 0-1");
    });

    test("should throw error when startStep equals total steps", async () => {
      const plan: Plan = {
        name: "Test Plan",
        steps: [
          { tool: "observe", params: { withViewHierarchy: false } }
        ]
      };

      const result = await executePlan(plan, 1);

      expect(result.success).toBe(false);
      expect(result.failedStep?.error).toContain("Start step index 1 is out of bounds");
      expect(result.failedStep?.error).toContain("valid range: 0-0");
    });

    test("should execute all steps when startStep is 0", async () => {
      const plan: Plan = {
        name: "Test Plan",
        steps: [
          { tool: "unknownTool1", params: {} },
          { tool: "unknownTool2", params: {} }
        ]
      };

      const result = await executePlan(plan, 0);

      // This will fail because the tools don't exist, but it should show we tried to start from step 0
      expect(result.success).toBe(false);
      expect(result.totalSteps).toBe(2);
      expect(result.executedSteps).toBe(0);
      expect(result.failedStep?.stepIndex).toBe(0);
    });

    test("should skip initial steps when startStep is greater than 0", async () => {
      const plan: Plan = {
        name: "Test Plan",
        steps: [
          { tool: "skippedTool", params: {} },
          { tool: "unknownTool", params: {} }
        ]
      };

      const result = await executePlan(plan, 1);

      // This will fail because unknownTool doesn't exist, but it should show we started from step 1
      expect(result.success).toBe(false);
      expect(result.totalSteps).toBe(2);
      expect(result.executedSteps).toBe(0);
      expect(result.failedStep?.stepIndex).toBe(1);
      expect(result.failedStep?.tool).toBe("unknownTool");
    });

    test("should handle valid startStep for single step plan", async () => {
      const plan: Plan = {
        name: "Single Step Plan",
        steps: [
          { tool: "unknownTool", params: {} }
        ]
      };

      const result = await executePlan(plan, 0);

      expect(result.success).toBe(false);
      expect(result.totalSteps).toBe(1);
      expect(result.executedSteps).toBe(0);
      expect(result.failedStep?.stepIndex).toBe(0);
    });

    // Note: Full execution tests would require mocking the ToolRegistry
    // and actual tool implementations, which is beyond the scope of this unit test
  });
});
