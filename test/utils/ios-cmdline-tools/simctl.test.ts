import { expect } from "chai";
import { Simctl } from "../../../src/utils/ios-cmdline-tools/simctl";
import { BootedDevice, ExecResult } from "../../../src/models";

describe("Simctl", function() {
  let simctl: Simctl;
  let mockDevice: BootedDevice;
  let mockExecAsync: (command: string, maxBuffer?: number) => Promise<ExecResult>;

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

    simctl = new Simctl(mockDevice, mockExecAsync);
  });

  describe("isAvailable", function() {
    it("should return true when simctl is available", async function() {
      mockExecAsync = async (command: string): Promise<ExecResult> => {
        if (command.includes("xcrun simctl --version")) {
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
      expect(available).to.be.true;
    });

    it("should return false when simctl is not available", async function() {
      mockExecAsync = async (command: string): Promise<ExecResult> => {
        throw new Error("Command not found: xcrun");
      };

      simctl = new Simctl(null, mockExecAsync);

      const available = await simctl.isAvailable();
      expect(available).to.be.false;
    });
  });

  describe("executeCommand", function() {
    it("should execute simctl commands with xcrun prefix", async function() {
      let executedCommand = "";
      mockExecAsync = async (command: string): Promise<ExecResult> => {
        executedCommand = command;
        if (command.includes("xcrun simctl --version")) {
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

      expect(executedCommand).to.equal("xcrun simctl list devices");
    });
  });
});
