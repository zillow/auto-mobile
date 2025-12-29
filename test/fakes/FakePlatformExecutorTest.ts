import { FakePlatformExecutor } from "./FakePlatformExecutor";
import { ExecResult } from "../../src/models";
import { expect } from "chai";

describe("FakePlatformExecutor", () => {
  let executor: FakePlatformExecutor;

  beforeEach(() => {
    executor = new FakePlatformExecutor();
  });

  it("should return default response when no pattern matches", async () => {
    const result = await executor.executeCommand("test command");
    expect(result.stdout).to.equal("");
    expect(result.stderr).to.equal("");
  });

  it("should set and get device", () => {
    const device = {
      name: "Test Device",
      platform: "android" as const,
      deviceId: "emulator-5554",
    };
    executor.setDevice(device);
    const retrieved = executor.getDevice();
    expect(retrieved).to.deep.equal(device);
  });

  it("should clear device when setting to null", () => {
    const device = {
      name: "Test Device",
      platform: "android" as const,
      deviceId: "emulator-5554",
    };
    executor.setDevice(device);
    executor.setDevice(null);
    expect(executor.getDevice()).to.be.null;
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
    expect(result.stdout).to.equal("test output");
  });

  it("should track executed commands", async () => {
    await executor.executeCommand("command 1");
    await executor.executeCommand("command 2");
    const commands = executor.getExecutedCommands();
    expect(commands).to.have.length(2);
    expect(commands[0]).to.equal("command 1");
    expect(commands[1]).to.equal("command 2");
  });

  it("should check if command pattern was executed", async () => {
    await executor.executeCommand("adb shell getprop");
    expect(executor.wasCommandExecuted("adb")).to.be.true;
    expect(executor.wasCommandExecuted("shell")).to.be.true;
    expect(executor.wasCommandExecuted("unknown")).to.be.false;
  });

  it("should spawn process and return mock ChildProcess", async () => {
    const process = await executor.spawnProcess("adb", ["logcat"]);
    expect(process.pid).to.be.a("number");
    expect(process.killed).to.be.false;
    expect(process.connected).to.be.true;
  });

  it("should track spawned processes", async () => {
    await executor.spawnProcess("adb", ["logcat"]);
    await executor.spawnProcess("adb", ["shell"]);
    const spawned = executor.getSpawnedProcesses();
    expect(spawned).to.have.length(2);
    expect(spawned[0].command).to.equal("adb");
    expect(spawned[0].args).to.deep.equal(["logcat"]);
  });

  it("should report availability by default", async () => {
    const available = await executor.isAvailable();
    expect(available).to.be.true;
  });

  it("should set availability", async () => {
    executor.setAvailable(false);
    let available = await executor.isAvailable();
    expect(available).to.be.false;

    executor.setAvailable(true);
    available = await executor.isAvailable();
    expect(available).to.be.true;
  });

  it("should clear command history", async () => {
    await executor.executeCommand("command 1");
    await executor.executeCommand("command 2");
    executor.clearHistory();
    const commands = executor.getExecutedCommands();
    expect(commands).to.have.length(0);
  });

  it("should clear process history", async () => {
    await executor.spawnProcess("adb", ["logcat"]);
    executor.clearHistory();
    const spawned = executor.getSpawnedProcesses();
    expect(spawned).to.have.length(0);
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
    expect(result.stdout).to.equal("default");
    expect(result.stderr).to.equal("error");
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
    expect(result.stdout).to.equal("custom");
  });

  it("should provide mock ChildProcess with required methods", async () => {
    const process = await executor.spawnProcess("adb", ["shell"]);

    // Test kill method
    expect(process.kill).to.be.a("function");
    const killed = process.kill("SIGTERM");
    expect(killed).to.be.true;
    expect(process.killed).to.be.true;

    // Test disconnect method
    const process2 = await executor.spawnProcess("adb", ["shell"]);
    expect(process2.disconnect).to.be.a("function");
    process2.disconnect();
    expect(process2.connected).to.be.false;

    // Test ref and unref methods
    const process3 = await executor.spawnProcess("adb", ["shell"]);
    const ref = process3.ref();
    expect(ref).to.equal(process3);
    const unref = process3.unref();
    expect(unref).to.equal(process3);
  });
});
