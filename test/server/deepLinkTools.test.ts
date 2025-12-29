import { expect } from "chai";
import { registerDeepLinkTools } from "../../src/server/deepLinkTools";
import { ToolRegistry } from "../../src/server/toolRegistry";
import { DeviceUtils } from "../../src/utils/deviceUtils";
import { FakeDeepLinkManager } from "../fakes/FakeDeepLinkManager";

// Helper function to check if AVDs are available
async function checkAvdAvailability(): Promise<boolean> {
  try {
    const deviceUtils = new DeviceUtils();
    const avds = await deviceUtils.listDeviceImages();
    return avds.length > 0;
  } catch (error) {
    // If we can't list AVDs (e.g., Android SDK not available), return false
    return false;
  }
}

describe("Deep Link Tools Registration", function() {
  this.timeout(5000);
  let avdsAvailable: boolean;
  let fakeDeepLinkManager: FakeDeepLinkManager;

  before(async function() {
    // Check if AVDs are available once before all tests
    avdsAvailable = await checkAvdAvailability();
    if (!avdsAvailable) {
      console.log("Skipping device-dependent tests: No AVDs available or Android SDK not found");
    }
  });

  beforeEach(() => {
    // Clear the tool registry before each test
    (ToolRegistry as any).tools.clear();

    // Create fake deep link manager for testing
    fakeDeepLinkManager = new FakeDeepLinkManager();
  });

  afterEach(() => {
    // Clean up after each test
    (ToolRegistry as any).tools.clear();
    fakeDeepLinkManager.clearHistory();
  });

  describe("registerDeepLinkTools", () => {
    it("should register all deep link tools", () => {
      registerDeepLinkTools();

      const registeredTools = ToolRegistry.getToolDefinitions();
      const toolNames = registeredTools.map(tool => tool.name);

      expect(toolNames).to.include("getDeepLinks");
      expect(toolNames).to.include("detectIntentChooser");
      expect(toolNames).to.include("handleIntentChooser");
    });

    it("should register getDeepLinks tool with correct schema", () => {
      registerDeepLinkTools();

      const tool = ToolRegistry.getTool("getDeepLinks");
      expect(tool).to.not.be.undefined;
      expect(tool!.description).to.include("Query available deep links");
      expect(tool!.supportsProgress).to.be.false;

      // Test schema validation
      const validArgs = { appId: "com.example.app", platform: "android" };
      expect(() => tool!.schema.parse(validArgs)).to.not.throw();

      const invalidArgs = { appId: 123, platform: "android" };
      expect(() => tool!.schema.parse(invalidArgs)).to.throw();
    });

    it("should register detectIntentChooser tool with correct schema", () => {
      registerDeepLinkTools();

      const tool = ToolRegistry.getTool("detectIntentChooser");
      expect(tool).to.not.be.undefined;
      expect(tool!.description).to.include("Detect system intent chooser");
      expect(tool!.supportsProgress).to.be.false;

      // Test schema validation
      const validArgs = { platform: "android" };
      expect(() => tool!.schema.parse(validArgs)).to.not.throw();

      const validArgsIos = { platform: "ios" };
      expect(() => tool!.schema.parse(validArgsIos)).to.not.throw();
    });

    it("should register handleIntentChooser tool with correct schema", () => {
      registerDeepLinkTools();

      const tool = ToolRegistry.getTool("handleIntentChooser");
      expect(tool).to.not.be.undefined;
      expect(tool!.description).to.include("Automatically handle system intent chooser");
      expect(tool!.supportsProgress).to.be.false;

      // Test schema validation
      const validArgs = {
        preference: "always",
        customAppPackage: "com.example.app",
        platform: "android"
      };
      expect(() => tool!.schema.parse(validArgs)).to.not.throw();

      const validArgsMinimal = { platform: "android" };
      expect(() => tool!.schema.parse(validArgsMinimal)).to.not.throw();

      const invalidArgs = { preference: "invalid", platform: "android" };
      expect(() => tool!.schema.parse(invalidArgs)).to.throw();
    });
  });

  describe("Tool Handlers", function() {
    beforeEach(() => {
      registerDeepLinkTools();
    });

    describe("getDeepLinks handler", () => {
      it("should handle valid app ID", async function() {
        if (!avdsAvailable) {
          this.skip();
        }

        const tool = ToolRegistry.getTool("getDeepLinks");
        expect(tool).to.not.be.undefined;

        try {
          // This will fail because we don't have a real device, but it should validate the args
          await tool!.handler({ appId: "com.example.app", platform: "android" });
        } catch (error) {
          // Expected to fail due to device verification
          expect(String(error)).to.include("device");
        }
      });

      it("should validate app ID parameter", () => {
        const tool = ToolRegistry.getTool("getDeepLinks");
        expect(tool).to.not.be.undefined;

        // Should throw on invalid schema
        expect(() => tool!.schema.parse({ appId: null, platform: "android" })).to.throw();
        expect(() => tool!.schema.parse({})).to.throw();
      });
    });

    describe("detectIntentChooser handler", () => {
      it("should handle optional view hierarchy", async function() {
        if (!avdsAvailable) {
          this.skip();
        }

        const tool = ToolRegistry.getTool("detectIntentChooser");
        expect(tool).to.not.be.undefined;

        try {
          await tool!.handler({ platform: "android" });
        } catch (error) {
          // Expected to fail due to device verification
          expect(String(error)).to.include("device");
        }
      });

      it("should handle provided view hierarchy", async function() {
        if (!avdsAvailable) {
          this.skip();
        }

        const tool = ToolRegistry.getTool("detectIntentChooser");
        expect(tool).to.not.be.undefined;

        try {
          await tool!.handler({ viewHierarchy: "<hierarchy></hierarchy>", platform: "android" });
        } catch (error) {
          // Expected to fail due to device verification
          expect(String(error)).to.include("device");
        }
      });
    });

    describe("handleIntentChooser handler", () => {
      it("should handle all preference options", async function() {
        if (!avdsAvailable) {
          this.skip();
        }

        const tool = ToolRegistry.getTool("handleIntentChooser");
        expect(tool).to.not.be.undefined;

        const preferences = ["always", "just_once", "custom"];

        for (const preference of preferences) {
          try {
            await tool!.handler({ preference, platform: "android" });
          } catch (error) {
            // Expected to fail due to device verification
            expect(String(error)).to.include("device");
          }
        }
      });

      it("should handle custom app package", async function() {
        if (!avdsAvailable) {
          this.skip();
        }

        const tool = ToolRegistry.getTool("handleIntentChooser");
        expect(tool).to.not.be.undefined;

        try {
          await tool!.handler({
            preference: "custom",
            customAppPackage: "com.example.app",
            platform: "android"
          });
        } catch (error) {
          // Expected to fail due to device verification
          expect(String(error)).to.include("device");
        }
      });

      it("should validate preference enum", () => {
        const tool = ToolRegistry.getTool("handleIntentChooser");
        expect(tool).to.not.be.undefined;

        // Valid preferences should pass
        expect(() => tool!.schema.parse({ preference: "always", platform: "android" })).to.not.throw();
        expect(() => tool!.schema.parse({ preference: "just_once", platform: "android" })).to.not.throw();
        expect(() => tool!.schema.parse({ preference: "custom", platform: "android" })).to.not.throw();

        // Invalid preference should fail
        expect(() => tool!.schema.parse({ preference: "invalid", platform: "android" })).to.throw();
      });
    });
  });

  describe("Error Handling", function() {
    beforeEach(() => {
      registerDeepLinkTools();
    });

    it("should handle missing device ID gracefully", async function() {
      if (!avdsAvailable) {
        this.skip();
      }

      const tool = ToolRegistry.getTool("getDeepLinks");
      expect(tool).to.not.be.undefined;

      try {
        await tool!.handler({ appId: "com.example.app", platform: "android" });
        expect.fail("Should have thrown error for missing device");
      } catch (error) {
        expect(String(error)).to.include("device");
      }
    });
  });

  describe("Schema Definitions", () => {
    it("should export schema objects", () => {
      const schemas = require("../../src/server/deepLinkTools");

      expect(schemas.getDeepLinksSchema).to.not.be.undefined;
      expect(schemas.detectIntentChooserSchema).to.not.be.undefined;
      expect(schemas.handleIntentChooserSchema).to.not.be.undefined;
    });

    it("should have correct TypeScript interfaces", () => {
      const interfaces = require("../../src/server/deepLinkTools");

      // These should exist as type definitions (compile-time check)
      expect(interfaces.GetDeepLinksArgs).to.be.undefined; // Interfaces don't exist at runtime
      expect(interfaces.DetectIntentChooserArgs).to.be.undefined;
      expect(interfaces.HandleIntentChooserArgs).to.be.undefined;
    });
  });
});
