import { describe, expect, test } from "bun:test";
import { getVisionEnrichedError } from "../../src/vision/applyVisionFallback";
import { FakeScreenshotCapturer } from "../fakes/FakeScreenshotCapturer";
import { FakeVisionAnalyzer } from "../fakes/FakeVisionAnalyzer";
import type { VisionFallbackConfig } from "../../src/vision/VisionTypes";

const enabledConfig: VisionFallbackConfig = {
  enabled: true,
  provider: "claude",
  confidenceThreshold: "high",
  maxCostUsd: 1.0,
  cacheResults: false,
  cacheTtlMinutes: 60
};

const disabledConfig: VisionFallbackConfig = {
  ...enabledConfig,
  enabled: false
};

describe("getVisionEnrichedError", () => {
  test("returns baseError when vision is disabled", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();

    const result = await getVisionEnrichedError(
      capturer,
      null,
      { text: "Login" },
      disabledConfig,
      "Element not found",
      undefined,
      analyzer
    );

    expect(result).toBe("Element not found");
    expect(analyzer.getCalls()).toHaveLength(0);
  });

  test("returns baseError when screenshot capture returns null", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths([null]);
    const analyzer = new FakeVisionAnalyzer();

    const result = await getVisionEnrichedError(
      capturer,
      null,
      { text: "Login" },
      enabledConfig,
      "Element not found",
      undefined,
      analyzer
    );

    expect(result).toBe("Element not found");
    expect(analyzer.getCalls()).toHaveLength(0);
  });

  test("returns enriched message with navigation steps when confidence is high", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();
    analyzer.setResult({
      found: false,
      confidence: "high",
      navigationSteps: [
        { action: "scroll", direction: "down", description: "Scroll down to reveal login button" },
        { action: "tap", target: "Login", description: "Tap the Login button" }
      ],
      costUsd: 0.002,
      durationMs: 100,
      screenshotPath: "/screenshot.png",
      provider: "claude"
    });

    const result = await getVisionEnrichedError(
      capturer,
      { hierarchy: {} },
      { text: "Login" },
      enabledConfig,
      "Element not found",
      undefined,
      analyzer
    );

    expect(result).toContain("AI suggests these steps");
    expect(result).toContain("1. Scroll down to reveal login button");
    expect(result).toContain("2. Tap the Login button");
    expect(result).toContain("Confidence: high");
  });

  test("returns enriched message with alternative selectors", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();
    analyzer.setResult({
      found: false,
      confidence: "medium",
      alternativeSelectors: [
        { type: "resourceId", value: "com.app:id/login_btn", confidence: 0.9, reasoning: "Visible login button" }
      ],
      costUsd: 0.001,
      durationMs: 50,
      screenshotPath: "/screenshot.png",
      provider: "claude"
    });

    const result = await getVisionEnrichedError(
      capturer,
      null,
      { text: "Login" },
      enabledConfig,
      "Element not found",
      undefined,
      analyzer
    );

    expect(result).toContain("AI suggests trying");
    expect(result).toContain("com.app:id/login_btn");
    expect(result).toContain("Visible login button");
  });

  test("appends reason and cost when no navigation steps or alternative selectors", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();
    analyzer.setResult({
      found: false,
      confidence: "low",
      reason: "Element appears to be off-screen",
      costUsd: 0.0005,
      durationMs: 30,
      screenshotPath: "/screenshot.png",
      provider: "claude"
    });

    const result = await getVisionEnrichedError(
      capturer,
      null,
      { text: "Login" },
      enabledConfig,
      "Element not found",
      undefined,
      analyzer
    );

    expect(result).toContain("Element not found");
    expect(result).toContain("Element appears to be off-screen");
    expect(result).toContain("$0.0005");
  });

  test("returns baseError when vision analyzer throws", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer: import("../../src/vision/VisionTypes").VisionAnalyzer = {
      async analyzeAndSuggest() {
        throw new Error("API error");
      }
    };

    const result = await getVisionEnrichedError(
      capturer,
      null,
      { text: "Login" },
      enabledConfig,
      "Element not found",
      undefined,
      analyzer
    );

    expect(result).toBe("Element not found");
  });

  test("passes search criteria and view hierarchy to analyzer", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/my-screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();
    const hierarchy = { root: "fake" };
    const criteria = { text: "Submit", resourceId: "com.app:id/submit", description: "Submit button" };

    await getVisionEnrichedError(
      capturer,
      hierarchy,
      criteria,
      enabledConfig,
      "base error",
      undefined,
      analyzer
    );

    const calls = analyzer.getCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].screenshotPath).toBe("/my-screenshot.png");
    expect(calls[0].hierarchy).toBe(hierarchy);
    expect(calls[0].searchCriteria).toEqual(criteria);
  });

  test("uses 'No clear path found' fallback when reason is missing", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();
    analyzer.setResult({
      found: false,
      confidence: "low",
      costUsd: 0.001,
      durationMs: 10,
      screenshotPath: "/screenshot.png",
      provider: "claude"
    });

    const result = await getVisionEnrichedError(
      capturer,
      null,
      { text: "Button" },
      enabledConfig,
      "Not found error",
      undefined,
      analyzer
    );

    expect(result).toContain("No clear path found.");
  });
});
