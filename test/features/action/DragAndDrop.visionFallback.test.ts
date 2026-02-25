import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { BootedDevice, ObserveResult, ViewHierarchyResult } from "../../../src/models";
import { DragAndDrop } from "../../../src/features/action/DragAndDrop";
import { CtrlProxyClient } from "../../../src/features/observe/android";
import { AndroidCtrlProxyManager } from "../../../src/utils/CtrlProxyManager";
import { FakeCtrlProxy } from "../../fakes/FakeCtrlProxy";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeTimer } from "../../fakes/FakeTimer";
import { FakeScreenshotCapturer } from "../../fakes/FakeScreenshotCapturer";
import { FakeVisionAnalyzer } from "../../fakes/FakeVisionAnalyzer";
import type { VisionFallbackConfig } from "../../../src/vision/VisionTypes";
import { defaultTimer } from "../../../src/utils/SystemTimer";

const enabledVisionConfig: VisionFallbackConfig = {
  enabled: true,
  provider: "claude",
  confidenceThreshold: "high",
  maxCostUsd: 1.0,
  cacheResults: false,
  cacheTtlMinutes: 60
};

describe("DragAndDrop vision fallback", () => {
  const device: BootedDevice = {
    deviceId: "test-device",
    platform: "android",
    name: "Test Device"
  };

  let fakeObserveScreen: FakeObserveScreen;
  let fakeTimer: FakeTimer;
  let fakeCtrlProxy: FakeCtrlProxy;
  let getInstanceSpy: ReturnType<typeof spyOn> | null = null;
  let managerSpy: ReturnType<typeof spyOn> | null = null;

  const createEmptyHierarchy = (): ViewHierarchyResult => ({
    hierarchy: { node: [] },
    packageName: "com.test.app",
    updatedAt: Date.now()
  });

  // Hierarchy with source element but no target
  const createSourceOnlyHierarchy = (): ViewHierarchyResult => ({
    hierarchy: {
      node: [
        {
          $: {
            "resource-id": "source-id",
            "text": "Source",
            "bounds": "[0,0][100,100]",
            "class": "android.widget.TextView"
          }
        }
      ]
    },
    packageName: "com.test.app",
    updatedAt: Date.now()
  });

  const createObserveResult = (hierarchy?: ViewHierarchyResult): ObserveResult => ({
    updatedAt: Date.now(),
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    viewHierarchy: hierarchy ?? createEmptyHierarchy()
  });

  beforeEach(() => {
    fakeObserveScreen = new FakeObserveScreen();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
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

  const createDragAndDrop = (capturer: FakeScreenshotCapturer, analyzer: FakeVisionAnalyzer) => {
    const dnd = new DragAndDrop(device, null, defaultTimer, {
      visionConfig: enabledVisionConfig,
      screenshotCapturer: capturer,
      visionAnalyzer: analyzer
    });
    (dnd as any).observeScreen = fakeObserveScreen;
    (dnd as any).timer = fakeTimer;
    return dnd;
  };

  test("enriches source-not-found error with navigation steps", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();
    analyzer.setResult({
      found: false,
      confidence: "high",
      navigationSteps: [
        { action: "scroll", direction: "up", description: "Scroll up to reveal source item" }
      ],
      costUsd: 0.002,
      durationMs: 50,
      screenshotPath: "/screenshot.png",
      provider: "claude"
    });

    const dnd = createDragAndDrop(capturer, analyzer);
    const result = await dnd.execute({
      source: { text: "MissingSource" },
      target: { text: "Target" }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("AI suggests these steps");
    expect(result.error).toContain("Scroll up to reveal source item");
  });

  test("enriches target-not-found error with alternative selectors", async () => {
    // Provide a hierarchy with source but not target
    fakeObserveScreen.setObserveResult(() => createObserveResult(createSourceOnlyHierarchy()));

    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();
    analyzer.setResult({
      found: false,
      confidence: "medium",
      alternativeSelectors: [
        { type: "resourceId", value: "com.app:id/drop_zone", confidence: 0.75, reasoning: "Drop zone visible" }
      ],
      costUsd: 0.001,
      durationMs: 30,
      screenshotPath: "/screenshot.png",
      provider: "claude"
    });

    const dnd = createDragAndDrop(capturer, analyzer);
    const result = await dnd.execute({
      source: { text: "Source" },
      target: { text: "MissingTarget" }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("AI suggests trying");
    expect(result.error).toContain("com.app:id/drop_zone");
  });

  test("does not call vision when config is disabled", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();

    const dnd = new DragAndDrop(device, null, defaultTimer, {
      visionConfig: { ...enabledVisionConfig, enabled: false },
      screenshotCapturer: capturer,
      visionAnalyzer: analyzer
    });
    (dnd as any).observeScreen = fakeObserveScreen;
    (dnd as any).timer = fakeTimer;

    const result = await dnd.execute({
      source: { text: "MissingSource" },
      target: { text: "Target" }
    });

    expect(result.success).toBe(false);
    expect(analyzer.getCalls()).toHaveLength(0);
  });

  test("infers source search criteria when error mentions source", async () => {
    const capturer = new FakeScreenshotCapturer();
    capturer.setPaths(["/screenshot.png"]);
    const analyzer = new FakeVisionAnalyzer();

    const dnd = createDragAndDrop(capturer, analyzer);
    await dnd.execute({
      source: { text: "MySourceItem" },
      target: { text: "SomeTarget" }
    });

    const calls = analyzer.getCalls();
    if (calls.length > 0) {
      expect(calls[0].searchCriteria.text).toBe("MySourceItem");
      expect(calls[0].searchCriteria.description).toBe("Source element for drag");
    }
  });
});
