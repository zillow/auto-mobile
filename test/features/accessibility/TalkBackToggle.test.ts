import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { TalkBackToggle } from "../../../src/features/accessibility/TalkBackToggle";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeAccessibilityDetector } from "../../fakes/FakeAccessibilityDetector";
import { FakeTimer } from "../../fakes/FakeTimer";
import type { BootedDevice } from "../../../src/models";

const ANDROID_DEVICE: BootedDevice = {
  deviceId: "emulator-5554",
  name: "Pixel 7 API 35",
  platform: "android"
};

const DUMPSYS_WITH_TALKBACK = `
Installed Services:
  Service[label=TalkBack, feedbackType[spokenFeedback], targetSdkVersion=32]
    Id: com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService
`;

const DUMPSYS_WITHOUT_TALKBACK = `
Installed Services:
  (none)
`;

const DUMPSYS_WITH_TALKBACK_NO_COMPONENT = `
Installed Services:
  Service[label=TalkBack]
    Package: com.google.android.marvin.talkback
`;

const DIALOG_XML_WITH_ALLOW = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy><node index="0" text="" resource-id="android:id/content">
  <node index="0" text="Allow TalkBack to have full control?" resource-id="" />
  <node index="1" text="Allow" resource-id="android:id/button1" bounds="[180,684][540,740]" />
</hierarchy>`;

function makeExecResult(stdout: string) {
  return {
    stdout,
    stderr: "",
    toString: () => stdout,
    trim: () => stdout.trim(),
    includes: (s: string) => stdout.includes(s)
  };
}

describe("TalkBackToggle", () => {
  let fakeAdb: FakeAdbExecutor;
  let fakeDetector: FakeAccessibilityDetector;
  let fakeTimer: FakeTimer;

  beforeEach(() => {
    fakeAdb = new FakeAdbExecutor();
    fakeDetector = new FakeAccessibilityDetector();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
  });

  afterEach(() => {
    fakeAdb.clearHistory();
    fakeDetector.reset();
    fakeTimer.reset();
  });

  describe("enable TalkBack", () => {
    test("returns supported:true applied:true when TalkBack is installed and currently disabled", async () => {
      fakeAdb.setCommandResponse("dumpsys accessibility", makeExecResult(DUMPSYS_WITH_TALKBACK));
      fakeDetector.setDefaultResult(false);

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      const result = await toggle.toggle(true);

      expect(result.supported).toBe(true);
      expect(result.applied).toBe(true);
      expect(result.currentState).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test("runs the correct enable ADB commands", async () => {
      fakeAdb.setCommandResponse("dumpsys accessibility", makeExecResult(DUMPSYS_WITH_TALKBACK));
      fakeDetector.setDefaultResult(false);

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      await toggle.toggle(true);

      expect(
        fakeAdb.wasCommandExecuted(
          "shell settings put secure enabled_accessibility_services com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService"
        )
      ).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell settings put secure accessibility_enabled 1")).toBe(
        true
      );
    });

    test("invalidates the detector cache after enabling", async () => {
      fakeAdb.setCommandResponse("dumpsys accessibility", makeExecResult(DUMPSYS_WITH_TALKBACK));
      fakeDetector.setDefaultResult(false);

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      await toggle.toggle(true);

      expect(fakeDetector.getInvalidatedDevices()).toContain(ANDROID_DEVICE.deviceId);
    });

    test("attempts dialog dismissal after enabling", async () => {
      fakeAdb.setCommandResponse("dumpsys accessibility", makeExecResult(DUMPSYS_WITH_TALKBACK));
      fakeDetector.setDefaultResult(false);

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      await toggle.toggle(true);

      expect(fakeAdb.wasCommandExecuted("shell uiautomator dump /dev/tty")).toBe(true);
    });

    test("taps Allow button when permission dialog is present", async () => {
      fakeAdb.setCommandResponse("dumpsys accessibility", makeExecResult(DUMPSYS_WITH_TALKBACK));
      fakeAdb.setCommandResponse(
        "shell uiautomator dump /dev/tty",
        makeExecResult(DIALOG_XML_WITH_ALLOW)
      );
      fakeDetector.setDefaultResult(false);

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      await toggle.toggle(true);

      // Center of [180,684][540,740] = (360, 712)
      expect(fakeAdb.wasCommandExecuted("shell input tap 360 712")).toBe(true);
    });

    test("does not tap when no permission dialog appears", async () => {
      fakeAdb.setCommandResponse("dumpsys accessibility", makeExecResult(DUMPSYS_WITH_TALKBACK));
      fakeAdb.setCommandResponse(
        "shell uiautomator dump /dev/tty",
        makeExecResult("<hierarchy><node text='Home' /></hierarchy>")
      );
      fakeDetector.setDefaultResult(false);

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      const result = await toggle.toggle(true);

      expect(fakeAdb.wasCommandExecuted("shell input tap")).toBe(false);
      expect(result.applied).toBe(true);
    });

    test("is idempotent when TalkBack is already enabled", async () => {
      fakeAdb.setCommandResponse("dumpsys accessibility", makeExecResult(DUMPSYS_WITH_TALKBACK));
      fakeDetector.setDefaultResult(true, "talkback");

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      const result = await toggle.toggle(true);

      expect(result.supported).toBe(true);
      expect(result.applied).toBe(false);
      expect(result.currentState).toBe(true);
      expect(fakeAdb.wasCommandExecuted("accessibility_enabled 1")).toBe(false);
    });

    test("enables TalkBack when another service is active but TalkBack is not", async () => {
      fakeAdb.setCommandResponse("dumpsys accessibility", makeExecResult(DUMPSYS_WITH_TALKBACK));
      // isAccessibilityEnabled would return true, but TalkBack specifically is not active
      fakeDetector.setDefaultResult(true, "unknown");

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      const result = await toggle.toggle(true);

      expect(result.applied).toBe(true);
      expect(fakeAdb.wasCommandExecuted("accessibility_enabled 1")).toBe(true);
    });
  });

  describe("disable TalkBack", () => {
    test("returns supported:true applied:true when TalkBack is installed and currently enabled", async () => {
      fakeAdb.setCommandResponse("dumpsys accessibility", makeExecResult(DUMPSYS_WITH_TALKBACK));
      fakeDetector.setDefaultResult(true, "talkback");

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      const result = await toggle.toggle(false);

      expect(result.supported).toBe(true);
      expect(result.applied).toBe(true);
      expect(result.currentState).toBe(false);
    });

    test("runs the correct disable ADB commands", async () => {
      fakeAdb.setCommandResponse("dumpsys accessibility", makeExecResult(DUMPSYS_WITH_TALKBACK));
      fakeDetector.setDefaultResult(true, "talkback");

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      await toggle.toggle(false);

      expect(
        fakeAdb.wasCommandExecuted("shell settings delete secure enabled_accessibility_services")
      ).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell settings put secure accessibility_enabled 0")).toBe(
        true
      );
    });

    test("does not attempt dialog dismissal when disabling", async () => {
      fakeAdb.setCommandResponse("dumpsys accessibility", makeExecResult(DUMPSYS_WITH_TALKBACK));
      fakeDetector.setDefaultResult(true, "talkback");

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      await toggle.toggle(false);

      expect(fakeAdb.wasCommandExecuted("shell uiautomator dump /dev/tty")).toBe(false);
    });

    test("invalidates the detector cache after disabling", async () => {
      fakeAdb.setCommandResponse("dumpsys accessibility", makeExecResult(DUMPSYS_WITH_TALKBACK));
      fakeDetector.setDefaultResult(true, "talkback");

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      await toggle.toggle(false);

      expect(fakeDetector.getInvalidatedDevices()).toContain(ANDROID_DEVICE.deviceId);
    });

    test("preserves other accessibility services when disabling TalkBack", async () => {
      fakeAdb.setCommandResponse("dumpsys accessibility", makeExecResult(DUMPSYS_WITH_TALKBACK));
      fakeAdb.setCommandResponse(
        "settings get secure enabled_accessibility_services",
        makeExecResult(
          "com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService:com.example.other/OtherService"
        )
      );
      fakeDetector.setDefaultResult(true, "talkback");

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      await toggle.toggle(false);

      expect(
        fakeAdb.wasCommandExecuted(
          "shell settings put secure enabled_accessibility_services com.example.other/OtherService"
        )
      ).toBe(true);
      // Should NOT delete all services or disable accessibility when others remain
      expect(
        fakeAdb.wasCommandExecuted("shell settings delete secure enabled_accessibility_services")
      ).toBe(false);
      expect(fakeAdb.wasCommandExecuted("shell settings put secure accessibility_enabled 0")).toBe(
        false
      );
    });

    test("is idempotent when TalkBack is already disabled", async () => {
      fakeAdb.setCommandResponse("dumpsys accessibility", makeExecResult(DUMPSYS_WITH_TALKBACK));
      fakeDetector.setDefaultResult(false);

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      const result = await toggle.toggle(false);

      expect(result.supported).toBe(true);
      expect(result.applied).toBe(false);
      expect(result.currentState).toBe(false);
      expect(fakeAdb.wasCommandExecuted("accessibility_enabled 0")).toBe(false);
    });
  });

  describe("TalkBack not installed", () => {
    test("returns supported:false when dumpsys contains no TalkBack entry", async () => {
      fakeAdb.setCommandResponse(
        "dumpsys accessibility",
        makeExecResult(DUMPSYS_WITHOUT_TALKBACK)
      );

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      const result = await toggle.toggle(true);

      expect(result.supported).toBe(false);
      expect(result.applied).toBe(false);
      expect(result.reason).toBeDefined();
    });

    test("does not run settings commands when TalkBack is not installed", async () => {
      fakeAdb.setCommandResponse(
        "dumpsys accessibility",
        makeExecResult(DUMPSYS_WITHOUT_TALKBACK)
      );

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      await toggle.toggle(true);

      expect(fakeAdb.wasCommandExecuted("accessibility_enabled")).toBe(false);
    });

    test("returns supported:false when dumpsys command throws", async () => {
      fakeAdb.setDefaultError(new Error("ADB connection failed"));

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      const result = await toggle.toggle(true);

      expect(result.supported).toBe(false);
      expect(result.applied).toBe(false);
    });
  });

  describe("service component name detection", () => {
    test("extracts service component from dumpsys output", async () => {
      fakeAdb.setCommandResponse("dumpsys accessibility", makeExecResult(DUMPSYS_WITH_TALKBACK));
      fakeDetector.setDefaultResult(false);

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      await toggle.toggle(true);

      expect(
        fakeAdb.wasCommandExecuted(
          "shell settings put secure enabled_accessibility_services com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService"
        )
      ).toBe(true);
    });

    test("falls back to hardcoded component when package present but component unparseable", async () => {
      fakeAdb.setCommandResponse(
        "dumpsys accessibility",
        makeExecResult(DUMPSYS_WITH_TALKBACK_NO_COMPONENT)
      );
      fakeDetector.setDefaultResult(false);

      const toggle = new TalkBackToggle(ANDROID_DEVICE, fakeAdb, fakeDetector, fakeTimer);
      await toggle.toggle(true);

      expect(
        fakeAdb.wasCommandExecuted(
          "shell settings put secure enabled_accessibility_services com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService"
        )
      ).toBe(true);
    });
  });
});
