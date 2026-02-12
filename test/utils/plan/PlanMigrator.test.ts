import { describe, expect, test } from "bun:test";
import { migratePlan } from "../../../src/utils/plan/PlanMigrator";

describe("PlanMigrator", () => {
  describe("migratePlan", () => {
    test("throws for non-object input", () => {
      expect(() => migratePlan("not an object")).toThrow("Plan is not a valid object");
      expect(() => migratePlan(null)).toThrow("Plan is not a valid object");
      expect(() => migratePlan(42)).toThrow("Plan is not a valid object");
      expect(() => migratePlan([])).toThrow("Plan is not a valid object");
    });

    test("passes through a current-version plan with minimal changes", () => {
      const input = {
        name: "Current Plan",
        mcpVersion: "99.99.99",
        metadata: {
          createdAt: "2024-01-01T00:00:00.000Z",
          version: "1.0.0",
        },
        steps: [{ tool: "tapOn", params: { text: "Hello" } }],
      };

      const { plan } = migratePlan(input);

      expect(plan.name).toBe("Current Plan");
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].tool).toBe("tapOn");
    });

    describe("plan field migrations", () => {
      test("renames planName to name", () => {
        const { plan, report } = migratePlan({
          planName: "Old Name",
          steps: [{ tool: "observe", params: {} }],
        });

        expect(plan.name).toBe("Old Name");
        expect(plan.planName).toBeUndefined();
        expect(report.migrated).toBe(true);
        expect(report.appliedMigrations).toContain("plan-fields");
        expect(report.warnings.some(w => w.message.includes("Renamed planName to name"))).toBe(true);
      });

      test("moves metadata.name to plan name", () => {
        const { plan, report } = migratePlan({
          metadata: { name: "Meta Name" },
          steps: [{ tool: "observe", params: {} }],
        });

        expect(plan.name).toBe("Meta Name");
        expect(plan.metadata.name).toBeUndefined();
        expect(report.migrated).toBe(true);
      });

      test("moves metadata.description to plan description", () => {
        const { plan, report } = migratePlan({
          name: "Plan",
          metadata: { description: "Meta Description" },
          steps: [{ tool: "observe", params: {} }],
        });

        expect(plan.description).toBe("Meta Description");
        expect(plan.metadata.description).toBeUndefined();
        expect(report.migrated).toBe(true);
      });

      test("maps generated timestamp to metadata.createdAt", () => {
        const { plan, report } = migratePlan({
          name: "Plan",
          generated: "2024-06-15T12:00:00.000Z",
          steps: [{ tool: "observe", params: {} }],
        });

        expect(plan.metadata.createdAt).toBe("2024-06-15T12:00:00.000Z");
        expect(plan.generated).toBeUndefined();
        expect(report.migrated).toBe(true);
        expect(report.warnings.some(w => w.message.includes("generated timestamp"))).toBe(true);
      });

      test("moves top-level appId to metadata.appId", () => {
        const { plan, report } = migratePlan({
          name: "Plan",
          appId: "com.example.app",
          steps: [{ tool: "observe", params: {} }],
        });

        expect(plan.metadata.appId).toBe("com.example.app");
        expect(plan.appId).toBeUndefined();
        expect(report.migrated).toBe(true);
      });

      test("moves metadata.mcpVersion to top-level mcpVersion", () => {
        const { plan, report } = migratePlan({
          name: "Plan",
          metadata: { mcpVersion: "1.2.3" },
          steps: [{ tool: "observe", params: {} }],
        });

        expect(plan.mcpVersion).toBe("1.2.3");
        expect(plan.metadata.mcpVersion).toBeUndefined();
        expect(report.migrated).toBe(true);
      });

      test("defaults missing mcpVersion to unknown", () => {
        const { plan, report } = migratePlan({
          name: "Plan",
          steps: [{ tool: "observe", params: {} }],
        });

        expect(plan.mcpVersion).toBe("unknown");
        expect(report.migrated).toBe(true);
        expect(report.warnings.some(w => w.message.includes("Defaulted missing mcpVersion"))).toBe(true);
      });

      test("defaults missing metadata.createdAt", () => {
        const { plan, report } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          steps: [{ tool: "observe", params: {} }],
        });

        expect(plan.metadata.createdAt).toBeDefined();
        expect(typeof plan.metadata.createdAt).toBe("string");
        expect(report.migrated).toBe(true);
      });

      test("defaults missing metadata.version to 1.0.0", () => {
        const { plan, report } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          steps: [{ tool: "observe", params: {} }],
        });

        expect(plan.metadata.version).toBe("1.0.0");
        expect(report.migrated).toBe(true);
      });

      test("resets non-object metadata with warning", () => {
        const { plan, report } = migratePlan({
          name: "Plan",
          metadata: "not an object",
          steps: [{ tool: "observe", params: {} }],
        });

        expect(typeof plan.metadata).toBe("object");
        expect(report.warnings.some(w => w.message.includes("metadata was not an object"))).toBe(true);
      });
    });

    describe("step field migrations", () => {
      test("renames command to tool", () => {
        const { plan, report } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ command: "tapOn", params: { text: "Hello" } }],
        });

        expect(plan.steps[0].tool).toBe("tapOn");
        expect(plan.steps[0].command).toBeUndefined();
        expect(report.appliedMigrations).toContain("step-fields");
      });

      test("renames tapOnText to tapOn", () => {
        const { plan, report } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "tapOnText", params: { text: "Hello" } }],
        });

        expect(plan.steps[0].tool).toBe("tapOn");
        expect(report.warnings.some(w => w.message.includes("Renamed tapOnText to tapOn"))).toBe(true);
      });

      test("renames swipeOnScreen to swipeOn and defaults autoTarget", () => {
        const { plan, report } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "swipeOnScreen", params: { direction: "up" } }],
        });

        expect(plan.steps[0].tool).toBe("swipeOn");
        expect(plan.steps[0].params.autoTarget).toBe(false);
        expect(report.warnings.some(w => w.message.includes("Renamed swipeOnScreen to swipeOn"))).toBe(true);
      });

      test("renames scroll to swipeOn and defaults gestureType", () => {
        const { plan } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "scroll", params: { direction: "down" } }],
        });

        expect(plan.steps[0].tool).toBe("swipeOn");
        expect(plan.steps[0].params.gestureType).toBe("scrollTowardsDirection");
      });

      test("renames packageName to appId for launchApp", () => {
        const { plan } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "launchApp", params: { packageName: "com.example" } }],
        });

        expect(plan.steps[0].params.appId).toBe("com.example");
        expect(plan.steps[0].params.packageName).toBeUndefined();
      });

      test("renames bundleId to appId for terminateApp", () => {
        const { plan } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "terminateApp", params: { bundleId: "com.example.ios" } }],
        });

        expect(plan.steps[0].params.appId).toBe("com.example.ios");
        expect(plan.steps[0].params.bundleId).toBeUndefined();
      });

      test("defaults tapOn.action to tap", () => {
        const { plan } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "tapOn", params: { text: "Hello" } }],
        });

        expect(plan.steps[0].params.action).toBe("tap");
      });

      test("renames id to elementId for tapOn", () => {
        const { plan } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "tapOn", params: { id: "submit_button" } }],
        });

        expect(plan.steps[0].params.elementId).toBe("submit_button");
        expect(plan.steps[0].params.id).toBeUndefined();
      });

      test("renames inputText.value to text", () => {
        const { plan } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "inputText", params: { value: "hello" } }],
        });

        expect(plan.steps[0].params.text).toBe("hello");
        expect(plan.steps[0].params.value).toBeUndefined();
      });

      test("renames openLink.link to url", () => {
        const { plan } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "openLink", params: { link: "https://example.com" } }],
        });

        expect(plan.steps[0].params.url).toBe("https://example.com");
        expect(plan.steps[0].params.link).toBeUndefined();
      });

      test("migrates swipe containerElementId to container.elementId", () => {
        const { plan } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [
            {
              tool: "swipeOn",
              params: { direction: "up", containerElementId: "list_view" },
            },
          ],
        });

        expect(plan.steps[0].params.container).toEqual({ elementId: "list_view" });
        expect(plan.steps[0].params.containerElementId).toBeUndefined();
      });

      test("migrates swipe containerText to container.text", () => {
        const { plan } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [
            {
              tool: "swipeOn",
              params: { direction: "up", containerText: "My List" },
            },
          ],
        });

        expect(plan.steps[0].params.container).toEqual({ text: "My List" });
        expect(plan.steps[0].params.containerText).toBeUndefined();
      });

      test("maps swipe duration to speed and removes duration", () => {
        const { plan: planSlow } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "swipeOn", params: { direction: "up", duration: 1000 } }],
        });
        expect(planSlow.steps[0].params.speed).toBe("slow");
        expect(planSlow.steps[0].params.duration).toBeUndefined();

        const { plan: planFast } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "swipeOn", params: { direction: "up", duration: 200 } }],
        });
        expect(planFast.steps[0].params.speed).toBe("fast");

        const { plan: planNormal } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "swipeOn", params: { direction: "up", duration: 500 } }],
        });
        expect(planNormal.steps[0].params.speed).toBe("normal");
      });

      test("removes deprecated scrollMode from swipeOn", () => {
        const { plan, report } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "swipeOn", params: { direction: "up", scrollMode: "fast" } }],
        });

        expect(plan.steps[0].params.scrollMode).toBeUndefined();
        expect(report.warnings.some(w => w.message.includes("Removed deprecated scrollMode"))).toBe(true);
      });

      test("removes deprecated observe.withViewHierarchy", () => {
        const { plan, report } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "observe", params: { withViewHierarchy: true } }],
        });

        expect(plan.steps[0].params.withViewHierarchy).toBeUndefined();
        expect(report.warnings.some(w => w.message.includes("Removed deprecated observe.withViewHierarchy"))).toBe(true);
      });

      test("maps step description to label", () => {
        const { plan, report } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "tapOn", description: "Click the button", params: { text: "Go" } }],
        });

        expect(plan.steps[0].label).toBe("Click the button");
        expect(plan.steps[0].description).toBeUndefined();
        expect(report.warnings.some(w => w.message.includes("Mapped step description to label"))).toBe(true);
      });

      test("merges inline step fields into params", () => {
        const { plan } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "tapOn", text: "Hello", action: "tap" }],
        });

        expect(plan.steps[0].params.text).toBe("Hello");
        expect(plan.steps[0].params.action).toBe("tap");
      });

      test("skips non-record steps", () => {
        const { plan } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: ["not a step", 42, null],
        });

        expect(plan.steps).toHaveLength(3);
        // Non-record steps are passed through unchanged
        expect(plan.steps[0]).toBe("not a step");
      });
    });

    describe("migration report", () => {
      test("reports original and target versions", () => {
        const { report } = migratePlan({
          name: "Plan",
          mcpVersion: "0.5.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "observe", params: {} }],
        });

        expect(report.originalVersion).toBe("0.5.0");
        expect(typeof report.targetVersion).toBe("string");
      });

      test("detects unknown original version", () => {
        const { report } = migratePlan({
          name: "Plan",
          steps: [{ tool: "observe", params: {} }],
        });

        expect(report.originalVersion).toBe("unknown");
      });

      test("reads mcpVersion from metadata if not at top level", () => {
        const { report } = migratePlan({
          name: "Plan",
          metadata: { mcpVersion: "0.3.0" },
          steps: [{ tool: "observe", params: {} }],
        });

        expect(report.originalVersion).toBe("0.3.0");
      });

      test("reports outdated when version is older", () => {
        const { report } = migratePlan({
          name: "Plan",
          mcpVersion: "0.0.1",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [{ tool: "observe", params: {} }],
        });

        expect(report.outdated).toBe(true);
      });

      test("reports not migrated when no changes needed", () => {
        // Build a fully-specified plan that needs no migration
        const { report } = migratePlan({
          name: "Current",
          mcpVersion: "99.99.99",
          metadata: {
            createdAt: "2024-01-01T00:00:00.000Z",
            version: "1.0.0",
          },
          steps: [{ tool: "observe", params: {} }],
        });

        expect(report.migrated).toBe(false);
        expect(report.appliedMigrations).toHaveLength(0);
      });

      test("includes step index in step warnings", () => {
        const { report } = migratePlan({
          name: "Plan",
          mcpVersion: "1.0.0",
          metadata: { createdAt: "2024-01-01", version: "1.0.0" },
          steps: [
            { tool: "observe", params: {} },
            { command: "tapOn", params: { text: "Go" } },
          ],
        });

        const stepWarnings = report.warnings.filter(w => w.stepIndex !== undefined);
        expect(stepWarnings.length).toBeGreaterThan(0);
        // The second step (index 1) should have had command -> tool migration
        expect(stepWarnings.some(w => w.stepIndex === 1)).toBe(true);
      });
    });
  });
});
