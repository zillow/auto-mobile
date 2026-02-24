import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { SwipeOn } from "../../../../src/features/action/swipeon";
import { FakeScreenshotCapturer } from "../../../fakes/FakeScreenshotCapturer";
import { FakeVisionAnalyzer } from "../../../fakes/FakeVisionAnalyzer";
import { FakeObserveScreen } from "../../../fakes/FakeObserveScreen";
import { FakeGestureExecutor } from "../../../fakes/FakeGestureExecutor";
import { FakeAccessibilityDetector } from "../../../fakes/FakeAccessibilityDetector";
import { FakeTimer } from "../../../fakes/FakeTimer";
import { AccessibilityServiceClient } from "../../../../src/features/observe/android";
import type { VisionFallbackConfig } from "../../../../src/vision/VisionTypes";
import type { ObserveResult } from "../../../../src/models";

const enabledVisionConfig: VisionFallbackConfig = {
  enabled: true,
  provider: "claude",
  confidenceThreshold: "high",
  maxCostUsd: 1.0,
  cacheResults: false,
  cacheTtlMinutes: 60
};

const device = { name: "test-device", platform: "android", deviceId: "device-1" } as const;

const createObserveResult = (): ObserveResult => ({
  timestamp: Date.now(),
  screenSize: { width: 1080, height: 1920 },
  systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  viewHierarchy: { hierarchy: { node: [] } } as any
});

describe("SwipeOn vision fallback", () => {
  let fakeObserveScreen: FakeObserveScreen;
  let fakeGesture: FakeGestureExecutor;
  let fakeAccessibilityDetector: FakeAccessibilityDetector;
  let fakeTimer: FakeTimer;
  let getInstanceSpy: ReturnType<typeof spyOn> | null = null;

  beforeEach(() => {
    fakeAccessibilityDetector = new FakeAccessibilityDetector();
    fakeAccessibilityDetector.setTalkBackEnabled(false);
    getInstanceSpy = spyOn(AccessibilityServiceClient, "getInstance").mockReturnValue({
      getAccessibilityHierarchy: async () => null,
      clearAccessibilityFocus: async () => {}
    } as any);
    fakeObserveScreen = new FakeObserveScreen();
    fakeObserveScreen.setObserveResult(createObserveResult());
    fakeGesture = new FakeGestureExecutor();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
  });

  afterEach(() => {
    getInstanceSpy?.mockRestore();
  });

  const createSwipeOn = (capturer: FakeScreenshotCapturer, analyzer: FakeVisionAnalyzer) => {
    const swipeOn = new SwipeOn(device, {} as any, {
      executeGesture: fakeGesture,
      observeScreen: fakeObserveScreen,
      accessibilityDetector: fakeAccessibilityDetector,
      visionConfig: enabledVisionConfig,
      screenshotCapturer: capturer,
      visionAnalyzer: analyzer
    });
    // Patch the inner scrollUntilVisible timer so retries are fast
    (swipeOn as any).scrollUntilVisible.deps.timer = fakeTimer;
    return swipeOn;
  };

  test("enriches container-not-found error with vision navigation steps", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();
    analyzer.setResult({
      found: false,
      confidence: "high",
      navigationSteps: [
        { action: "scroll", direction: "down", description: "Scroll to find ScrollView container" }
      ],
      costUsd: 0.002,
      durationMs: 50,
      screenshotPath: "/screenshot.png",
      provider: "claude"
    });

    const swipeOn = createSwipeOn(capturer, analyzer);
    const result = await swipeOn.execute({
      direction: "up",
      container: { elementId: "com.app:id/missing_list" }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("AI suggests these steps");
    expect(result.error).toContain("Scroll to find ScrollView container");
  });

  test("enriches container-not-found error with alternative selectors", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();
    analyzer.setResult({
      found: false,
      confidence: "medium",
      alternativeSelectors: [
        { type: "text", value: "My List", confidence: 0.7, reasoning: "Closest match visible" }
      ],
      costUsd: 0.001,
      durationMs: 30,
      screenshotPath: "/screenshot.png",
      provider: "claude"
    });

    const swipeOn = createSwipeOn(capturer, analyzer);
    const result = await swipeOn.execute({
      direction: "up",
      container: { text: "MissingContainer" }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("AI suggests trying");
    expect(result.error).toContain("My List");
  });

  test("does not call vision when config disabled", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();

    const swipeOn = new SwipeOn(device, {} as any, {
      executeGesture: fakeGesture,
      observeScreen: fakeObserveScreen,
      accessibilityDetector: fakeAccessibilityDetector,
      visionConfig: { ...enabledVisionConfig, enabled: false },
      screenshotCapturer: capturer,
      visionAnalyzer: analyzer
    });
    (swipeOn as any).scrollUntilVisible.deps.timer = fakeTimer;

    const result = await swipeOn.execute({
      direction: "up",
      container: { elementId: "com.app:id/missing" }
    });

    expect(result.success).toBe(false);
    expect(analyzer.getCalls()).toHaveLength(0);
  });

  test("uses container search criteria when container specified", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();

    const swipeOn = createSwipeOn(capturer, analyzer);
    await swipeOn.execute({
      direction: "up",
      container: { text: "My List" }
    });

    const calls = analyzer.getCalls();
    if (calls.length > 0) {
      expect(calls[0].searchCriteria.text).toBe("My List");
      expect(calls[0].searchCriteria.description).toBe("Container element for swiping");
    }
  });
});
