import { Element } from "./Element";

/**
 * WCAG 2.1 compliance levels
 */
export type WcagLevel = "A" | "AA" | "AAA";

/**
 * Violation severity levels
 */
export type ViolationSeverity = "error" | "warning" | "info";

/**
 * Failure mode for accessibility audits
 */
export type FailureMode = "report" | "threshold" | "strict";

/**
 * Types of WCAG violations that can be detected
 */
export type ViolationType =
  | "missing-content-description"
  | "insufficient-contrast"
  | "touch-target-too-small"
  | "heading-hierarchy-skip"
  | "unlabeled-form-input";

/**
 * Configuration for accessibility audit
 */
export interface AccessibilityAuditConfig {
  /** WCAG compliance level to check against (default: AA) */
  level: WcagLevel;

  /** Failure mode: report (non-blocking), threshold (configurable), strict (fail on any) */
  failureMode: FailureMode;

  /** Whether to use baseline to suppress known violations */
  useBaseline: boolean;

  /** Minimum severity level to report (default: warning for threshold, error for strict) */
  minSeverity?: ViolationSeverity;

  /** Contrast sampling configuration */
  contrast?: {
    useMultiPointSampling?: boolean;
    detectGradients?: boolean;
    compositeOverlays?: boolean;
    detectTextShadows?: boolean;
    samplingPoints?: 5 | 9 | 13;
  };
}

/**
 * Details about a specific WCAG violation
 */
export interface WcagViolation {
  /** Type of violation */
  type: ViolationType;

  /** Severity level */
  severity: ViolationSeverity;

  /** WCAG success criterion (e.g., "1.4.3", "2.5.5") */
  criterion: string;

  /** Human-readable description of the violation */
  message: string;

  /** The UI element that has the violation */
  element: Element;

  /** Additional context-specific data */
  details?: {
    /** For contrast violations: actual contrast ratio */
    contrastRatio?: number;

    /** For contrast violations: worst-case contrast ratio across samples */
    contrastMinRatio?: number;

    /** For contrast violations: best-case contrast ratio across samples */
    contrastMaxRatio?: number;

    /** For contrast violations: average contrast ratio across samples */
    contrastAvgRatio?: number;

    /** For contrast violations: required minimum ratio */
    requiredRatio?: number;

    /** For touch target violations: actual size in dp */
    actualSize?: { width: number; height: number };

    /** For touch target violations: required minimum size in dp */
    requiredSize?: { width: number; height: number };

    /** For heading violations: expected level */
    expectedLevel?: number;

    /** For heading violations: actual level */
    actualLevel?: number;

    /** For any violation: additional explanation */
    explanation?: string;
  };

  /** Unique fingerprint for baseline matching */
  fingerprint: string;
}

/**
 * Summary statistics for accessibility audit
 */
export interface AccessibilityAuditSummary {
  /** Total violations found (before baseline filtering) */
  totalViolations: number;

  /** Violations by severity */
  bySeverity: {
    error: number;
    warning: number;
    info: number;
  };

  /** Violations by type */
  byType: Record<ViolationType, number>;

  /** Number of violations suppressed by baseline */
  baselinedViolations: number;

  /** Whether the audit passed based on failure mode */
  passed: boolean;

  /** Reason for failure if not passed */
  failureReason?: string;
}

/**
 * Result of an accessibility audit
 */
export interface AccessibilityAuditResult {
  /** Configuration used for this audit */
  config: AccessibilityAuditConfig;

  /** Summary statistics */
  summary: AccessibilityAuditSummary;

  /** List of violations (after baseline filtering) */
  violations: WcagViolation[];

  /** Timestamp when audit was performed */
  timestamp: number;

  /** Screen identifier (package name + activity) for baseline tracking */
  screenId: string;
}
