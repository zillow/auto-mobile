import type { VisionAnalyzer, VisionFallbackResult, ElementSearchCriteria } from "../../src/vision/VisionTypes";

export class FakeVisionAnalyzer implements VisionAnalyzer {
  private result: VisionFallbackResult = {
    found: false,
    confidence: "low",
    reason: "Not found",
    costUsd: 0.001,
    durationMs: 10,
    screenshotPath: "/fake/screenshot.png",
    provider: "claude"
  };

  setResult(result: VisionFallbackResult): void {
    this.result = result;
  }

  private calls: Array<{ screenshotPath: string; hierarchy: unknown; searchCriteria: ElementSearchCriteria }> = [];

  getCalls(): Array<{ screenshotPath: string; hierarchy: unknown; searchCriteria: ElementSearchCriteria }> {
    return this.calls;
  }

  async analyzeAndSuggest(
    screenshotPath: string,
    hierarchy: unknown,
    searchCriteria: ElementSearchCriteria
  ): Promise<VisionFallbackResult> {
    this.calls.push({ screenshotPath, hierarchy, searchCriteria });
    return this.result;
  }
}
