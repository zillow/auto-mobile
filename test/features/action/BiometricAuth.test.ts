import { expect, describe, test, beforeEach } from "bun:test";
import { BiometricAuth } from "../../../src/features/action/BiometricAuth";
import { ObserveResult, BootedDevice } from "../../../src/models";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeWindow } from "../../fakes/FakeWindow";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";
import { FakeTimer } from "../../fakes/FakeTimer";

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
  let fakeTimer: FakeTimer;
  let device: BootedDevice;

  beforeEach(() => {
    fakeAdb = new FakeAdbExecutor();
    fakeObserveScreen = new FakeObserveScreen();
    fakeWindow = new FakeWindow();
    fakeAwaitIdle = new FakeAwaitIdle();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();

    device = {
      deviceId: "test-device",
      platform: "android"
    } as BootedDevice;

    fakeWindow.configureCachedActiveWindow(null);
    fakeWindow.configureActiveWindow({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });
    fakeObserveScreen.setObserveResult(() => createObserveResult());

    // Emulator detection
    fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", { stdout: "1", stderr: "" });
    fakeAdb.setCommandResponse("emu help", { stdout: "finger - fingerprint commands\nhelp - show this help", stderr: "" });

    // SDK broadcast (matches any am broadcast command for biometric override)
    fakeAdb.setCommandResponse("BIOMETRIC_OVERRIDE", { stdout: "Broadcast completed (1 receivers)", stderr: "" });

    biometricAuth = new BiometricAuth(device, fakeAdb, fakeTimer);

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

    test("should send SDK override broadcast with SUCCESS for match", async () => {
      fakeAdb.setCommandResponse("emu finger touch 1", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 1", { stdout: "", stderr: "" });

      await biometricAuth.execute({ action: "match" });

      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd =>
        cmd.includes("BIOMETRIC_OVERRIDE") && cmd.includes("SUCCESS")
      )).toBe(true);
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

    test("should send SDK override broadcast with FAILURE for fail", async () => {
      fakeAdb.setCommandResponse("emu finger touch 2", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 2", { stdout: "", stderr: "" });

      await biometricAuth.execute({ action: "fail" });

      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd =>
        cmd.includes("BIOMETRIC_OVERRIDE") && cmd.includes("FAILURE")
      )).toBe(true);
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

    test("should send SDK override broadcast with CANCEL for cancel", async () => {
      fakeAdb.setCommandResponse("emu finger touch 2", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 2", { stdout: "", stderr: "" });

      await biometricAuth.execute({ action: "cancel" });

      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd =>
        cmd.includes("BIOMETRIC_OVERRIDE") && cmd.includes("CANCEL")
      )).toBe(true);
    });
  });

  describe("execute - error action", () => {
    test("should use enrolled fingerprint ID 1 for error action", async () => {
      fakeAdb.setCommandResponse("emu finger touch 1", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 1", { stdout: "", stderr: "" });

      const result = await biometricAuth.execute({ action: "error", errorCode: 7 });

      expect(result.success).toBe(true);
      expect(result.action).toBe("error");
      expect(result.fingerprintId).toBe(1);
      expect(result.errorCode).toBe(7);
      expect(result.supported).toBe(true);
      expect(result.observation).toBeDefined();
    });

    test("should send SDK override broadcast with ERROR and errorCode", async () => {
      fakeAdb.setCommandResponse("emu finger touch 1", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 1", { stdout: "", stderr: "" });

      await biometricAuth.execute({ action: "error", errorCode: 7 });

      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd =>
        cmd.includes("BIOMETRIC_OVERRIDE") && cmd.includes("ERROR") && cmd.includes("7")
      )).toBe(true);
    });

    test("should include SDK integration note in error action message", async () => {
      fakeAdb.setCommandResponse("emu finger touch 1", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 1", { stdout: "", stderr: "" });

      const result = await biometricAuth.execute({ action: "error", errorCode: 7 });

      expect(result.message).toContain("consumeOverride");
    });

    test("should use custom fingerprint ID for error action", async () => {
      fakeAdb.setCommandResponse("emu finger touch 3", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 3", { stdout: "", stderr: "" });

      const result = await biometricAuth.execute({ action: "error", errorCode: 1, fingerprintId: 3 });

      expect(result.fingerprintId).toBe(3);
    });

    test("should pass ttlMs to SDK broadcast", async () => {
      fakeAdb.setCommandResponse("emu finger touch 1", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 1", { stdout: "", stderr: "" });

      await biometricAuth.execute({ action: "error", errorCode: 7, ttlMs: 10000 });

      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd =>
        cmd.includes("BIOMETRIC_OVERRIDE") && cmd.includes("10000")
      )).toBe(true);
    });
  });

  describe("SDK broadcast", () => {
    test("should send broadcast before emu finger commands", async () => {
      fakeAdb.setCommandResponse("emu finger touch 1", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 1", { stdout: "", stderr: "" });

      await biometricAuth.execute({ action: "match" });

      const cmds = fakeAdb.getExecutedCommands();
      const broadcastIdx = cmds.findIndex(cmd => cmd.includes("BIOMETRIC_OVERRIDE"));
      const touchIdx = cmds.findIndex(cmd => cmd.includes("emu finger touch 1"));
      expect(broadcastIdx).toBeGreaterThanOrEqual(0);
      expect(touchIdx).toBeGreaterThan(broadcastIdx);
    });

    test("should include default ttlMs in broadcast", async () => {
      fakeAdb.setCommandResponse("emu finger touch 1", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 1", { stdout: "", stderr: "" });

      await biometricAuth.execute({ action: "match" });

      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd =>
        cmd.includes("BIOMETRIC_OVERRIDE") && cmd.includes("ttlMs") && cmd.includes("5000")
      )).toBe(true);
    });

    test("should still proceed if broadcast fails", async () => {
      // Make broadcast fail
      fakeAdb.setCommandResponse("BIOMETRIC_OVERRIDE", { stdout: "", stderr: "broadcast failed" });
      fakeAdb.setCommandResponse("emu finger touch 1", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu finger remove 1", { stdout: "", stderr: "" });

      const result = await biometricAuth.execute({ action: "match" });

      // Emu finger path should still work
      expect(result.success).toBe(true);
    });
  });

  describe("physical device support", () => {
    test("should return partial support on physical devices with SDK broadcast", async () => {
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", { stdout: "0", stderr: "" });

      const result = await biometricAuth.execute({ action: "match" });

      expect(result.success).toBe(true);
      expect(result.supported).toBe("partial");
      expect(result.message).toContain("consumeOverride");
    });

    test("should send SDK broadcast to physical devices", async () => {
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", { stdout: "0", stderr: "" });

      await biometricAuth.execute({ action: "match" });

      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd => cmd.includes("BIOMETRIC_OVERRIDE"))).toBe(true);
    });

    test("should not send emu finger commands to physical devices", async () => {
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", { stdout: "0", stderr: "" });

      await biometricAuth.execute({ action: "match" });

      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd => cmd.includes("emu finger"))).toBe(false);
    });

    test("should support error action on physical devices via SDK broadcast", async () => {
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", { stdout: "0", stderr: "" });

      const result = await biometricAuth.execute({ action: "error", errorCode: 7 });

      expect(result.success).toBe(true);
      expect(result.supported).toBe("partial");
      expect(result.errorCode).toBe(7);
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

    test("should reject emulators without emu finger support", async () => {
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

    test("should treat capability check failures as physical device (partial support)", async () => {
      // When getprop fails, the device is treated as a physical device (non-emulator)
      // which returns supported: "partial" with the SDK broadcast still sent.
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", { stdout: "", stderr: "Error" });

      const result = await biometricAuth.execute({ action: "match" });

      expect(result.success).toBe(true);
      expect(result.supported).toBe("partial");
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
