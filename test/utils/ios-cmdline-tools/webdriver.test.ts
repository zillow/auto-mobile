import { expect } from "chai";
import { WebDriverAgent } from "../../../src/utils/ios-cmdline-tools/webdriver";
import { BootedDevice, ExecResult } from "../../../src/models";
import * as sinon from "sinon";

describe("WebDriverAgent", function() {
  let webDriverAgent: WebDriverAgent;
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

    webDriverAgent = new WebDriverAgent(mockDevice, {}, mockExecAsync);
  });

  describe("isAvailable", function() {
    it("should return true when Xcode command line tools are available", async function() {
      mockExecAsync = async (command: string): Promise<ExecResult> => {
        if (command.includes("xcrun --version")) {
          return {
            stdout: "xcrun version 15.0",
            stderr: "",
            toString: () => "xcrun version 15.0",
            trim: () => "xcrun version 15.0",
            includes: () => false
          };
        }
        return { stdout: "", stderr: "", toString: () => "", trim: () => "", includes: () => false };
      };

      webDriverAgent = new WebDriverAgent(null, {}, mockExecAsync);

      const available = await webDriverAgent.isAvailable();
      expect(available).to.be.true;
    });

    it("should return false when Xcode command line tools are not available", async function() {
      mockExecAsync = async (command: string): Promise<ExecResult> => {
        throw new Error("Command not found: xcrun");
      };

      webDriverAgent = new WebDriverAgent(null, {}, mockExecAsync);

      const available = await webDriverAgent.isAvailable();
      expect(available).to.be.false;
    });
  });

  describe("executeCommand", function() {
    it("should execute shell commands with xcrun prefix", async function() {
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

      webDriverAgent = new WebDriverAgent(mockDevice, {}, mockExecAsync);
      await webDriverAgent.executeCommand("simctl list devices");

      expect(executedCommand).to.equal("xcrun simctl list devices");
    });

    it("should handle HTTP commands differently", async function() {
      // Mock the private makeRequest method
      const makeRequestStub = sinon.stub(webDriverAgent as any, "makeRequest");
      makeRequestStub.resolves({ message: "status response" });

      const result = await webDriverAgent.executeCommand("/status");

      // Should return a valid ExecResult structure
      expect(result).to.have.property("stdout");
      expect(result).to.have.property("stderr");
      expect(result).to.have.property("toString");
      expect(result).to.have.property("trim");
      expect(result).to.have.property("includes");

      // Verify makeRequest was called
      expect(makeRequestStub.calledOnce).to.be.true;
      expect(makeRequestStub.calledWith("GET", "/status")).to.be.true;

      makeRequestStub.restore();
    });
  });

  describe("setDevice", function() {
    it("should set the device correctly", function() {
      const newDevice: BootedDevice = {
        deviceId: "new-device-id",
        name: "New Device",
        platform: "ios",
        source: "local"
      };

      webDriverAgent.setDevice(newDevice);
      expect(webDriverAgent.device).to.equal(newDevice);
    });
  });
});
