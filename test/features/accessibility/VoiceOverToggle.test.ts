import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { VoiceOverToggle } from "../../../src/features/accessibility/VoiceOverToggle";
import { FakeIosVoiceOverDetector } from "../../fakes/FakeIosVoiceOverDetector";
import { FakeProcessExecutor } from "../../fakes/FakeProcessExecutor";
import { FakeIOSCtrlProxy } from "../../fakes/FakeIOSCtrlProxy";
import type { BootedDevice } from "../../../src/models";

const SIMULATOR_DEVICE: BootedDevice = {
  deviceId: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
  name: "iPhone 15 Pro",
  platform: "ios"
};

const PHYSICAL_DEVICE: BootedDevice = {
  deviceId: "00008130-001234567890abcd",
  name: "iPhone 15 Pro",
  platform: "ios"
};

describe("VoiceOverToggle", () => {
  let fakeDetector: FakeIosVoiceOverDetector;
  let fakeExec: FakeProcessExecutor;
  let fakeCtrlProxy: FakeIOSCtrlProxy;

  beforeEach(() => {
    fakeDetector = new FakeIosVoiceOverDetector();
    fakeExec = new FakeProcessExecutor();
    fakeCtrlProxy = new FakeIOSCtrlProxy();
  });

  afterEach(() => {
    fakeDetector.reset();
    fakeCtrlProxy.clearHistory();
  });

  describe("physical device", () => {
    test("returns supported:false for physical device UDID", async () => {
      const toggle = new VoiceOverToggle(PHYSICAL_DEVICE, fakeDetector, fakeCtrlProxy, fakeExec);
      const result = await toggle.toggle(true);

      expect(result.supported).toBe(false);
      expect(result.applied).toBe(false);
      expect(result.reason).toBeDefined();
    });

    test("does not run any process commands for physical device", async () => {
      const toggle = new VoiceOverToggle(PHYSICAL_DEVICE, fakeDetector, fakeCtrlProxy, fakeExec);
      await toggle.toggle(true);

      expect(fakeExec.getExecutedCommands()).toHaveLength(0);
    });
  });

  describe("enable VoiceOver on simulator", () => {
    test("returns supported:true applied:true when VoiceOver is currently disabled", async () => {
      fakeDetector.setVoiceOverEnabled(false);

      const toggle = new VoiceOverToggle(SIMULATOR_DEVICE, fakeDetector, fakeCtrlProxy, fakeExec);
      const result = await toggle.toggle(true);

      expect(result.supported).toBe(true);
      expect(result.applied).toBe(true);
      expect(result.currentState).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test("runs correct xcrun simctl spawn commands when enabling", async () => {
      fakeDetector.setVoiceOverEnabled(false);
      const udid = SIMULATOR_DEVICE.deviceId;

      const toggle = new VoiceOverToggle(SIMULATOR_DEVICE, fakeDetector, fakeCtrlProxy, fakeExec);
      await toggle.toggle(true);

      expect(
        fakeExec.wasCommandExecuted(
          `xcrun simctl spawn ${udid} defaults write com.apple.Accessibility VoiceOverTouchEnabled -bool YES`
        )
      ).toBe(true);
      expect(
        fakeExec.wasCommandExecuted(
          `xcrun simctl spawn ${udid} notifyutil -p com.apple.accessibility.VoiceOverStatusDidChange`
        )
      ).toBe(true);
    });

    test("is idempotent when VoiceOver is already enabled", async () => {
      fakeDetector.setVoiceOverEnabled(true);

      const toggle = new VoiceOverToggle(SIMULATOR_DEVICE, fakeDetector, fakeCtrlProxy, fakeExec);
      const result = await toggle.toggle(true);

      expect(result.supported).toBe(true);
      expect(result.applied).toBe(false);
      expect(result.currentState).toBe(true);
      expect(fakeExec.getExecutedCommands()).toHaveLength(0);
    });
  });

  describe("disable VoiceOver on simulator", () => {
    test("returns supported:true applied:true when VoiceOver is currently enabled", async () => {
      fakeDetector.setVoiceOverEnabled(true);

      const toggle = new VoiceOverToggle(SIMULATOR_DEVICE, fakeDetector, fakeCtrlProxy, fakeExec);
      const result = await toggle.toggle(false);

      expect(result.supported).toBe(true);
      expect(result.applied).toBe(true);
      expect(result.currentState).toBe(false);
    });

    test("runs correct xcrun simctl spawn commands when disabling", async () => {
      fakeDetector.setVoiceOverEnabled(true);
      const udid = SIMULATOR_DEVICE.deviceId;

      const toggle = new VoiceOverToggle(SIMULATOR_DEVICE, fakeDetector, fakeCtrlProxy, fakeExec);
      await toggle.toggle(false);

      expect(
        fakeExec.wasCommandExecuted(
          `xcrun simctl spawn ${udid} defaults write com.apple.Accessibility VoiceOverTouchEnabled -bool NO`
        )
      ).toBe(true);
      expect(
        fakeExec.wasCommandExecuted(
          `xcrun simctl spawn ${udid} notifyutil -p com.apple.accessibility.VoiceOverStatusDidChange`
        )
      ).toBe(true);
    });

    test("is idempotent when VoiceOver is already disabled", async () => {
      fakeDetector.setVoiceOverEnabled(false);

      const toggle = new VoiceOverToggle(SIMULATOR_DEVICE, fakeDetector, fakeCtrlProxy, fakeExec);
      const result = await toggle.toggle(false);

      expect(result.supported).toBe(true);
      expect(result.applied).toBe(false);
      expect(result.currentState).toBe(false);
      expect(fakeExec.getExecutedCommands()).toHaveLength(0);
    });
  });

  describe("cache invalidation", () => {
    test("invalidates cache before idempotency check", async () => {
      fakeDetector.setVoiceOverEnabled(false);

      const toggle = new VoiceOverToggle(SIMULATOR_DEVICE, fakeDetector, fakeCtrlProxy, fakeExec);
      await toggle.toggle(true);

      const invalidated = fakeDetector.getInvalidatedDevices();
      expect(invalidated.length).toBeGreaterThanOrEqual(1);
      expect(invalidated[0]).toBe(SIMULATOR_DEVICE.deviceId);
    });

    test("invalidates cache again after applying the toggle", async () => {
      fakeDetector.setVoiceOverEnabled(false);

      const toggle = new VoiceOverToggle(SIMULATOR_DEVICE, fakeDetector, fakeCtrlProxy, fakeExec);
      await toggle.toggle(true);

      // Before check + after apply = at least 2 invalidations
      expect(fakeDetector.getInvalidatedDevices().length).toBeGreaterThanOrEqual(2);
    });

    test("does not invalidate after apply when idempotent (no change needed)", async () => {
      fakeDetector.setVoiceOverEnabled(true);

      const toggle = new VoiceOverToggle(SIMULATOR_DEVICE, fakeDetector, fakeCtrlProxy, fakeExec);
      await toggle.toggle(true);

      // Only one invalidation before the check; no second one since no apply happened
      expect(fakeDetector.getInvalidatedDevices().length).toBe(1);
    });
  });
});
