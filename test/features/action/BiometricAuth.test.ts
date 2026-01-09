import { expect, describe, test, beforeEach } from "bun:test";
import { BiometricAuth } from "../../../src/features/action/BiometricAuth";
import { ObserveResult, BootedDevice } from "../../../src/models";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeWindow } from "../../fakes/FakeWindow";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";

// Helper function to create mock ObserveResult
let hierarchyCounter = 0;
const createObserveResult = (): ObserveResult => ({
  timestamp: Date.now(),
  screenSize: { width: 1080, height: 1920 },
  systemInsets: { top: 48, bottom: 120, left: 0, right: 0 },
  viewHierarchy: { node: {}, id: hierarchyCounter++ }
});

describe("BiometricAuth", () => {
  let biometricAuth: BiometricAuth;
  let fakeAdb: FakeAdbExecutor;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeWindow: FakeWindow;
  let fakeAwaitIdle: FakeAwaitIdle;
  let device: BootedDevice;

  beforeEach(() => {
    // Create fakes for testing
    fakeAdb = new FakeAdbExecutor();
    fakeObserveScreen = new FakeObserveScreen();
    fakeWindow = new FakeWindow();
    fakeAwaitIdle = new FakeAwaitIdle();

    // Create a mock device
    device = {
      deviceId: "test-device",
      platform: "android"
    } as BootedDevice;

    // Set up default fake responses
    fakeWindow.setCachedActiveWindow(null);
    fakeWindow.setActiveWindow({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });
    fakeObserveScreen.setObserveResult(() => createObserveResult());

    // Set up emulator detection (device is an emulator)
    fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", { stdout: "1", stderr: "" });
    fakeAdb.setCommandResponse("emu help", { stdout: "finger - fingerprint commands\nhelp - show this help", stderr: "" });

    biometricAuth = new BiometricAuth(device, fakeAdb);

    // Replace the internal managers with our fakes
    (biometricAuth as any).observeScreen = fakeObserveScreen;
    (biometricAuth as any).window = fakeWindow;
    (biometricAuth as any).awaitIdle = fakeAwaitIdle;
  });

  describe("execute - match action", () => {
    test("should execute fingerprint match with default ID", async () => {
      fakeAdb.setCommandResponse("emu finger touch 1", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 1", { stdout: "", stderr: "" });

      const result = await biometricAuth.execute({ action: "match" });

      expect(result.success).toBe(true);
      expect(result.action).toBe("match");
      expect(result.modality).toBe("any");
      expect(result.fingerprintId).toBe(1);
      expect(result.supported).toBe(true);
      expect(result.observation).toBeDefined();

      // Verify correct commands were executed
      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd => cmd.includes("emu finger touch 1"))).toBe(true);
      expect(executedCommands.some(cmd => cmd.includes("emu finger remove 1"))).toBe(true);
    });

    test("should execute fingerprint match with custom ID", async () => {
      fakeAdb.setCommandResponse("emu finger touch 5", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 5", { stdout: "", stderr: "" });

      const result = await biometricAuth.execute({
        action: "match",
        fingerprintId: 5
      });

      expect(result.success).toBe(true);
      expect(result.fingerprintId).toBe(5);

      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd => cmd.includes("emu finger touch 5"))).toBe(true);
      expect(executedCommands.some(cmd => cmd.includes("emu finger remove 5"))).toBe(true);
    });

    test("should work with explicit fingerprint modality", async () => {
      fakeAdb.setCommandResponse("emu finger touch 1", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 1", { stdout: "", stderr: "" });

      const result = await biometricAuth.execute({
        action: "match",
        modality: "fingerprint"
      });

      expect(result.success).toBe(true);
      expect(result.modality).toBe("fingerprint");
    });
  });

  describe("execute - fail action", () => {
    test("should execute fingerprint fail with default ID", async () => {
      fakeAdb.setCommandResponse("emu finger touch 2", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 2", { stdout: "", stderr: "" });

      const result = await biometricAuth.execute({ action: "fail" });

      expect(result.success).toBe(true);
      expect(result.action).toBe("fail");
      expect(result.fingerprintId).toBe(2);
      expect(result.supported).toBe(true);

      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd => cmd.includes("emu finger touch 2"))).toBe(true);
      expect(executedCommands.some(cmd => cmd.includes("emu finger remove 2"))).toBe(true);
    });

    test("should include warning about ID differentiation", async () => {
      fakeAdb.setCommandResponse("emu finger touch 2", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 2", { stdout: "", stderr: "" });

      const result = await biometricAuth.execute({ action: "fail" });

      expect(result.success).toBe(true);
      expect(result.message).toContain("may not differentiate");
    });
  });

  describe("execute - cancel action", () => {
    test("should execute fingerprint cancel", async () => {
      fakeAdb.setCommandResponse("emu finger touch 2", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 2", { stdout: "", stderr: "" });

      const result = await biometricAuth.execute({ action: "cancel" });

      expect(result.success).toBe(true);
      expect(result.action).toBe("cancel");
      expect(result.supported).toBe(true);
    });
  });

  describe("capability detection", () => {
    test("should reject iOS platform", async () => {
      const iosDevice = { ...device, platform: "ios" as const };
      const iosBiometricAuth = new BiometricAuth(iosDevice, fakeAdb);

      const result = await iosBiometricAuth.execute({ action: "match" });

      expect(result.success).toBe(false);
      expect(result.supported).toBe(false);
      expect(result.error).toContain("only supported on Android");
    });

    test("should reject physical devices", async () => {
      // Set device as physical (not emulator)
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", { stdout: "0", stderr: "" });

      const result = await biometricAuth.execute({ action: "match" });

      expect(result.success).toBe(false);
      expect(result.supported).toBe(false);
      expect(result.error).toContain("only supported on Android emulators");
    });

    test("should reject emulators without emu finger support", async () => {
      // Device is emulator but doesn't support emu finger
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", { stdout: "1", stderr: "" });
      fakeAdb.setCommandResponse("emu help", { stdout: "help - show this help", stderr: "" });

      const result = await biometricAuth.execute({ action: "match" });

      expect(result.success).toBe(false);
      expect(result.supported).toBe(false);
      expect(result.error).toContain("does not support 'emu finger' commands");
    });
  });

  describe("modality validation", () => {
    test("should reject face modality", async () => {
      const result = await biometricAuth.execute({
        action: "match",
        modality: "face"
      });

      expect(result.success).toBe(false);
      expect(result.supported).toBe(false);
      expect(result.error).toContain("Face biometric modality is not supported");
    });

    test("should accept 'any' modality", async () => {
      fakeAdb.setCommandResponse("emu finger touch 1", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 1", { stdout: "", stderr: "" });

      const result = await biometricAuth.execute({
        action: "match",
        modality: "any"
      });

      expect(result.success).toBe(true);
      expect(result.modality).toBe("any");
    });
  });

  describe("error handling", () => {
    test("should handle emu finger command failures", async () => {
      fakeAdb.setCommandResponse("emu finger touch 1", { stdout: "", stderr: "Command failed" });
      fakeAdb.setCommandResponse("emu finger remove 1", { stdout: "", stderr: "" });

      const result = await biometricAuth.execute({ action: "match" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("emu finger touch failed");
    });

    test("should handle capability check failures gracefully", async () => {
      // Make capability check fail
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", { stdout: "", stderr: "Error" });

      const result = await biometricAuth.execute({ action: "match" });

      expect(result.success).toBe(false);
      expect(result.supported).toBe(false);
    });
  });

  describe("with progress callback", () => {
    test("should work with progress callback", async () => {
      fakeAdb.setCommandResponse("emu finger touch 1", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 1", { stdout: "", stderr: "" });

      const progressCallback = async () => {
        // callback for progress tracking
      };
      const result = await biometricAuth.execute({ action: "match" }, progressCallback);

      expect(result.success).toBe(true);
    });
  });
});
