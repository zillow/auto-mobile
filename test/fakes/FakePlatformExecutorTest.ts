import { FakePlatformExecutor } from "./FakePlatformExecutor";
import { ExecResult } from "../../src/models";
import { expect, describe, it, beforeEach } from "bun:test";

describe("FakePlatformExecutor", () => {
  let executor: FakePlatformExecutor;

  beforeEach(() => {
    executor = new FakePlatformExecutor();
  });

  it("should return default response when no pattern matches", async () => {
    const result = await executor.executeCommand("test command");
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("should set and get device", () => {
    const device = {
      name: "Test Device",
      platform: "android" as const,
      deviceId: "emulator-5554",
    };
    executor.setDevice(device);
    const retrieved = executor.getDevice();
    expect(retrieved).toEqual(device);
  });

  it("should clear device when setting to null", () => {
    const device = {
      name: "Test Device",
      platform: "android" as const,
      deviceId: "emulator-5554",
    };
    executor.setDevice(device);
    executor.setDevice(null);
    expect(executor.getDevice()).toBeNull();
  });

  it("should return custom response for matching command pattern", async () => {
    const customResponse: ExecResult = {
      stdout: "test output",
      stderr: "",
      toString: () => "test output",
      trim: () => "test output",
      includes: (str: string) => "test output".includes(str),
    };
    executor.setCommandResponse("custom", customResponse);
    const result = await executor.executeCommand("custom command");
    expect(result.stdout).toBe("test output");
  });

  it("should track executed commands", async () => {
    await executor.executeCommand("command 1");
    await executor.executeCommand("command 2");
    const commands = executor.getExecutedCommands();
    expect(commands).toHaveLength(2);
    expect(commands[0]).toBe("command 1");
    expect(commands[1]).toBe("command 2");
  });

  it("should check if command pattern was executed", async () => {
    await executor.executeCommand("adb shell getprop");
    expect(executor.wasCommandExecuted("adb")).toBe(true);
    expect(executor.wasCommandExecuted("shell")).toBe(true);
    expect(executor.wasCommandExecuted("unknown")).toBe(false);
  });

  it("should spawn process and return mock ChildProcess", async () => {
    const process = await executor.spawnProcess("adb", ["logcat"]);
    expect(process.pid).toBeTypeOf("number");
    expect(process.killed).toBe(false);
    expect(process.connected).toBe(true);
  });

  it("should track spawned processes", async () => {
    await executor.spawnProcess("adb", ["logcat"]);
    await executor.spawnProcess("adb", ["shell"]);
    const spawned = executor.getSpawnedProcesses();
    expect(spawned).toHaveLength(2);
    expect(spawned[0].command).toBe("adb");
    expect(spawned[0].args).toEqual(["logcat"]);
  });

  it("should report availability by default", async () => {
    const available = await executor.isAvailable();
    expect(available).toBe(true);
  });

  it("should set availability", async () => {
    executor.setAvailable(false);
    let available = await executor.isAvailable();
    expect(available).toBe(false);

    executor.setAvailable(true);
    available = await executor.isAvailable();
    expect(available).toBe(true);
  });

  it("should clear command history", async () => {
    await executor.executeCommand("command 1");
    await executor.executeCommand("command 2");
    executor.clearHistory();
    const commands = executor.getExecutedCommands();
    expect(commands).toHaveLength(0);
  });

  it("should clear process history", async () => {
    await executor.spawnProcess("adb", ["logcat"]);
    executor.clearHistory();
    const spawned = executor.getSpawnedProcesses();
    expect(spawned).toHaveLength(0);
  });

  it("should set default response", async () => {
    const defaultResponse: ExecResult = {
      stdout: "default",
      stderr: "error",
      toString: () => "default",
      trim: () => "default",
      includes: (str: string) => "default".includes(str),
    };
    executor.setDefaultResponse(defaultResponse);
    const result = await executor.executeCommand("unknown");
    expect(result.stdout).toBe("default");
    expect(result.stderr).toBe("error");
  });

  it("should prefer pattern-matched response over default", async () => {
    const defaultResponse: ExecResult = {
      stdout: "default",
      stderr: "",
      toString: () => "default",
      trim: () => "default",
      includes: (str: string) => "default".includes(str),
    };
    const customResponse: ExecResult = {
      stdout: "custom",
      stderr: "",
      toString: () => "custom",
      trim: () => "custom",
      includes: (str: string) => "custom".includes(str),
    };
    executor.setDefaultResponse(defaultResponse);
    executor.setCommandResponse("adb", customResponse);
    const result = await executor.executeCommand("adb shell");
    expect(result.stdout).toBe("custom");
  });

  it("should provide mock ChildProcess with required methods", async () => {
    const process = await executor.spawnProcess("adb", ["shell"]);

    // Test kill method
    expect(process.kill).toBeTypeOf("function");
    const killed = process.kill("SIGTERM");
    expect(killed).toBe(true);
    expect(process.killed).toBe(true);

    // Test disconnect method
    const process2 = await executor.spawnProcess("adb", ["shell"]);
    expect(process2.disconnect).toBeTypeOf("function");
    process2.disconnect();
    expect(process2.connected).toBe(false);

    // Test ref and unref methods
    const process3 = await executor.spawnProcess("adb", ["shell"]);
    const ref = process3.ref();
    expect(ref).toBe(process3);
    const unref = process3.unref();
    expect(unref).toBe(process3);
  });
});
