/**
 * WCAG 2.1 accessibility audit implementation
 * Detects common accessibility violations in Android UIs
 */

import crypto from "crypto";
import { Element } from "../../models/Element";
import { ViewHierarchyNode } from "../../models/ViewHierarchyResult";
import {
  AccessibilityAuditConfig,
  AccessibilityAuditResult,
  WcagViolation,
  ViolationType,
  AccessibilityAuditSummary,
} from "../../models/AccessibilityAudit";
import { ContrastChecker } from "./ContrastChecker";
import { BaselineManager } from "./BaselineManager";
import { Timer, defaultTimer } from "../../utils/SystemTimer";

export class WcagAudit {
  private contrastChecker: ContrastChecker;
  private baselineManager: BaselineManager;
  private timer: Timer;

  constructor(timer: Timer = defaultTimer) {
    this.contrastChecker = new ContrastChecker({}, timer);
    this.baselineManager = new BaselineManager();
    this.timer = timer;
  }

  /**
   * Perform a WCAG accessibility audit on the current screen
   */
  async audit(
    elements: Element[],
    viewHierarchy: ViewHierarchyNode,
    screenshotPath: string | undefined,
    packageName: string,
    config: AccessibilityAuditConfig
  ): Promise<AccessibilityAuditResult> {
    const violations: WcagViolation[] = [];

    // Check for missing content descriptions
    violations.push(...this.checkMissingContentDescriptions(elements));

    // Check for insufficient contrast ratios (if screenshot available)
    if (screenshotPath) {
      const contrastViolations = await this.checkContrastRatios(
        elements,
        screenshotPath,
        config.level,
        config.contrast
      );
      violations.push(...contrastViolations);
    }

    // Check for touch target size violations
    violations.push(...this.checkTouchTargetSizes(elements, config.level));

    // Check for heading hierarchy violations
    violations.push(...this.checkHeadingHierarchy(viewHierarchy));

    // Check for unlabeled form inputs
    violations.push(...this.checkFormInputLabels(elements, viewHierarchy));

    // Generate screen ID for baseline tracking
    const screenId = this.generateScreenId(packageName, viewHierarchy);

    // Filter violations based on baseline if enabled
    let filteredViolations = violations;
    let baselinedCount = 0;

    if (config.useBaseline) {
      const baseline = await this.baselineManager.getBaseline(screenId);
      if (baseline) {
        const baselineFingerprints = new Set(baseline.violations.map(v => v.fingerprint));
        filteredViolations = violations.filter(v => !baselineFingerprints.has(v.fingerprint));
        baselinedCount = violations.length - filteredViolations.length;
      }
    }

    // Generate summary
    const summary = this.generateSummary(
      violations,
      filteredViolations,
      baselinedCount,
      config
    );

    return {
      config,
      summary,
      violations: filteredViolations,
      timestamp: this.timer.now(),
      screenId,
    };
  }

  /**
   * Save current violations as baseline
   */
  async saveBaseline(result: AccessibilityAuditResult): Promise<void> {
    await this.baselineManager.saveBaseline(result.screenId, result.violations);
  }

  /**
   * Clear baseline for a screen
   */
  async clearBaseline(screenId: string): Promise<void> {
    await this.baselineManager.clearBaseline(screenId);
  }

  /**
   * Check for clickable/focusable elements without content descriptions
   */
  private checkMissingContentDescriptions(elements: Element[]): WcagViolation[] {
    const violations: WcagViolation[] = [];

    for (const element of elements) {
      // Skip if element has text or content-desc
      if (element.text || element["content-desc"]) {
        continue;
      }

      // Check if element is interactive
      const isInteractive = element.clickable || element.focusable || element.checkable;

      if (isInteractive) {
        violations.push({
          type: "missing-content-description",
          severity: "error",
          criterion: "1.1.1", // Non-text Content
          message: `Interactive element (${element.class || "unknown"}) lacks accessible label`,
          element,
          details: {
            explanation:
              "Clickable, focusable, or checkable elements must have a text label or content-desc for screen readers",
          },
          fingerprint: this.generateFingerprint(element, "missing-content-description"),
        });
      }
    }

    return violations;
  }

  /**
   * Check text contrast ratios against WCAG standards
   * Optimized to use batch processing for better performance
   */
  private async checkContrastRatios(
    elements: Element[],
    screenshotPath: string,
    wcagLevel: string,
    contrastConfig?: AccessibilityAuditConfig["contrast"]
  ): Promise<WcagViolation[]> {
    const violations: WcagViolation[] = [];

    // Filter to text elements only
    const textElements = elements.filter(e => e.text && e.text.trim().length > 0);

    // Use batch processing for optimal performance
    const checker = contrastConfig ? new ContrastChecker(contrastConfig, this.timer) : this.contrastChecker;
    const results = await checker.checkContrastBatch(
      screenshotPath,
      textElements,
      wcagLevel as "A" | "AA" | "AAA"
    );

    // Process results and create violations
    for (const [element, result] of results.entries()) {
      if (result && result.minRatio < result.requiredRatio) {
        const ratioText = result.minRatio.toFixed(2);
        const maxText = result.maxRatio.toFixed(2);
        const avgText = result.avgRatio.toFixed(2);
        const shadowNote = result.shadowDetected ? " (shadow-enhanced)" : "";
        violations.push({
          type: "insufficient-contrast",
          severity: wcagLevel === "AAA" ? "warning" : "error",
          criterion: "1.4.3", // Contrast (Minimum) for AA, 1.4.6 for AAA
          message: `Text has insufficient contrast ratio: ${ratioText}:1 (required: ${result.requiredRatio}:1)`,
          element,
          details: {
            contrastRatio: parseFloat(ratioText),
            contrastMinRatio: parseFloat(ratioText),
            contrastMaxRatio: parseFloat(maxText),
            contrastAvgRatio: parseFloat(avgText),
            requiredRatio: result.requiredRatio,
            explanation: `Text color RGB(${result.textColor.r},${result.textColor.g},${result.textColor.b}) on background RGB(${result.backgroundColor.r},${result.backgroundColor.g},${result.backgroundColor.b}). Samples min/avg/max=${ratioText}/${avgText}/${maxText}${shadowNote}.`,
          },
          fingerprint: this.generateFingerprint(element, "insufficient-contrast"),
        });
      }
    }

    return violations;
  }

  /**
   * Check for touch targets that are too small
   */
  private checkTouchTargetSizes(elements: Element[], wcagLevel: string): WcagViolation[] {
    const violations: WcagViolation[] = [];

    // WCAG 2.1 Level AA: minimum 44x44 CSS pixels (approx 44 dp on Android)
    // WCAG 2.1 Level AAA: no additional requirement beyond AA
    const minSize = 44;

    for (const element of elements) {
      // Only check clickable elements
      if (!element.clickable) {
        continue;
      }

      const width = element.bounds.right - element.bounds.left;
      const height = element.bounds.bottom - element.bounds.top;

      if (width < minSize || height < minSize) {
        violations.push({
          type: "touch-target-too-small",
          severity: wcagLevel === "AAA" ? "error" : "warning",
          criterion: "2.5.5", // Target Size (Level AAA in WCAG 2.1, AA in WCAG 2.2)
          message: `Touch target is too small: ${width}x${height}dp (minimum: ${minSize}x${minSize}dp)`,
          element,
          details: {
            actualSize: { width, height },
            requiredSize: { width: minSize, height: minSize },
            explanation: "Touch targets should be at least 44x44 dp to be easily tappable",
          },
          fingerprint: this.generateFingerprint(element, "touch-target-too-small"),
        });
      }
    }

    return violations;
  }

  /**
   * Check heading hierarchy for skipped levels
   */
  private checkHeadingHierarchy(hierarchy: ViewHierarchyNode): WcagViolation[] {
    const violations: WcagViolation[] = [];
    const headings = this.extractHeadings(hierarchy);

    if (headings.length < 2) {
      return violations; // Need at least 2 headings to check hierarchy
    }

    for (let i = 1; i < headings.length; i++) {
      const prevLevel = headings[i - 1].level;
      const currLevel = headings[i].level;

      // Check if we skipped a level (e.g., h1 -> h3)
      if (currLevel > prevLevel + 1) {
        violations.push({
          type: "heading-hierarchy-skip",
          severity: "warning",
          criterion: "1.3.1", // Info and Relationships
          message: `Heading hierarchy skip: h${prevLevel} to h${currLevel} (expected h${prevLevel + 1})`,
          element: headings[i].element,
          details: {
            expectedLevel: prevLevel + 1,
            actualLevel: currLevel,
            explanation: "Heading levels should not be skipped to maintain proper document structure",
          },
          fingerprint: this.generateFingerprint(headings[i].element, "heading-hierarchy-skip"),
        });
      }
    }

    return violations;
  }

  /**
   * Extract heading elements from hierarchy
   * Note: Android doesn't have native heading semantics, so this is a heuristic
   */
  private extractHeadings(
    node: ViewHierarchyNode,
    headings: Array<{ level: number; element: Element }> = []
  ): Array<{ level: number; element: Element }> {
    // Heuristic: larger text sizes are likely headings
    // This is a simplified approach - real apps may need custom logic
    const element = node as unknown as Element;

    if (element.text) {
      const height = element.bounds.bottom - element.bounds.top;

      // Rough heuristic for heading levels based on text height
      let level = 6; // Default to h6
      if (height > 48) {level = 1;} else if (height > 36) {level = 2;} else if (height > 28) {level = 3;} else if (height > 22) {level = 4;} else if (height > 18) {level = 5;}

      // Only consider it a heading if it's relatively large
      if (height > 20) {
        headings.push({ level, element });
      }
    }

    // Recurse through children
    if (node.children) {
      for (const child of node.children) {
        this.extractHeadings(child, headings);
      }
    }

    return headings;
  }

  /**
   * Check for form inputs without associated labels
   */
  private checkFormInputLabels(
    elements: Element[],
    hierarchy: ViewHierarchyNode
  ): WcagViolation[] {
    const violations: WcagViolation[] = [];

    // Identify form input elements
    const inputElements = elements.filter(
      e =>
        e.class?.includes("EditText") ||
        e.class?.includes("Spinner") ||
        e.class?.includes("CheckBox") ||
        e.class?.includes("RadioButton")
    );

    for (const input of inputElements) {
      // Check if input has a label via text, content-desc, or nearby TextView
      const hasLabel =
        input.text ||
        input["content-desc"] ||
        this.hasNearbyLabel(input, elements);

      if (!hasLabel) {
        violations.push({
          type: "unlabeled-form-input",
          severity: "error",
          criterion: "3.3.2", // Labels or Instructions
          message: `Form input (${input.class || "unknown"}) lacks accessible label`,
          element: input,
          details: {
            explanation:
              "Form inputs must have associated labels for screen reader users to understand their purpose",
          },
          fingerprint: this.generateFingerprint(input, "unlabeled-form-input"),
        });
      }
    }

    return violations;
  }

  /**
   * Check if an element has a nearby TextView that could serve as a label
   */
  private hasNearbyLabel(input: Element, allElements: Element[]): boolean {
    const textViews = allElements.filter(e => e.class?.includes("TextView") && e.text);

    for (const textView of textViews) {
      // Check if TextView is close to the input (within 50dp vertically or horizontally)
      const inputCenterY = (input.bounds.top + input.bounds.bottom) / 2;
      const textCenterY = (textView.bounds.top + textView.bounds.bottom) / 2;
      const verticalDistance = Math.abs(inputCenterY - textCenterY);

      const inputCenterX = (input.bounds.left + input.bounds.right) / 2;
      const textCenterX = (textView.bounds.left + textView.bounds.right) / 2;
      const horizontalDistance = Math.abs(inputCenterX - textCenterX);

      if (verticalDistance < 50 || horizontalDistance < 50) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate a unique fingerprint for a violation
   */
  private generateFingerprint(element: Element, violationType: ViolationType): string {
    const data = JSON.stringify({
      type: violationType,
      resourceId: element["resource-id"],
      class: element.class,
      bounds: element.bounds,
      text: element.text,
    });

    return crypto.createHash("md5").update(data).digest("hex");
  }

  /**
   * Generate screen identifier for baseline tracking
   */
  private generateScreenId(packageName: string, hierarchy: ViewHierarchyNode): string {
    // Use package name + root activity/fragment identifier
    // This is a simplified approach - could be enhanced with more specific identifiers
    const rootNode = this.resolveRootNode(hierarchy);
    const rootClass = rootNode.class || "unknown";
    const rootId = rootNode["resource-id"] || "";

    return `${packageName}:${rootClass}:${rootId}`;
  }

  private resolveRootNode(hierarchy: ViewHierarchyNode): ViewHierarchyNode {
    const node = (hierarchy as any).node;
    if (Array.isArray(node) && node.length > 0) {
      return node[node.length - 1] as ViewHierarchyNode;
    }
    if (node && typeof node === "object") {
      return node as ViewHierarchyNode;
    }
    return hierarchy;
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(
    allViolations: WcagViolation[],
    filteredViolations: WcagViolation[],
    baselinedCount: number,
    config: AccessibilityAuditConfig
  ): AccessibilityAuditSummary {
    const bySeverity = {
      error: filteredViolations.filter(v => v.severity === "error").length,
      warning: filteredViolations.filter(v => v.severity === "warning").length,
      info: filteredViolations.filter(v => v.severity === "info").length,
    };

    const byType: Record<ViolationType, number> = {
      "missing-content-description": 0,
      "insufficient-contrast": 0,
      "touch-target-too-small": 0,
      "heading-hierarchy-skip": 0,
      "unlabeled-form-input": 0,
    };

    for (const violation of filteredViolations) {
      byType[violation.type]++;
    }

    // Determine if audit passed based on failure mode
    let passed = true;
    let failureReason: string | undefined;

    if (config.failureMode === "strict" && filteredViolations.length > 0) {
      passed = false;
      failureReason = `Found ${filteredViolations.length} accessibility violation(s) in strict mode`;
    } else if (config.failureMode === "threshold") {
      const minSeverity = config.minSeverity || "warning";
      const relevantViolations = filteredViolations.filter(v => {
        if (minSeverity === "error") {return v.severity === "error";}
        if (minSeverity === "warning") {return v.severity === "error" || v.severity === "warning";}
        return true;
      });

      if (relevantViolations.length > 0) {
        passed = false;
        failureReason = `Found ${relevantViolations.length} violation(s) at or above ${minSeverity} severity`;
      }
    }
    // "report" mode always passes

    return {
      totalViolations: allViolations.length,
      bySeverity,
      byType,
      baselinedViolations: baselinedCount,
      passed,
      failureReason,
    };
  }
}
