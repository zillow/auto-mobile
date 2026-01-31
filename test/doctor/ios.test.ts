import { describe, expect, test } from "bun:test";
import type { IosDoctorDependencies } from "../../src/doctor/checks/ios";
import {
  checkAppleDeveloperAccount,
  checkCodeSigning,
  checkSimulatorRuntimes,
  checkXcodeCommandLineTools,
  checkXcodeInstallation
} from "../../src/doctor/checks/ios";
import type { ExecResult } from "../../src/models";
import { FakeTimer } from "../fakes/FakeTimer";

const createExecResult = (stdout: string, stderr: string = ""): ExecResult => ({
  stdout,
  stderr,
  toString() {
    return this.stdout;
  },
  trim() {
    return this.stdout.trim();
  },
  includes(searchString: string) {
    return this.stdout.includes(searchString);
  }
});

const baseDependencies: IosDoctorDependencies = {
  platform: () => "darwin",
  execFile: async () => createExecResult(""),
  fileExists: () => true,
  readDir: async () => [],
  homedir: () => "/Users/test",
  createSimctlClient: () => ({
    setDevice: () => {},
    executeCommand: async () => createExecResult(""),
    isAvailable: async () => true,
    isSimulatorRunning: async () => false,
    startSimulator: async () => ({} as any),
    killSimulator: async () => {},
    waitForSimulatorReady: async () => ({ name: "sim", platform: "ios", deviceId: "123" }),
    listSimulatorImages: async () => [],
    getBootedSimulators: async () => [],
    getDeviceInfo: async () => null,
    bootSimulator: async () => ({ name: "sim", platform: "ios", deviceId: "123" }),
    getDeviceTypes: async () => [],
    getRuntimes: async () => [],
    createSimulator: async () => "123",
    deleteSimulator: async () => {},
    listApps: async () => [],
    launchApp: async () => ({ success: true }),
    terminateApp: async () => {},
    getScreenSize: async () => ({ width: 100, height: 100 }),
    setAppearance: async () => {}
  })
};

describe("iOS doctor checks", () => {
  test("fails when Xcode version is below minimum", async () => {
    const result = await checkXcodeInstallation("15.0", {
      ...baseDependencies,
      execFile: async () => createExecResult("Xcode 14.2\nBuild version 14C18")
    });

    expect(result.status).toBe("fail");
    expect(result.message).toContain("requires 15.0");
  });

  test("passes when Command Line Tools are already installed via install flag", async () => {
    const fakeTimer = new FakeTimer();
    const execCalls: string[] = [];

    const execFile = async () => {
      execCalls.push("xcode-select --install");
      await fakeTimer.sleep(0);
      const error = new Error("Command line tools are already installed.");
      (error as { stderr?: string }).stderr = "Command line tools are already installed.";
      throw error;
    };

    const resultPromise = checkXcodeCommandLineTools(
      { installXcodeCommandLineTools: true },
      { ...baseDependencies, execFile }
    );

    fakeTimer.advanceTime(0);
    const result = await resultPromise;

    expect(execCalls).toHaveLength(1);
    expect(result.status).toBe("pass");
  });

  test("fails when no simulator runtimes are available", async () => {
    const result = await checkSimulatorRuntimes({
      ...baseDependencies,
      createSimctlClient: () => ({
        ...baseDependencies.createSimctlClient(),
        getRuntimes: async () => []
      })
    });

    expect(result.status).toBe("fail");
    expect(result.message).toContain("No iOS simulator runtimes");
  });

  test("warns when no code signing identities are present", async () => {
    const result = await checkCodeSigning({
      ...baseDependencies,
      execFile: async () => createExecResult("  0 valid identities found")
    });

    expect(result.status).toBe("warn");
    expect(result.message).toContain("No code signing identities");
  });

  test("warns when no Apple Developer account is configured", async () => {
    const result = await checkAppleDeveloperAccount({
      ...baseDependencies,
      readDir: async () => []
    });

    expect(result.status).toBe("warn");
    expect(result.message).toContain("No Apple Developer account");
  });
});
