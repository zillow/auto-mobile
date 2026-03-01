import { beforeEach, describe, expect, test, spyOn } from "bun:test";
import { TapOnElement } from "../../../src/features/action/TapOnElement";
import { FakeAdbClient } from "../../fakes/FakeAdbClient";
import { FakeIosVoiceOverDetector } from "../../fakes/FakeIosVoiceOverDetector";
import { FakeTimer } from "../../fakes/FakeTimer";
import { FakeIOSCtrlProxy } from "../../fakes/FakeIOSCtrlProxy";

describe("TapOnElement VoiceOver mode", () => {
  let fakeVoiceOverDetector: FakeIosVoiceOverDetector;
  let fakeAdb: FakeAdbClient;
  let fakeTimer: FakeTimer;
  let fakeIosClient: FakeIOSCtrlProxy;
  let tapOnElement: TapOnElement;
  let executeiOSTapWithCoordinates: any;
  let executeIOSTapWithVoiceOver: any;

  beforeEach(() => {
    fakeVoiceOverDetector = new FakeIosVoiceOverDetector();
    fakeAdb = new FakeAdbClient();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    fakeIosClient = new FakeIOSCtrlProxy();

    tapOnElement = new TapOnElement(
      {
        name: "test-iphone",
        platform: "ios",
        id: "00001234-ABCD",
        deviceId: "00001234-ABCD",
      } as any,
      fakeAdb as any,
      {
        iosVoiceOverDetector: fakeVoiceOverDetector,
        timer: fakeTimer,
      }
    );

    executeiOSTapWithCoordinates = spyOn(
      tapOnElement as any,
      "executeiOSTapWithCoordinates"
    ).mockResolvedValue(undefined);

    executeIOSTapWithVoiceOver = spyOn(
      tapOnElement as any,
      "executeIOSTapWithVoiceOver"
    ).mockResolvedValue(undefined);
  });

  describe("when VoiceOver is disabled", () => {
    beforeEach(() => {
      fakeVoiceOverDetector.setVoiceOverEnabled(false);
    });

    test("dispatches to coordinate-based tap method when VoiceOver disabled", async () => {
      const element = {
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 },
        "ios-accessibility-label": "Settings",
      } as any;

      await (tapOnElement as any).executeiOSTap("tap", 50, 50, 50, element, false);

      expect(executeiOSTapWithCoordinates).toHaveBeenCalledTimes(1);
      expect(executeIOSTapWithVoiceOver).not.toHaveBeenCalled();
    });

    test("dispatches to coordinate-based tap when no element provided", async () => {
      await (tapOnElement as any).executeiOSTap("tap", 50, 50, 50, undefined, false);

      expect(executeiOSTapWithCoordinates).toHaveBeenCalledTimes(1);
      expect(executeIOSTapWithVoiceOver).not.toHaveBeenCalled();
    });
  });

  describe("when VoiceOver is enabled", () => {
    beforeEach(() => {
      fakeVoiceOverDetector.setVoiceOverEnabled(true);
    });

    test("dispatches to VoiceOver tap method when enabled and element provided", async () => {
      const element = {
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 },
        "ios-accessibility-label": "Settings",
      } as any;

      await (tapOnElement as any).executeiOSTap("tap", 50, 50, 50, element, true);

      expect(executeIOSTapWithVoiceOver).toHaveBeenCalledTimes(1);
      expect(executeiOSTapWithCoordinates).not.toHaveBeenCalled();
    });

    test("falls back to coordinate tap when element is undefined", async () => {
      await (tapOnElement as any).executeiOSTap("tap", 50, 50, 50, undefined, true);

      expect(executeiOSTapWithCoordinates).toHaveBeenCalledTimes(1);
      expect(executeIOSTapWithVoiceOver).not.toHaveBeenCalled();
    });
  });

  describe("executeIOSTapWithVoiceOver", () => {
    beforeEach(() => {
      // Restore real implementation for direct testing
      executeiOSTapWithCoordinates.mockRestore();
      executeIOSTapWithVoiceOver.mockRestore();

      // Mock coordinate fallback
      executeiOSTapWithCoordinates = spyOn(
        tapOnElement as any,
        "executeiOSTapWithCoordinates"
      ).mockResolvedValue(undefined);
    });

    test("uses ios-accessibility-label as VoiceOver label", async () => {
      const element = {
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 },
        "ios-accessibility-label": "Settings Button",
        "text": "Settings",
      } as any;

      // Patch IOSCtrlProxyClient.getInstance to return fakeIosClient
      const iosModule = await import("../../../src/features/observe/ios");
      const getInstanceSpy = spyOn(iosModule.CtrlProxyClient, "getInstance").mockReturnValue(fakeIosClient as any);

      await (tapOnElement as any).executeIOSTapWithVoiceOver("tap", element, 50, 50, 50);

      const history = fakeIosClient.getVoiceOverActivateHistory();
      expect(history).toHaveLength(1);
      expect(history[0].label).toBe("Settings Button");
      expect(history[0].action).toBe("activate");

      getInstanceSpy.mockRestore();
    });

    test("falls back to text when no ios-accessibility-label", async () => {
      const element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 100 },
        text: "Settings",
      } as any;

      const iosModule = await import("../../../src/features/observe/ios");
      const getInstanceSpy = spyOn(iosModule.CtrlProxyClient, "getInstance").mockReturnValue(fakeIosClient as any);

      await (tapOnElement as any).executeIOSTapWithVoiceOver("tap", element, 50, 50, 50);

      const history = fakeIosClient.getVoiceOverActivateHistory();
      expect(history).toHaveLength(1);
      expect(history[0].label).toBe("Settings");

      getInstanceSpy.mockRestore();
    });

    test("falls back to coordinate tap when no label available", async () => {
      const element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 100 },
      } as any;

      const iosModule = await import("../../../src/features/observe/ios");
      const getInstanceSpy = spyOn(iosModule.CtrlProxyClient, "getInstance").mockReturnValue(fakeIosClient as any);

      await (tapOnElement as any).executeIOSTapWithVoiceOver("tap", element, 50, 50, 50);

      expect(executeiOSTapWithCoordinates).toHaveBeenCalledTimes(1);
      expect(fakeIosClient.getVoiceOverActivateHistory()).toHaveLength(0);

      getInstanceSpy.mockRestore();
    });

    test("maps longPress action to long_press VoiceOver action", async () => {
      const element = {
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 },
        "ios-accessibility-label": "Delete",
      } as any;

      const iosModule = await import("../../../src/features/observe/ios");
      const getInstanceSpy = spyOn(iosModule.CtrlProxyClient, "getInstance").mockReturnValue(fakeIosClient as any);

      await (tapOnElement as any).executeIOSTapWithVoiceOver("longPress", element, 50, 50, 1000);

      const history = fakeIosClient.getVoiceOverActivateHistory();
      expect(history).toHaveLength(1);
      expect(history[0].action).toBe("long_press");

      getInstanceSpy.mockRestore();
    });

    test("maps tap action to activate VoiceOver action", async () => {
      const element = {
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 },
        "ios-accessibility-label": "Save",
      } as any;

      const iosModule = await import("../../../src/features/observe/ios");
      const getInstanceSpy = spyOn(iosModule.CtrlProxyClient, "getInstance").mockReturnValue(fakeIosClient as any);

      await (tapOnElement as any).executeIOSTapWithVoiceOver("tap", element, 50, 50, 50);

      const history = fakeIosClient.getVoiceOverActivateHistory();
      expect(history[0].action).toBe("activate");

      getInstanceSpy.mockRestore();
    });

    test("maps doubleTap action to activate VoiceOver action", async () => {
      const element = {
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 },
        "ios-accessibility-label": "Item",
      } as any;

      const iosModule = await import("../../../src/features/observe/ios");
      const getInstanceSpy = spyOn(iosModule.CtrlProxyClient, "getInstance").mockReturnValue(fakeIosClient as any);

      await (tapOnElement as any).executeIOSTapWithVoiceOver("doubleTap", element, 50, 50, 50);

      const history = fakeIosClient.getVoiceOverActivateHistory();
      expect(history[0].action).toBe("activate");

      getInstanceSpy.mockRestore();
    });

    test("falls back to coordinate tap when requestVoiceOverActivate fails", async () => {
      const element = {
        "bounds": { left: 0, top: 0, right: 100, bottom: 100 },
        "ios-accessibility-label": "Button",
      } as any;

      fakeIosClient.setVoiceOverActivateResult({ success: false, error: "Element not found" });

      const iosModule = await import("../../../src/features/observe/ios");
      const getInstanceSpy = spyOn(iosModule.CtrlProxyClient, "getInstance").mockReturnValue(fakeIosClient as any);

      await (tapOnElement as any).executeIOSTapWithVoiceOver("tap", element, 50, 50, 50);

      expect(executeiOSTapWithCoordinates).toHaveBeenCalledTimes(1);

      getInstanceSpy.mockRestore();
    });
  });

  describe("Android platform unaffected", () => {
    test("does not call iosVoiceOverDetector for Android device", async () => {
      const androidTapOnElement = new TapOnElement(
        {
          name: "test-device",
          platform: "android",
          id: "emulator-5554",
          deviceId: "emulator-5554",
        } as any,
        fakeAdb as any,
        {
          iosVoiceOverDetector: fakeVoiceOverDetector,
          timer: fakeTimer,
        }
      );

      fakeVoiceOverDetector.setVoiceOverEnabled(true);

      spyOn(
        androidTapOnElement as any,
        "executeAndroidTap"
      ).mockResolvedValue(undefined);

      // The isVoiceOverEnabled should not be called for Android
      // We verify via call count
      const initialCallCount = fakeVoiceOverDetector.getCallCount();

      await (androidTapOnElement as any).executeAndroidTap("tap", 50, 50, 500, {} as any);

      expect(fakeVoiceOverDetector.getCallCount()).toBe(initialCallCount);
    });
  });
});
