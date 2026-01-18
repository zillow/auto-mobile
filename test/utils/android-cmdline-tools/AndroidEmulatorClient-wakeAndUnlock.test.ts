import { beforeEach, describe, expect, test } from "bun:test";
import { AndroidEmulatorClient } from "../../../src/utils/android-cmdline-tools/AndroidEmulatorClient";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { ExecResult } from "../../../src/models";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("AndroidEmulatorClient wakeAndUnlock", () => {
  let emulatorClient: AndroidEmulatorClient;
  let fakeAdb: FakeAdbExecutor;
  let fakeTimer: FakeTimer;

  const createExecResult = (stdout: string, stderr: string = ""): ExecResult => ({
    stdout,
    stderr,
    toString: () => stdout,
    trim: () => stdout.trim(),
    includes: (s: string) => stdout.includes(s),
  });

  const mockExecAsync = async (_command: string): Promise<ExecResult> => {
    return createExecResult("", "");
  };

  beforeEach(() => {
    fakeAdb = new FakeAdbExecutor();
    fakeTimer = new FakeTimer();
    emulatorClient = new AndroidEmulatorClient(mockExecAsync, null, fakeTimer);
  });

  test("should wake device and dismiss keyguard when device is Asleep", async () => {
    fakeAdb.setScreenState(false, "Asleep");
    const device = { name: "test-avd", platform: "android" as const, deviceId: "emulator-5554" };

    // Access the private method using bracket notation for testing
    const wakeAndUnlock = (emulatorClient as any).wakeAndUnlock.bind(emulatorClient);
    await wakeAndUnlock(device, fakeAdb);

    // Verify KEYCODE_WAKEUP was sent since device was Asleep
    expect(fakeAdb.wasCommandExecuted("KEYCODE_WAKEUP")).toBe(true);

    // Verify keyguard was dismissed
    expect(fakeAdb.wasCommandExecuted("wm dismiss-keyguard")).toBe(true);
  });

  test("should wake device and dismiss keyguard when device is Dozing", async () => {
    fakeAdb.setScreenState(false, "Dozing");
    const device = { name: "test-avd", platform: "android" as const, deviceId: "emulator-5554" };

    const wakeAndUnlock = (emulatorClient as any).wakeAndUnlock.bind(emulatorClient);
    await wakeAndUnlock(device, fakeAdb);

    // Verify KEYCODE_WAKEUP was sent since device was Dozing
    expect(fakeAdb.wasCommandExecuted("KEYCODE_WAKEUP")).toBe(true);

    // Verify keyguard was dismissed
    expect(fakeAdb.wasCommandExecuted("wm dismiss-keyguard")).toBe(true);
  });

  test("should skip KEYCODE_WAKEUP when device is already Awake", async () => {
    fakeAdb.setScreenState(true, "Awake");
    const device = { name: "test-avd", platform: "android" as const, deviceId: "emulator-5554" };

    const wakeAndUnlock = (emulatorClient as any).wakeAndUnlock.bind(emulatorClient);
    await wakeAndUnlock(device, fakeAdb);

    // Verify KEYCODE_WAKEUP was NOT sent since device was already Awake
    expect(fakeAdb.wasCommandExecuted("KEYCODE_WAKEUP")).toBe(false);

    // Verify keyguard was still dismissed (always dismiss to be safe)
    expect(fakeAdb.wasCommandExecuted("wm dismiss-keyguard")).toBe(true);
  });

  test("should handle errors gracefully without throwing", async () => {
    fakeAdb.setScreenState(false, "Asleep");
    // Make executeCommand throw an error
    fakeAdb.setCommandResponse("KEYCODE_WAKEUP", {
      stdout: "",
      stderr: "Error",
      toString: () => "",
      trim: () => "",
      includes: () => false,
    });
    // Override to throw
    const originalExecuteCommand = fakeAdb.executeCommand.bind(fakeAdb);
    fakeAdb.executeCommand = async (command: string) => {
      if (command.includes("KEYCODE_WAKEUP")) {
        throw new Error("Simulated ADB error");
      }
      return originalExecuteCommand(command);
    };

    const device = { name: "test-avd", platform: "android" as const, deviceId: "emulator-5554" };
    const wakeAndUnlock = (emulatorClient as any).wakeAndUnlock.bind(emulatorClient);

    // Should not throw
    await expect(wakeAndUnlock(device, fakeAdb)).resolves.toBeUndefined();
  });

  test("should still try to wake when wakefulness check returns null", async () => {
    // Set wakefulness to null (unknown state)
    (fakeAdb as any).wakefulness = null;
    const device = { name: "test-avd", platform: "android" as const, deviceId: "emulator-5554" };

    const wakeAndUnlock = (emulatorClient as any).wakeAndUnlock.bind(emulatorClient);
    await wakeAndUnlock(device, fakeAdb);

    // When wakefulness is null (unknown), should still try to wake the device
    expect(fakeAdb.wasCommandExecuted("KEYCODE_WAKEUP")).toBe(true);

    // Verify keyguard was dismissed
    expect(fakeAdb.wasCommandExecuted("wm dismiss-keyguard")).toBe(true);
  });
});
