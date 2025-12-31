import { expect, describe, test, beforeEach } from "bun:test";
import { AxeClient } from "../../../src/utils/ios-cmdline-tools/AxeClient";
import { BootedDevice, ExecResult } from "../../../src/models";

describe("Axe", function() {
  let axe: AxeClient;
  let mockDevice: BootedDevice;
  let mockExecAsync: (command: string) => Promise<ExecResult>;

  beforeEach(function() {
    mockDevice = {
      deviceId: "test-ios-device-id",
      name: "Test iOS Device",
      platform: "ios",
      source: "local"
    };

    mockExecAsync = async (command: string): Promise<ExecResult> => {
      return {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
    };

    axe = new AxeClient(mockDevice, mockExecAsync);
  });

  describe("isAvailable", function() {
    test("should return true when axe is available", async function() {
      mockExecAsync = async (command: string): Promise<ExecResult> => {
        if (command.includes("axe --help")) {
          return {
            stdout: "axe help output",
            stderr: "",
            toString: () => "axe help output",
            trim: () => "axe help output",
            includes: () => false
          };
        }
        return { stdout: "", stderr: "", toString: () => "", trim: () => "", includes: () => false };
      };

      axe = new AxeClient(null, mockExecAsync);

      const available = await axe.isAvailable();
      expect(available).toBe(true);
    });

    test("should return false when axe is not available", async function() {
      mockExecAsync = async (command: string): Promise<ExecResult> => {
        throw new Error("Command not found: axe");
      };

      axe = new AxeClient(null, mockExecAsync);

      const available = await axe.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe("executeCommand", function() {
    test("should execute axe commands with device UDID", async function() {
      let executedCommand = "";
      mockExecAsync = async (command: string): Promise<ExecResult> => {
        executedCommand = command;
        return {
          stdout: "command executed",
          stderr: "",
          toString: () => "command executed",
          trim: () => "command executed",
          includes: () => false
        };
      };

      axe = new AxeClient(mockDevice, mockExecAsync);
      await axe.executeCommand("describe-ui");

      expect(executedCommand).toBe("axe describe-ui --udid test-ios-device-id");
    });

    test("should execute axe commands without UDID when no device is set", async function() {
      let executedCommand = "";
      mockExecAsync = async (command: string): Promise<ExecResult> => {
        executedCommand = command;
        return {
          stdout: "command executed",
          stderr: "",
          toString: () => "command executed",
          trim: () => "command executed",
          includes: () => false
        };
      };

      axe = new AxeClient(null, mockExecAsync);
      await axe.executeCommand("describe-ui");

      expect(executedCommand).toBe("axe describe-ui");
    });
  });

  describe("tap", function() {
    test("should execute tap command with coordinates", async function() {
      let executedCommand = "";
      mockExecAsync = async (command: string): Promise<ExecResult> => {
        executedCommand = command;
        return {
          stdout: "tap executed",
          stderr: "",
          toString: () => "tap executed",
          trim: () => "tap executed",
          includes: () => false
        };
      };

      axe = new AxeClient(mockDevice, mockExecAsync);
      await axe.tap(100, 200);

      expect(executedCommand).toBe("axe tap -x 100 -y 200 --udid test-ios-device-id");
    });
  });
});
