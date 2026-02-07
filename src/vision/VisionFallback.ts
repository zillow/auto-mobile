/**
 * Vision Fallback orchestrator for UI element detection
 * Coordinates vision providers (Claude) to find elements when traditional methods fail
 */

import { ClaudeVisionClient } from "./ClaudeVisionClient";
import type {
  VisionFallbackConfig,
  VisionFallbackResult,
  ElementSearchCriteria,
} from "./VisionTypes";
import type { ViewHierarchyNode } from "../models/ViewHierarchyResult";
import type { Timer } from "../utils/SystemTimer";
import { defaultTimer } from "../utils/SystemTimer";

export class VisionFallback {
  private config: VisionFallbackConfig;
  private claudeClient: ClaudeVisionClient | null = null;
  private resultCache: Map<string, { result: VisionFallbackResult; timestamp: number }>;
  private timer: Timer;

  constructor(config: VisionFallbackConfig, timer: Timer = defaultTimer) {
    this.config = config;
    this.timer = timer;
    this.resultCache = new Map();

    // Initialize Claude client if provider is 'claude'
    if (config.provider === "claude") {
      this.claudeClient = new ClaudeVisionClient();
    }
  }

  async analyzeAndSuggest(
    screenshotPath: string,
    hierarchy: ViewHierarchyNode,
    searchCriteria: ElementSearchCriteria
  ): Promise<VisionFallbackResult> {
    if (!this.config.enabled) {
      throw new Error("Vision fallback is not enabled");
    }

    // Check cache first
    if (this.config.cacheResults) {
      const cached = this.getCachedResult(screenshotPath, searchCriteria);
      if (cached) {
        console.log("✓ Vision fallback: Using cached result");
        return cached;
      }
    }

    // Use Claude vision
    if (this.config.provider === "claude") {
      if (!this.claudeClient) {
        throw new Error("Claude client not initialized");
      }

      console.log("🔍 Vision fallback: Analyzing with Claude...");
      const result = await this.claudeClient.analyzeUIElement(
        screenshotPath,
        searchCriteria,
        hierarchy
      );

      // Check if cost exceeds max
      if (result.costUsd > this.config.maxCostUsd) {
        console.warn(`⚠️  Vision fallback cost ($${result.costUsd.toFixed(4)}) exceeds max ($${this.config.maxCostUsd})`);
      }

      console.log(`✓ Vision fallback complete: confidence=${result.confidence}, cost=$${result.costUsd.toFixed(4)}, time=${result.durationMs}ms`);

      // Cache result
      if (this.config.cacheResults) {
        this.cacheResult(screenshotPath, searchCriteria, result);
      }

      return result;
    }

    throw new Error(`Unsupported vision provider: ${this.config.provider}`);
  }

  private getCachedResult(
    screenshotPath: string,
    searchCriteria: ElementSearchCriteria
  ): VisionFallbackResult | null {
    const cacheKey = this.generateCacheKey(screenshotPath, searchCriteria);
    const cached = this.resultCache.get(cacheKey);

    if (!cached) {
      return null;
    }

    // Check if cache is still valid
    const now = this.timer.now();
    const ageMinutes = (now - cached.timestamp) / (1000 * 60);

    if (ageMinutes > this.config.cacheTtlMinutes) {
      this.resultCache.delete(cacheKey);
      return null;
    }

    return cached.result;
  }

  private cacheResult(
    screenshotPath: string,
    searchCriteria: ElementSearchCriteria,
    result: VisionFallbackResult
  ): void {
    const cacheKey = this.generateCacheKey(screenshotPath, searchCriteria);
    this.resultCache.set(cacheKey, {
      result,
      timestamp: this.timer.now(),
    });
  }

  private generateCacheKey(
    screenshotPath: string,
    searchCriteria: ElementSearchCriteria
  ): string {
    const criteriaStr = JSON.stringify(searchCriteria);
    return `${screenshotPath}:${criteriaStr}`;
  }

  /**
   * Clear all cached results
   */
  clearCache(): void {
    this.resultCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.resultCache.size,
      keys: Array.from(this.resultCache.keys()),
    };
  }
}

/**
 * Default vision fallback configuration
 */
export const DEFAULT_VISION_CONFIG: VisionFallbackConfig = {
  enabled: false, // Disabled by default
  provider: "claude",
  confidenceThreshold: "high",
  maxCostUsd: 1.0, // $1 max per call (very conservative)
  cacheResults: true,
  cacheTtlMinutes: 60,
};
