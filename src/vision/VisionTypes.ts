/**
 * Type definitions for vision-based element detection fallback
 */

export interface ElementSearchCriteria {
  text?: string;
  resourceId?: string;
  containerElementId?: string;
  description?: string; // Human-readable description of what we're looking for
}

export interface NavigationStep {
  action: "tap" | "swipe" | "scroll" | "input" | "wait";
  target?: string; // Element text or resourceId
  direction?: "up" | "down" | "left" | "right";
  value?: string; // For input actions
  description: string;
}

export interface AlternativeSelector {
  type: "text" | "resourceId";
  value: string;
  confidence: number; // 0-1
  reasoning: string;
}

export interface VisionFallbackResult {
  found: boolean;
  confidence: "high" | "medium" | "low";

  // When element can be reached via navigation
  navigationSteps?: NavigationStep[];

  // Alternative selectors if element visible but wrong selector
  alternativeSelectors?: AlternativeSelector[];

  // When element cannot be found
  reason?: string;
  similarElements?: string[]; // Elements that might be what user wanted

  // Metadata
  costUsd: number;
  durationMs: number;
  screenshotPath: string;
  provider: "claude" | "local"; // Which provider was used
}

export interface VisionFallbackConfig {
  enabled: boolean;
  provider: "claude"; // Only Claude for now, can add 'local' later
  confidenceThreshold: "high" | "medium" | "low";
  maxCostUsd: number;
  cacheResults: boolean;
  cacheTtlMinutes: number;
}

export interface ClaudeVisionAnalysis {
  elementFound: boolean;
  elementLocation?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // Alternative selectors
  suggestedText?: string;
  suggestedResourceId?: string;

  // Navigation path
  navigationRequired: boolean;
  steps?: Array<{
    action: string;
    target: string;
    reasoning: string;
  }>;

  // Debugging
  visualDescription: string;
  similarElements: string[];
  confidence: number; // 0-1
  reasoning: string;
}
