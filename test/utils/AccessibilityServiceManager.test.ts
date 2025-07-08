import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import { AccessibilityServiceManager } from "../../src/utils/accessibilityServiceManager";
import { AdbUtils } from "../../src/utils/adb";

describe("AccessibilityServiceManager", function() {
  let accessibilityServiceClient: AccessibilityServiceManager;
  let mockAdb: AdbUtils;

  beforeEach(function() {
    // Create mock ADB instance
    mockAdb = {
      executeCommand: async () => ({ stdout: "", stderr: "" })
    } as unknown as AdbUtils;

    accessibilityServiceClient = new AccessibilityServiceManager("test-device", mockAdb);
    AccessibilityServiceManager.clearAvailabilityCache();
  });

  describe("isInstalled", function() {
    it("should return true when accessibility service package is installed", async function() {
      mockAdb.executeCommand = async () => ({
        stdout: `package:${AccessibilityServiceManager.PACKAGE}
`,
        stderr: ""
      });

      const result = await accessibilityServiceClient.isInstalled();
      expect(result).to.be.true;
    });

    it("should return false when accessibility service package is not installed", async function() {
      mockAdb.executeCommand = async () => ({
        stdout: "package:com.other.app\n",
        stderr: ""
      });

      const result = await accessibilityServiceClient.isInstalled();
      expect(result).to.be.false;
    });

    it("should return false when ADB command fails", async function() {
      mockAdb.executeCommand = async () => {
        throw new Error("ADB command failed");
      };

      const result = await accessibilityServiceClient.isInstalled();
      expect(result).to.be.false;
    });
  });

  describe("isEnabled", function() {
    it("should return true when accessibility service is enabled", async function() {
      mockAdb.executeCommand = async () => ({
        stdout: `${AccessibilityServiceManager.PACKAGE}/${AccessibilityServiceManager.PACKAGE}.AutomobileAccessibilityService:other.service/SomeService`,
        stderr: ""
      });

      const result = await accessibilityServiceClient.isEnabled();
      expect(result).to.be.true;
    });

    it("should return false when accessibility service is not enabled", async function() {
      mockAdb.executeCommand = async () => ({
        stdout: "other.service/SomeService",
        stderr: ""
      });

      const result = await accessibilityServiceClient.isEnabled();
      expect(result).to.be.false;
    });

    it("should return false when ADB command fails", async function() {
      mockAdb.executeCommand = async () => {
        throw new Error("ADB command failed");
      };

      const result = await accessibilityServiceClient.isEnabled();
      expect(result).to.be.false;
    });
  });

  describe("isAvailable", function() {
    it("should return true when service is both installed and enabled", async function() {
      let callCount = 0;
      mockAdb.executeCommand = async (cmd: string) => {
        callCount++;
        if (cmd.includes("pm list packages")) {
          return {
            stdout: `package:${AccessibilityServiceManager.PACKAGE}
`,
            stderr: ""
          };
        } else if (cmd.includes("settings get secure")) {
          return {
            stdout: `${AccessibilityServiceManager.PACKAGE}/${AccessibilityServiceManager.PACKAGE}.AutomobileAccessibilityService`,
            stderr: ""
          };
        }
        return { stdout: "", stderr: "" };
      };

      const result = await accessibilityServiceClient.isAvailable();
      expect(result).to.be.true;
      expect(callCount).to.equal(2); // Should call both installation and enabled checks
    });

    it("should return false when service is installed but not enabled", async function() {
      let callCount = 0;
      mockAdb.executeCommand = async (cmd: string) => {
        callCount++;
        if (cmd.includes("pm list packages")) {
          return {
            stdout: `package:${AccessibilityServiceManager.PACKAGE}
`,
            stderr: ""
          };
        } else if (cmd.includes("settings get secure")) {
          return {
            stdout: "other.service/SomeService",
            stderr: ""
          };
        }
        return { stdout: "", stderr: "" };
      };

      const result = await accessibilityServiceClient.isAvailable();
      expect(result).to.be.false;
      expect(callCount).to.equal(2);
    });

    it("should return false when service is not installed", async function() {
      let callCount = 0;
      mockAdb.executeCommand = async (cmd: string) => {
        callCount++;
        if (cmd.includes("pm list packages")) {
          return {
            stdout: "package:com.other.app\n",
            stderr: ""
          };
        } else if (cmd.includes("settings get secure")) {
          return {
            stdout: `${AccessibilityServiceManager.PACKAGE}/${AccessibilityServiceManager.PACKAGE}.AutomobileAccessibilityService`,
            stderr: ""
          };
        }
        return { stdout: "", stderr: "" };
      };

      const result = await accessibilityServiceClient.isAvailable();
      expect(result).to.be.false;
      expect(callCount).to.equal(2);
    });
  });
});
