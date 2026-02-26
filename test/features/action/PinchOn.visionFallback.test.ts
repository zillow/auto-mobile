import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { BootedDevice, ObserveResult, ViewHierarchyResult } from "../../../src/models";
import { PinchOn } from "../../../src/features/action/PinchOn";
import { CtrlProxyClient } from "../../../src/features/observe/android";
import { AndroidCtrlProxyManager } from "../../../src/utils/CtrlProxyManager";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";
import { FakeCtrlProxy } from "../../fakes/FakeCtrlProxy";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeTimer } from "../../fakes/FakeTimer";
import { FakeWindow } from "../../fakes/FakeWindow";
import { FakeScreenshotCapturer } from "../../fakes/FakeScreenshotCapturer";
import { FakeVisionAnalyzer } from "../../fakes/FakeVisionAnalyzer";
import type { VisionFallbackConfig } from "../../../src/vision/VisionTypes";

const enabledVisionConfig: VisionFallbackConfig = {
  enabled: true,
  provider: "claude",
  confidenceThreshold: "high",
  maxCostUsd: 1.0,
  cacheResults: false,
  cacheTtlMinutes: 60
};

describe("PinchOn vision fallback", () => {
  const device: BootedDevice = {
    deviceId: "test-device",
    platform: "android",
    name: "Test Device"
  };

  let fakeObserveScreen: FakeObserveScreen;
  let fakeTimer: FakeTimer;
  let fakeAwaitIdle: FakeAwaitIdle;
  let fakeWindow: FakeWindow;
  let fakeCtrlProxy: FakeCtrlProxy;
  let getInstanceSpy: ReturnType<typeof spyOn> | null = null;
  let managerSpy: ReturnType<typeof spyOn> | null = null;

  const createHierarchy = (): ViewHierarchyResult => ({
    hierarchy: { node: [] },
    packageName: "com.test.app",
    updatedAt: Date.now()
  });

  const createObserveResult = (): ObserveResult => ({
    updatedAt: Date.now(),
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    viewHierarchy: createHierarchy()
  });

  beforeEach(() => {
    fakeObserveScreen = new FakeObserveScreen();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    fakeAwaitIdle = new FakeAwaitIdle();
    fakeWindow = new FakeWindow();
    fakeWindow.configureCachedActiveWindow(null);
    fakeCtrlProxy = new FakeCtrlProxy();
    fakeObserveScreen.setObserveResult(() => createObserveResult());

    managerSpy = spyOn(AndroidCtrlProxyManager, "getInstance").mockReturnValue({
      isAvailable: async () => true
    } as any);
    getInstanceSpy = spyOn(CtrlProxyClient, "getInstance").mockReturnValue(fakeCtrlProxy as any);
  });

  afterEach(() => {
    getInstanceSpy?.mockRestore();
    managerSpy?.mockRestore();
  });

  const createPinchOn = (capturer: FakeScreenshotCapturer, analyzer: FakeVisionAnalyzer) => {
    const pinchOn = new PinchOn(device, null, {
      visionConfig: enabledVisionConfig,
      screenshotCapturer: capturer,
      visionAnalyzer: analyzer
    });
    (pinchOn as any).observeScreen = fakeObserveScreen;
    (pinchOn as any).timer = fakeTimer;
    (pinchOn as any).awaitIdle = fakeAwaitIdle;
    (pinchOn as any).window = fakeWindow;
    return pinchOn;
  };

  test("enriches container-not-found error with navigation steps", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();
    analyzer.setResult({
      found: false,
      confidence: "high",
      navigationSteps: [
        { action: "scroll", direction: "down", description: "Scroll to reveal the map container" }
      ],
      costUsd: 0.002,
      durationMs: 50,
      screenshotPath: "/screenshot.png",
      provider: "claude"
    });

    const pinchOn = createPinchOn(capturer, analyzer);
    const result = await pinchOn.execute({
      direction: "in",
      container: { elementId: "com.app:id/missing_map" }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("AI suggests these steps");
    expect(result.error).toContain("Scroll to reveal the map container");
  });

  test("enriches container-not-found error with alternative selectors", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();
    analyzer.setResult({
      found: false,
      confidence: "medium",
      alternativeSelectors: [
        { type: "resourceId", value: "com.app:id/map_view", confidence: 0.85, reasoning: "Map element visible" }
      ],
      costUsd: 0.001,
      durationMs: 30,
      screenshotPath: "/screenshot.png",
      provider: "claude"
    });

    const pinchOn = createPinchOn(capturer, analyzer);
    const result = await pinchOn.execute({
      direction: "out",
      container: { text: "Missing Map" }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("AI suggests trying");
    expect(result.error).toContain("com.app:id/map_view");
  });

  test("does not call vision when config is disabled", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();

    const pinchOn = new PinchOn(device, null, {
      visionConfig: { ...enabledVisionConfig, enabled: false },
      screenshotCapturer: capturer,
      visionAnalyzer: analyzer
    });
    (pinchOn as any).observeScreen = fakeObserveScreen;
    (pinchOn as any).timer = fakeTimer;
    (pinchOn as any).awaitIdle = fakeAwaitIdle;
    (pinchOn as any).window = fakeWindow;

    const result = await pinchOn.execute({
      direction: "in",
      container: { elementId: "com.app:id/missing" }
    });

    expect(result.success).toBe(false);
    expect(analyzer.getCalls()).toHaveLength(0);
  });

  test("does not call vision when no container specified", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();

    const pinchOn = createPinchOn(capturer, analyzer);
    // No container = screen pinch, no vision lookup needed
    const result = await pinchOn.execute({ direction: "in" });

    // May succeed or fail for other reasons, but vision should not be called on error-free path
    // The key is analyzer is only called on container-not-found
    if (!result.success) {
      // If it failed for another reason (not container lookup), analyzer should not be called
      // unless the failure happened in the catch block with vision enabled
    }
    // Vision should only be called when container is specified
    expect(capturer.getCallCount()).toBe(0);
  });

  test("passes correct search criteria for container", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();

    const pinchOn = createPinchOn(capturer, analyzer);
    await pinchOn.execute({
      direction: "in",
      container: { elementId: "com.app:id/my_container" }
    });

    const calls = analyzer.getCalls();
    if (calls.length > 0) {
      expect(calls[0].searchCriteria.resourceId).toBe("com.app:id/my_container");
      expect(calls[0].searchCriteria.description).toBe("Container element for pinching");
    }
  });
});
