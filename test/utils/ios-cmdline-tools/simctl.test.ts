import { expect, describe, test, beforeEach } from "bun:test";
import { Simctl } from "../../../src/utils/ios-cmdline-tools/SimCtlClient";
import { BootedDevice, ExecResult } from "../../../src/models";
import { createExecResult } from "../../../src/utils/execResult";

describe("Simctl", function() {
  let simctl: Simctl;
  let mockDevice: BootedDevice;
  let mockExecAsync: (file: string, args: string[], maxBuffer?: number) => Promise<ExecResult>;

  beforeEach(function() {
    mockDevice = {
      deviceId: "test-ios-device-id",
      name: "Test iOS Device",
      platform: "ios",
      source: "local"
    };

    mockExecAsync = async (): Promise<ExecResult> => {
      return {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
    };

    simctl = new Simctl(mockDevice, mockExecAsync);
  });

  describe("isAvailable", function() {
    test("should return true when simctl is available", async function() {
      mockExecAsync = async (file: string, args: string[]): Promise<ExecResult> => {
        if (file === "xcrun" && args.join(" ") === "simctl --version") {
          return {
            stdout: "simctl version 1.0.0",
            stderr: "",
            toString: () => "simctl version 1.0.0",
            trim: () => "simctl version 1.0.0",
            includes: () => false
          };
        }
        return { stdout: "", stderr: "", toString: () => "", trim: () => "", includes: () => false };
      };

      simctl = new Simctl(null, mockExecAsync);

      const available = await simctl.isAvailable();
      expect(available).toBe(true);
    });

    test("should return false when simctl is not available", async function() {
      mockExecAsync = async (): Promise<ExecResult> => {
        throw new Error("Command not found: xcrun");
      };

      simctl = new Simctl(null, mockExecAsync);

      const available = await simctl.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe("executeCommand", function() {
    test("should execute simctl commands with xcrun prefix", async function() {
      let executedFile = "";
      let executedArgs: string[] = [];
      mockExecAsync = async (file: string, args: string[]): Promise<ExecResult> => {
        executedFile = file;
        executedArgs = args;
        if (file === "xcrun" && args.join(" ") === "simctl --version") {
          return {
            stdout: "simctl version 1.0.0",
            stderr: "",
            toString: () => "simctl version 1.0.0",
            trim: () => "simctl version 1.0.0",
            includes: () => false
          };
        }
        return {
          stdout: "command executed",
          stderr: "",
          toString: () => "command executed",
          trim: () => "command executed",
          includes: () => false
        };
      };

      simctl = new Simctl(mockDevice, mockExecAsync);
      await simctl.executeCommand("list devices");

      expect(executedFile).toBe("xcrun");
      expect(executedArgs).toEqual(["simctl", "list", "devices"]);
    });
  });

  describe("host control routing", function() {
    test("should report available when host control is enabled in docker", async function() {
      mockExecAsync = async (): Promise<ExecResult> => {
        throw new Error("Command not found: xcrun");
      };

      const hostControlRunner = {
        isAvailable: async () => true,
        isRunningInDocker: () => true,
        runSimctl: async () => createExecResult("simctl version 1.2.3", ""),
        shouldUseHostControl: () => true
      };

      simctl = new Simctl(null, mockExecAsync, hostControlRunner);

      const available = await simctl.isAvailable();
      expect(available).toBe(true);
    });

    test("should execute simctl commands via host control when enabled", async function() {
      let receivedArgs: string[] = [];

      mockExecAsync = async (): Promise<ExecResult> => {
        throw new Error("Local simctl should not be invoked");
      };

      const hostControlRunner = {
        isAvailable: async () => true,
        isRunningInDocker: () => true,
        runSimctl: async (args: string[]) => {
          receivedArgs = args;
          return createExecResult("command executed", "");
        },
        shouldUseHostControl: () => true
      };

      simctl = new Simctl(mockDevice, mockExecAsync, hostControlRunner);
      await simctl.executeCommand("list devices");

      expect(receivedArgs).toEqual(["list", "devices"]);
    });
  });

  describe("listSimulatorImages", function() {
    test("should include unavailable and transitional simulators", async function() {
      const simulatorPayload = {
        devices: {
          "com.apple.CoreSimulator.SimRuntime.iOS-17-4": [
            {
              udid: "booted-udid",
              name: "iPhone 15 Pro",
              state: "Booted",
              isAvailable: true,
              deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro",
              os_version: "17.4",
              model: "iPhone15,3",
              architecture: "arm64"
            },
            {
              udid: "shutdown-udid",
              name: "iPhone 15",
              state: "Shutdown",
              isAvailable: true,
              deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-15",
              os_version: "17.4"
            },
            {
              udid: "creating-udid",
              name: "iPhone 14",
              state: "Creating",
              isAvailable: true,
              deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-14",
              os_version: "17.4"
            },
            {
              udid: "unavailable-udid",
              name: "iPhone 13",
              state: "Unavailable",
              isAvailable: false,
              availabilityError: "runtime missing",
              deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-13"
            }
          ]
        },
        runtimes: [],
        devicetypes: [],
        pairs: []
      };

      mockExecAsync = async (file: string, args: string[]): Promise<ExecResult> => {
        if (file === "xcrun" && args.join(" ") === "simctl --version") {
          return {
            stdout: "simctl version 1.0.0",
            stderr: "",
            toString: () => "simctl version 1.0.0",
            trim: () => "simctl version 1.0.0",
            includes: () => false
          };
        }
        if (file === "xcrun" && args.join(" ") === "simctl list devices --json") {
          const payload = JSON.stringify(simulatorPayload);
          return {
            stdout: payload,
            stderr: "",
            toString: () => payload,
            trim: () => payload.trim(),
            includes: (search: string) => payload.includes(search)
          };
        }
        return { stdout: "", stderr: "", toString: () => "", trim: () => "", includes: () => false };
      };

      simctl = new Simctl(null, mockExecAsync);
      (Simctl as unknown as { deviceListCache: { devices: unknown[]; timestamp: number } | null })
        .deviceListCache = null;

      const devices = await simctl.listSimulatorImages();

      expect(devices).toHaveLength(4);
      const unavailable = devices.find(device => device.deviceId === "unavailable-udid");
      expect(unavailable?.state).toBe("Unavailable");
      expect(unavailable?.isAvailable).toBe(false);
      expect(unavailable?.availabilityError).toBe("runtime missing");
      expect(unavailable?.runtime).toBe("com.apple.CoreSimulator.SimRuntime.iOS-17-4");
      expect(unavailable?.iosVersion).toBe("17.4");
    });
  });

  describe("getRuntimes uses dedicated simctl command", function() {
    test("should return runtimes from simctl list runtimes --json", async function() {
      mockExecAsync = async (file: string, args: string[]): Promise<ExecResult> => {
        if (file === "xcrun" && args.join(" ") === "simctl list runtimes --json") {
          return createExecResult(JSON.stringify({
            runtimes: [
              {
                bundlePath: "/Library/Developer/CoreSimulator/Volumes/iOS_26.2/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 26.2.simruntime",
                identifier: "com.apple.CoreSimulator.SimRuntime.iOS-26-2",
                isAvailable: true,
                name: "iOS 26.2",
                version: "26.2"
              },
              {
                bundlePath: "/Library/Developer/CoreSimulator/Volumes/iOS_18.6/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 18.6.simruntime",
                identifier: "com.apple.CoreSimulator.SimRuntime.iOS-18-6",
                isAvailable: false,
                name: "iOS 18.6",
                version: "18.6"
              }
            ]
          }), "");
        }
        return createExecResult("", "");
      };

      simctl = new Simctl(null, mockExecAsync);
      const runtimes = await simctl.getRuntimes();
      expect(runtimes).toHaveLength(1);
      expect(runtimes[0].name).toBe("iOS 26.2");
      expect(runtimes[0].isAvailable).toBe(true);
    });

    test("should throw when runtimes command fails", async function() {
      mockExecAsync = async (): Promise<ExecResult> => {
        throw new Error("simctl failed");
      };

      simctl = new Simctl(null, mockExecAsync);
      await expect(simctl.getRuntimes()).rejects.toThrow();
    });
  });

  describe("getDeviceTypes uses dedicated simctl command", function() {
    test("should return device types from simctl list devicetypes --json", async function() {
      mockExecAsync = async (file: string, args: string[]): Promise<ExecResult> => {
        if (file === "xcrun" && args.join(" ") === "simctl list devicetypes --json") {
          return createExecResult(JSON.stringify({
            devicetypes: [
              {
                name: "iPhone 17 Pro",
                identifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro",
                bundlePath: "/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Library/Developer/CoreSimulator/Profiles/DeviceTypes/iPhone 17 Pro.simdevicetype"
              }
            ]
          }), "");
        }
        return createExecResult("", "");
      };

      simctl = new Simctl(null, mockExecAsync);
      const types = await simctl.getDeviceTypes();
      expect(types).toHaveLength(1);
      expect(types[0].name).toBe("iPhone 17 Pro");
    });

    test("should throw when devicetypes command fails", async function() {
      mockExecAsync = async (): Promise<ExecResult> => {
        throw new Error("simctl failed");
      };

      simctl = new Simctl(null, mockExecAsync);
      await expect(simctl.getDeviceTypes()).rejects.toThrow();
    });
  });
});
