import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { TapOnElement } from "../../../src/features/action/TapOnElement";
import { FakeScreenshotCapturer } from "../../fakes/FakeScreenshotCapturer";
import { FakeVisionAnalyzer } from "../../fakes/FakeVisionAnalyzer";
import { FakeAccessibilityService } from "../../fakes/FakeAccessibilityService";
import type { VisionFallbackConfig } from "../../../src/vision/VisionTypes";
import { AccessibilityServiceClient } from "../../../src/features/observe/android";
import { FakeTimer } from "../../fakes/FakeTimer";
import type { ObserveResult, TapOnElementOptions } from "../../../src/models";
import { SelectionStateTracker } from "../../../src/features/navigation/SelectionStateTracker";
import { ActionableError } from "../../../src/models";

const enabledVisionConfig: VisionFallbackConfig = {
  enabled: true,
  provider: "claude",
  confidenceThreshold: "high",
  maxCostUsd: 1.0,
  cacheResults: false,
  cacheTtlMinutes: 60
};

const device = { name: "test-device", platform: "android", id: "emulator-5554" } as any;

const createObserveResult = (): ObserveResult => ({
  timestamp: Date.now(),
  screenSize: { width: 1080, height: 1920 },
  systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  viewHierarchy: { hierarchy: { node: [] } } as any
});

describe("TapOnElement vision fallback (handleElementNotFound)", () => {
  let getInstanceSpy: ReturnType<typeof spyOn> | null = null;
  let fakeA11yService: FakeAccessibilityService;

  beforeEach(() => {
    fakeA11yService = new FakeAccessibilityService();
    getInstanceSpy = spyOn(AccessibilityServiceClient, "getInstance").mockReturnValue(fakeA11yService as any);
  });

  afterEach(() => {
    getInstanceSpy?.mockRestore();
  });

  const createTapOnElement = (
    capturer: FakeScreenshotCapturer,
    analyzer: FakeVisionAnalyzer,
    visionConfig = enabledVisionConfig
  ) => {
    return new TapOnElement(device, null, {
      visionConfig,
      screenshotCapturer: capturer,
      visionAnalyzer: analyzer,
      timer: new FakeTimer(),
      selectionStateTracker: new SelectionStateTracker({ screenshotCapturer: capturer })
    });
  };

  test("throws enriched error with navigation steps (high confidence)", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();
    analyzer.setResult({
      found: false,
      confidence: "high",
      navigationSteps: [
        { action: "scroll", direction: "down", description: "Scroll down to see Login button" }
      ],
      costUsd: 0.002,
      durationMs: 50,
      screenshotPath: "/screenshot.png",
      provider: "claude"
    });

    const tapOn = createTapOnElement(capturer, analyzer);
    const options: TapOnElementOptions = { action: "tap", text: "Login" };
    const observeResult = createObserveResult();

    let thrown: Error | null = null;
    try {
      await (tapOn as any).handleElementNotFound(options, observeResult, true, undefined);
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).not.toBeNull();
    expect(thrown).toBeInstanceOf(ActionableError);
    expect(thrown!.message).toContain("AI suggests these steps");
    expect(thrown!.message).toContain("Scroll down to see Login button");
  });

  test("throws enriched error with alternative selectors", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();
    analyzer.setResult({
      found: false,
      confidence: "medium",
      alternativeSelectors: [
        { type: "resourceId", value: "com.app:id/login_btn", confidence: 0.85, reasoning: "Visible login button" }
      ],
      costUsd: 0.001,
      durationMs: 30,
      screenshotPath: "/screenshot.png",
      provider: "claude"
    });

    const tapOn = createTapOnElement(capturer, analyzer);
    const options: TapOnElementOptions = { action: "tap", elementId: "com.app:id/login" };
    const observeResult = createObserveResult();

    let thrown: Error | null = null;
    try {
      await (tapOn as any).handleElementNotFound(options, observeResult, true, undefined);
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).not.toBeNull();
    expect(thrown!.message).toContain("AI suggests trying");
    expect(thrown!.message).toContain("com.app:id/login_btn");
  });

  test("throws base error when vision is disabled", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();

    const tapOn = createTapOnElement(capturer, analyzer, { ...enabledVisionConfig, enabled: false });
    const options: TapOnElementOptions = { action: "tap", text: "Login" };
    const observeResult = createObserveResult();

    let thrown: Error | null = null;
    try {
      await (tapOn as any).handleElementNotFound(options, observeResult, true, undefined);
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).not.toBeNull();
    expect(thrown!.message).toBe("Element not found with provided text 'Login'");
    expect(analyzer.getCalls()).toHaveLength(0);
  });

  test("throws base error when screenshot capture fails", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths([null]);
    const analyzer = new FakeVisionAnalyzer();

    const tapOn = createTapOnElement(capturer, analyzer);
    const options: TapOnElementOptions = { action: "tap", text: "Login" };
    const observeResult = createObserveResult();

    let thrown: Error | null = null;
    try {
      await (tapOn as any).handleElementNotFound(options, observeResult, true, undefined);
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).not.toBeNull();
    expect(thrown!.message).toBe("Element not found with provided text 'Login'");
    expect(analyzer.getCalls()).toHaveLength(0);
  });

  test("throws container-not-found error (no vision) when containerFound=false", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();

    const tapOn = createTapOnElement(capturer, analyzer);
    const options: TapOnElementOptions = {
      action: "tap",
      text: "Login",
      container: { elementId: "com.app:id/container" }
    };
    const observeResult = createObserveResult();

    let thrown: Error | null = null;
    try {
      await (tapOn as any).handleElementNotFound(options, observeResult, false, undefined);
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).not.toBeNull();
    expect(thrown!.message).toContain("Container element not found");
    // Vision should not be called when container not found
    expect(analyzer.getCalls()).toHaveLength(0);
  });

  test("passes correct search criteria to vision analyzer", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();

    const tapOn = createTapOnElement(capturer, analyzer);
    const options: TapOnElementOptions = { action: "tap", text: "Submit", elementId: undefined };
    const observeResult = createObserveResult();

    try {
      await (tapOn as any).handleElementNotFound(options, observeResult, true, undefined);
    } catch { /* expected */ }

    const calls = analyzer.getCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].searchCriteria.text).toBe("Submit");
    expect(calls[0].searchCriteria.description).toContain("tapping");
    expect(calls[0].screenshotPath).toBe("/screenshot.png");
  });
});
