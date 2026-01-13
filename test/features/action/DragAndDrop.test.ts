import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { BootedDevice, ObserveResult, ViewHierarchyResult } from "../../../src/models";
import { DragAndDrop } from "../../../src/features/action/DragAndDrop";
import { AccessibilityServiceClient } from "../../../src/features/observe/AccessibilityServiceClient";
import { AndroidAccessibilityServiceManager } from "../../../src/utils/AccessibilityServiceManager";
import { FakeAccessibilityService } from "../../fakes/FakeAccessibilityService";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeWindow } from "../../fakes/FakeWindow";

describe("DragAndDrop", () => {
  const device: BootedDevice = {
    deviceId: "test-device",
    platform: "android",
    name: "Test Device"
  };

  let dragAndDrop: DragAndDrop;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeAwaitIdle: FakeAwaitIdle;
  let fakeWindow: FakeWindow;
  let fakeA11yService: FakeAccessibilityService;
  let fakeAdb: FakeAdbExecutor;
  let getInstanceSpy: ReturnType<typeof spyOn> | null = null;
  let managerSpy: ReturnType<typeof spyOn> | null = null;

  const createHierarchy = (): ViewHierarchyResult => ({
    hierarchy: {
      node: [
        {
          $: {
            "resource-id": "source-id",
            "text": "Source",
            "bounds": "[0,0][100,100]",
            "class": "android.widget.TextView"
          }
        },
        {
          $: {
            "resource-id": "target-id",
            "text": "Target",
            "bounds": "[200,200][300,300]",
            "class": "android.widget.TextView"
          }
        }
      ]
    },
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
    fakeAwaitIdle = new FakeAwaitIdle();
    fakeWindow = new FakeWindow();
    fakeA11yService = new FakeAccessibilityService();
    fakeAdb = new FakeAdbExecutor();

    fakeObserveScreen.setObserveResult(() => createObserveResult());
    fakeWindow.setCachedActiveWindow(null);
    fakeWindow.setActiveWindow({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });

    managerSpy = spyOn(AndroidAccessibilityServiceManager, "getInstance").mockReturnValue({
      isAvailable: async () => true
    } as any);
    getInstanceSpy = spyOn(AccessibilityServiceClient, "getInstance").mockReturnValue(fakeA11yService as any);

    dragAndDrop = new DragAndDrop(device);
    (dragAndDrop as any).observeScreen = fakeObserveScreen;
    (dragAndDrop as any).awaitIdle = fakeAwaitIdle;
    (dragAndDrop as any).window = fakeWindow;
    (dragAndDrop as any).adb = fakeAdb;
  });

  afterEach(() => {
    getInstanceSpy?.mockRestore();
    managerSpy?.mockRestore();
  });

  test("uses accessibility service drag between resolved elements", async () => {
    fakeA11yService.setDragResult({
      success: true,
      totalTimeMs: 750,
      gestureTimeMs: 500
    });

    const result = await dragAndDrop.execute({
      source: { elementId: "source-id" },
      target: { elementId: "target-id" },
      pressDurationMs: 600,
      dragDurationMs: 500,
      holdDurationMs: 200
    });

    expect(result.success).toBe(true);
    expect(result.duration).toBe(500);
    expect(result.distance).toBeCloseTo(Math.hypot(200, 200));
    expect(result.a11yTotalTimeMs).toBe(750);
    expect(result.a11yGestureTimeMs).toBe(500);

    const [dragCall] = fakeA11yService.getDragHistory();
    expect(dragCall).toBeDefined();
    expect(dragCall.x1).toBe(50);
    expect(dragCall.y1).toBe(50);
    expect(dragCall.x2).toBe(250);
    expect(dragCall.y2).toBe(250);
  });

  test("returns error when accessibility service reports failure", async () => {
    fakeA11yService.setDragResult({
      success: false,
      totalTimeMs: 300,
      error: "Drag gesture rejected"
    });

    const result = await dragAndDrop.execute({
      source: { elementId: "source-id" },
      target: { elementId: "target-id" }
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Drag gesture rejected");
  });

  test("surfaces thrown errors from accessibility service", async () => {
    fakeA11yService.setFailureMode("drag", new Error("Accessibility service failure"));

    const result = await dragAndDrop.execute({
      source: { elementId: "source-id" },
      target: { elementId: "target-id" }
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to perform drag and drop: Accessibility service failure");
  });
});
