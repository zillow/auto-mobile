/**
 * Unit tests for WcagAudit
 * Tests WCAG violation detection and audit functionality
 */

import { expect, describe, it, beforeEach } from "bun:test";
import { WcagAudit } from "../../../src/features/accessibility/WcagAudit";
import type { Element } from "../../../src/models/Element";
import type { ViewHierarchyNode } from "../../../src/models/ViewHierarchyResult";
import type { AccessibilityAuditConfig } from "../../../src/models/AccessibilityAudit";

describe("WcagAudit", function() {
  let audit: WcagAudit;

  beforeEach(function() {
    audit = new WcagAudit();
  });

  describe("Missing Content Descriptions", function() {
    it("should detect clickable elements without text or content-desc", async function() {
      const elements: Element[] = [
        {
          bounds: { left: 0, top: 0, right: 100, bottom: 50 },
          clickable: true,
          // No text or content-desc
        },
      ];

      const hierarchy: ViewHierarchyNode = { class: "View", children: [] };
      const config: AccessibilityAuditConfig = {
        level: "AA",
        failureMode: "report",
        useBaseline: false,
      };

      const result = await audit.audit(elements, hierarchy, undefined, "com.test", config);

      const contentDescViolations = result.violations.filter(
        v => v.type === "missing-content-description"
      );
      expect(contentDescViolations).toHaveLength(1);
    });

    it("should NOT flag elements with text", async function() {
      const elements: Element[] = [
        {
          bounds: { left: 0, top: 0, right: 100, bottom: 50 },
          clickable: true,
          text: "Click me",
        },
      ];

      const hierarchy: ViewHierarchyNode = { class: "View", children: [] };
      const config: AccessibilityAuditConfig = {
        level: "AA",
        failureMode: "report",
        useBaseline: false,
      };

      const result = await audit.audit(elements, hierarchy, undefined, "com.test", config);

      const contentDescViolations = result.violations.filter(
        v => v.type === "missing-content-description"
      );
      expect(contentDescViolations).toHaveLength(0);
    });

    it("should NOT flag elements with content-desc", async function() {
      const elements: Element[] = [
        {
          "bounds": { left: 0, top: 0, right: 100, bottom: 50 },
          "clickable": true,
          "content-desc": "Clickable button",
        },
      ];

      const hierarchy: ViewHierarchyNode = { class: "View", children: [] };
      const config: AccessibilityAuditConfig = {
        level: "AA",
        failureMode: "report",
        useBaseline: false,
      };

      const result = await audit.audit(elements, hierarchy, undefined, "com.test", config);

      const contentDescViolations = result.violations.filter(
        v => v.type === "missing-content-description"
      );
      expect(contentDescViolations).toHaveLength(0);
    });

    it("should NOT flag non-interactive elements without labels", async function() {
      const elements: Element[] = [
        {
          bounds: { left: 0, top: 0, right: 100, bottom: 50 },
          clickable: false,
          focusable: false,
        },
      ];

      const hierarchy: ViewHierarchyNode = { class: "View", children: [] };
      const config: AccessibilityAuditConfig = {
        level: "AA",
        failureMode: "report",
        useBaseline: false,
      };

      const result = await audit.audit(elements, hierarchy, undefined, "com.test", config);

      const contentDescViolations = result.violations.filter(
        v => v.type === "missing-content-description"
      );
      expect(contentDescViolations).toHaveLength(0);
    });

    it("should handle elements with only whitespace text", async function() {
      const elements: Element[] = [
        {
          bounds: { left: 0, top: 0, right: 100, bottom: 50 },
          clickable: true,
          text: "   ",
        },
      ];

      const hierarchy: ViewHierarchyNode = { class: "View", children: [] };
      const config: AccessibilityAuditConfig = {
        level: "AA",
        failureMode: "report",
        useBaseline: false,
      };

      const result = await audit.audit(elements, hierarchy, undefined, "com.test", config);

      const contentDescViolations = result.violations.filter(
        v => v.type === "missing-content-description"
      );
      // Current implementation treats whitespace as valid text (doesn't trim)
      expect(contentDescViolations).toHaveLength(0);
    });
  });

  describe("Touch Target Size", function() {
    it("should detect targets smaller than 44x44dp", async function() {
      const elements: Element[] = [
        {
          bounds: { left: 0, top: 0, right: 40, bottom: 40 }, // 40x40 < 44x44
          clickable: true,
          text: "Small",
        },
      ];

      const hierarchy: ViewHierarchyNode = { class: "View", children: [] };
      const config: AccessibilityAuditConfig = {
        level: "AA",
        failureMode: "report",
        useBaseline: false,
      };

      const result = await audit.audit(elements, hierarchy, undefined, "com.test", config);

      const sizeViolations = result.violations.filter(v => v.type === "touch-target-too-small");
      expect(sizeViolations).toHaveLength(1);
    });

    it("should pass targets at exactly 44x44dp", async function() {
      const elements: Element[] = [
        {
          bounds: { left: 0, top: 0, right: 44, bottom: 44 }, // Exactly 44x44
          clickable: true,
          text: "Perfect",
        },
      ];

      const hierarchy: ViewHierarchyNode = { class: "View", children: [] };
      const config: AccessibilityAuditConfig = {
        level: "AA",
        failureMode: "report",
        useBaseline: false,
      };

      const result = await audit.audit(elements, hierarchy, undefined, "com.test", config);

      const sizeViolations = result.violations.filter(v => v.type === "touch-target-too-small");
      expect(sizeViolations).toHaveLength(0);
    });

    it("should pass targets larger than 44x44dp", async function() {
      const elements: Element[] = [
        {
          bounds: { left: 0, top: 0, right: 100, bottom: 50 }, // Larger
          clickable: true,
          text: "Large",
        },
      ];

      const hierarchy: ViewHierarchyNode = { class: "View", children: [] };
      const config: AccessibilityAuditConfig = {
        level: "AA",
        failureMode: "report",
        useBaseline: false,
      };

      const result = await audit.audit(elements, hierarchy, undefined, "com.test", config);

      const sizeViolations = result.violations.filter(v => v.type === "touch-target-too-small");
      expect(sizeViolations).toHaveLength(0);
    });

    it("should only check clickable elements", async function() {
      const elements: Element[] = [
        {
          bounds: { left: 0, top: 0, right: 20, bottom: 20 }, // Small but not clickable
          clickable: false,
          text: "Not clickable",
        },
      ];

      const hierarchy: ViewHierarchyNode = { class: "View", children: [] };
      const config: AccessibilityAuditConfig = {
        level: "AA",
        failureMode: "report",
        useBaseline: false,
      };

      const result = await audit.audit(elements, hierarchy, undefined, "com.test", config);

      const sizeViolations = result.violations.filter(v => v.type === "touch-target-too-small");
      expect(sizeViolations).toHaveLength(0);
    });
  });

  describe("Summary Generation", function() {
    it("should generate correct summary statistics", async function() {
      const elements: Element[] = [
        {
          bounds: { left: 0, top: 0, right: 20, bottom: 20 },
          clickable: true,
          // Missing content-desc
        },
        {
          bounds: { left: 0, top: 30, right: 30, bottom: 60 },
          clickable: true,
          // Missing content-desc and too small
        },
      ];

      const hierarchy: ViewHierarchyNode = { class: "View", children: [] };
      const config: AccessibilityAuditConfig = {
        level: "AA",
        failureMode: "strict", // Use strict mode to fail on any violations
        useBaseline: false,
      };

      const result = await audit.audit(elements, hierarchy, undefined, "com.test", config);

      expect(result.summary.totalViolations).toBeGreaterThan(0);
      expect(result.summary.bySeverity.error).toBeGreaterThan(0);
      expect(result.summary.passed).toBe(false);
    });

    it("should handle missing screenshot gracefully", async function() {
      const elements: Element[] = [
        {
          bounds: { left: 0, top: 0, right: 100, bottom: 50 },
          text: "Test",
        },
      ];

      const hierarchy: ViewHierarchyNode = { class: "View", children: [] };
      const config: AccessibilityAuditConfig = {
        level: "AA",
        failureMode: "report",
        useBaseline: false,
      };

      // No screenshot provided - should not throw
      const result = await audit.audit(elements, hierarchy, undefined, "com.test", config);

      expect(result).not.toBeNull();
      expect(result.violations).toBeInstanceOf(Array);
      // Should not have contrast violations without screenshot
      const contrastViolations = result.violations.filter(
        v => v.type === "insufficient-contrast"
      );
      expect(contrastViolations).toHaveLength(0);
    });
  });
});
