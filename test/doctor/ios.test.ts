import { describe, expect, test } from "bun:test";
import type { IosDoctorDependencies } from "../../src/doctor/checks/ios";
import {
  checkAppleDeveloperAccount,
  checkBootedSimulators,
  checkCodeSigning,
  checkProvisioningProfiles,
  checkSimctlAvailable,
  checkSimulatorRuntimes,
  checkXcodeCommandLineTools,
  checkXcodeInstallation,
  checkXcrunAvailable
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
  describe("checkXcodeInstallation", () => {
    test("passes when version meets minimum", async () => {
      const result = await checkXcodeInstallation("15.0", {
        ...baseDependencies,
        execFile: async () => createExecResult("Xcode 15.2\nBuild version 15C500b")
      });

      expect(result.status).toBe("pass");
      expect(result.message).toContain("Xcode 15.2 installed");
      expect(result.value).toBe("15.2");
    });

    test("fails when Xcode version is below minimum", async () => {
      const result = await checkXcodeInstallation("15.0", {
        ...baseDependencies,
        execFile: async () => createExecResult("Xcode 14.2\nBuild version 14C18")
      });

      expect(result.status).toBe("fail");
      expect(result.message).toContain("requires 15.0");
    });

    test("fails when unable to determine version", async () => {
      const result = await checkXcodeInstallation("15.0", {
        ...baseDependencies,
        execFile: async () => createExecResult("some unexpected output")
      });

      expect(result.status).toBe("fail");
      expect(result.message).toContain("Unable to determine Xcode version");
    });

    test("skips when not on darwin", async () => {
      const result = await checkXcodeInstallation("15.0", {
        ...baseDependencies,
        platform: () => "linux"
      });

      expect(result.status).toBe("skip");
      expect(result.message).toContain("requires macOS");
    });

    test("fails when xcodebuild throws", async () => {
      const result = await checkXcodeInstallation("15.0", {
        ...baseDependencies,
        execFile: async () => {
          throw new Error("xcodebuild not found");
        }
      });

      expect(result.status).toBe("fail");
      expect(result.message).toContain("Xcode not detected");
      expect(result.message).toContain("xcodebuild not found");
    });
  });

  describe("checkXcodeCommandLineTools", () => {
    test("passes when path exists and contains CommandLineTools", async () => {
      const result = await checkXcodeCommandLineTools({}, {
        ...baseDependencies,
        execFile: async () => createExecResult("/Library/Developer/CommandLineTools\n"),
        fileExists: () => true
      });

      expect(result.status).toBe("pass");
      expect(result.message).toBe("Command Line Tools installed");
      expect(result.value).toBe("/Library/Developer/CommandLineTools");
    });

    test("passes when Xcode developer dir is selected", async () => {
      const result = await checkXcodeCommandLineTools({}, {
        ...baseDependencies,
        execFile: async () => createExecResult("/Applications/Xcode.app/Contents/Developer\n"),
        fileExists: () => true
      });

      expect(result.status).toBe("pass");
      expect(result.message).toBe("Xcode developer directory selected");
      expect(result.value).toBe("/Applications/Xcode.app/Contents/Developer");
    });

    test("fails when path doesn't exist", async () => {
      const result = await checkXcodeCommandLineTools({}, {
        ...baseDependencies,
        execFile: async () => createExecResult("/Library/Developer/CommandLineTools\n"),
        fileExists: () => false
      });

      expect(result.status).toBe("fail");
      expect(result.message).toContain("path missing");
    });

    test("skips when not on darwin", async () => {
      const result = await checkXcodeCommandLineTools({}, {
        ...baseDependencies,
        platform: () => "linux"
      });

      expect(result.status).toBe("skip");
      expect(result.message).toContain("requires macOS");
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
  });

  describe("checkXcrunAvailable", () => {
    test("passes when xcrun works", async () => {
      const result = await checkXcrunAvailable({
        ...baseDependencies,
        execFile: async () => createExecResult("xcrun version 75.")
      });

      expect(result.status).toBe("pass");
      expect(result.message).toBe("xcrun functional");
    });

    test("fails when xcrun fails", async () => {
      const result = await checkXcrunAvailable({
        ...baseDependencies,
        execFile: async () => {
          throw new Error("xcrun: error: unable to find utility");
        }
      });

      expect(result.status).toBe("fail");
      expect(result.message).toContain("xcrun not functional");
    });

    test("skips when not on darwin", async () => {
      const result = await checkXcrunAvailable({
        ...baseDependencies,
        platform: () => "win32"
      });

      expect(result.status).toBe("skip");
      expect(result.message).toContain("requires macOS");
    });
  });

  describe("checkSimctlAvailable", () => {
    test("passes when simctl is available", async () => {
      const result = await checkSimctlAvailable({
        ...baseDependencies,
        createSimctlClient: () => ({
          ...baseDependencies.createSimctlClient(),
          isAvailable: async () => true
        })
      });

      expect(result.status).toBe("pass");
      expect(result.message).toBe("simctl functional");
    });

    test("fails when simctl is not available", async () => {
      const result = await checkSimctlAvailable({
        ...baseDependencies,
        createSimctlClient: () => ({
          ...baseDependencies.createSimctlClient(),
          isAvailable: async () => false
        })
      });

      expect(result.status).toBe("fail");
      expect(result.message).toBe("simctl not available");
    });

    test("skips when not on darwin", async () => {
      const result = await checkSimctlAvailable({
        ...baseDependencies,
        platform: () => "linux"
      });

      expect(result.status).toBe("skip");
      expect(result.message).toContain("requires macOS");
    });
  });

  describe("checkSimulatorRuntimes", () => {
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

    test("passes when iOS runtimes are available", async () => {
      const result = await checkSimulatorRuntimes({
        ...baseDependencies,
        createSimctlClient: () => ({
          ...baseDependencies.createSimctlClient(),
          getRuntimes: async () => [
            {
              bundlePath: "/path",
              buildversion: "21A328",
              runtimeRoot: "/path",
              identifier: "com.apple.CoreSimulator.SimRuntime.iOS-17-0",
              version: "17.0",
              isAvailable: true,
              name: "iOS 17.0"
            }
          ]
        })
      });

      expect(result.status).toBe("pass");
      expect(result.message).toContain("iOS 17.0");
    });
  });

  describe("checkCodeSigning", () => {
    test("warns when no code signing identities are present", async () => {
      const result = await checkCodeSigning({
        ...baseDependencies,
        execFile: async () => createExecResult("  0 valid identities found")
      });

      expect(result.status).toBe("warn");
      expect(result.message).toContain("No code signing identities");
    });

    test("passes when code signing identities exist", async () => {
      const result = await checkCodeSigning({
        ...baseDependencies,
        execFile: async () => createExecResult("  1) ABC123 \"Apple Development: test@test.com\"\n  1 valid identities found")
      });

      expect(result.status).toBe("pass");
      expect(result.message).toContain("1 code signing identity");
    });
  });

  describe("checkAppleDeveloperAccount", () => {
    test("warns when no Apple Developer account is configured", async () => {
      const result = await checkAppleDeveloperAccount({
        ...baseDependencies,
        readDir: async () => []
      });

      expect(result.status).toBe("warn");
      expect(result.message).toContain("No Apple Developer account");
    });

    test("passes when account entries exist", async () => {
      const result = await checkAppleDeveloperAccount({
        ...baseDependencies,
        readDir: async () => ["account.plist"]
      });

      expect(result.status).toBe("pass");
      expect(result.message).toContain("Apple Developer account configured");
    });
  });

  describe("checkProvisioningProfiles", () => {
    test("passes when profiles exist", async () => {
      const result = await checkProvisioningProfiles({
        ...baseDependencies,
        readDir: async () => ["dev.mobileprovision", "dist.mobileprovision"]
      });

      expect(result.status).toBe("pass");
      expect(result.message).toContain("2 provisioning profile(s)");
      expect(result.value).toBe(2);
    });

    test("warns when no profiles", async () => {
      const result = await checkProvisioningProfiles({
        ...baseDependencies,
        readDir: async () => []
      });

      expect(result.status).toBe("warn");
      expect(result.message).toContain("No provisioning profiles");
    });

    test("skips when not on darwin", async () => {
      const result = await checkProvisioningProfiles({
        ...baseDependencies,
        platform: () => "linux"
      });

      expect(result.status).toBe("skip");
      expect(result.message).toContain("only available on macOS");
    });
  });

  describe("checkBootedSimulators", () => {
    test("passes with running simulators", async () => {
      const result = await checkBootedSimulators({
        ...baseDependencies,
        createSimctlClient: () => ({
          ...baseDependencies.createSimctlClient(),
          getBootedSimulators: async () => [
            { name: "iPhone 15", platform: "ios", deviceId: "ABC-123" },
            { name: "iPad Air", platform: "ios", deviceId: "DEF-456" }
          ]
        })
      });

      expect(result.status).toBe("pass");
      expect(result.message).toContain("2 simulator(s) running");
      expect(result.message).toContain("iPhone 15");
      expect(result.message).toContain("iPad Air");
      expect(result.value).toBe(2);
    });

    test("passes with no simulators", async () => {
      const result = await checkBootedSimulators({
        ...baseDependencies,
        createSimctlClient: () => ({
          ...baseDependencies.createSimctlClient(),
          getBootedSimulators: async () => []
        })
      });

      expect(result.status).toBe("pass");
      expect(result.message).toContain("No simulators currently running");
      expect(result.value).toBe(0);
    });

    test("skips when not on darwin", async () => {
      const result = await checkBootedSimulators({
        ...baseDependencies,
        platform: () => "linux"
      });

      expect(result.status).toBe("skip");
      expect(result.message).toContain("only available on macOS");
    });
  });
});
