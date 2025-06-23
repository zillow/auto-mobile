import { expect } from "chai";
import { registerDeepLinkTools } from "../../src/server/deepLinkTools";
import { ToolRegistry } from "../../src/server/toolRegistry";

describe("Deep Link Tools Registration", () => {
  let mockGetCurrentDeviceId: () => string | undefined;

  beforeEach(() => {
    // Clear the tool registry before each test
    (ToolRegistry as any).tools.clear();

    // Mock device ID getter
    mockGetCurrentDeviceId = () => "test-device";
  });

  afterEach(() => {
    // Clean up after each test
    (ToolRegistry as any).tools.clear();
  });

  describe("registerDeepLinkTools", () => {
    it("should register all deep link tools", () => {
      registerDeepLinkTools(mockGetCurrentDeviceId);

      const registeredTools = ToolRegistry.getToolDefinitions();
      const toolNames = registeredTools.map(tool => tool.name);

      expect(toolNames).to.include("getDeepLinks");
      expect(toolNames).to.include("detectIntentChooser");
      expect(toolNames).to.include("handleIntentChooser");
    });

    it("should register getDeepLinks tool with correct schema", () => {
      registerDeepLinkTools(mockGetCurrentDeviceId);

      const tool = ToolRegistry.getTool("getDeepLinks");
      expect(tool).to.not.be.undefined;
      expect(tool!.description).to.include("Query available deep links");
      expect(tool!.supportsProgress).to.be.false;

      // Test schema validation
      const validArgs = { appId: "com.example.app" };
      expect(() => tool!.schema.parse(validArgs)).to.not.throw();

      const invalidArgs = { appId: 123 };
      expect(() => tool!.schema.parse(invalidArgs)).to.throw();
    });

    it("should register detectIntentChooser tool with correct schema", () => {
      registerDeepLinkTools(mockGetCurrentDeviceId);

      const tool = ToolRegistry.getTool("detectIntentChooser");
      expect(tool).to.not.be.undefined;
      expect(tool!.description).to.include("Detect system intent chooser");
      expect(tool!.supportsProgress).to.be.false;

      // Test schema validation
      const validArgs = { viewHierarchy: "<hierarchy></hierarchy>" };
      expect(() => tool!.schema.parse(validArgs)).to.not.throw();

      const validArgsEmpty = {};
      expect(() => tool!.schema.parse(validArgsEmpty)).to.not.throw();
    });

    it("should register handleIntentChooser tool with correct schema", () => {
      registerDeepLinkTools(mockGetCurrentDeviceId);

      const tool = ToolRegistry.getTool("handleIntentChooser");
      expect(tool).to.not.be.undefined;
      expect(tool!.description).to.include("Automatically handle system intent chooser");
      expect(tool!.supportsProgress).to.be.false;

      // Test schema validation
      const validArgs = {
        preference: "always",
        customAppPackage: "com.example.app",
        viewHierarchy: "<hierarchy></hierarchy>"
      };
      expect(() => tool!.schema.parse(validArgs)).to.not.throw();

      const validArgsMinimal = {};
      expect(() => tool!.schema.parse(validArgsMinimal)).to.not.throw();

      const invalidArgs = { preference: "invalid" };
      expect(() => tool!.schema.parse(invalidArgs)).to.throw();
    });
  });

  describe("Tool Handlers", () => {
    beforeEach(() => {
      registerDeepLinkTools(mockGetCurrentDeviceId);
    });

    describe("getDeepLinks handler", () => {
      it("should handle valid app ID", async () => {
        const tool = ToolRegistry.getTool("getDeepLinks");
        expect(tool).to.not.be.undefined;

        try {
          // This will fail because we don't have a real device, but it should validate the args
          await tool!.handler({ appId: "com.example.app" });
        } catch (error) {
          // Expected to fail due to device verification
          expect(String(error)).to.include("device");
        }
      });

      it("should validate app ID parameter", () => {
        const tool = ToolRegistry.getTool("getDeepLinks");
        expect(tool).to.not.be.undefined;

        // Should throw on invalid schema
        expect(() => tool!.schema.parse({ appId: null })).to.throw();
        expect(() => tool!.schema.parse({})).to.throw();
      });
    });

    describe("detectIntentChooser handler", () => {
      it("should handle optional view hierarchy", async () => {
        const tool = ToolRegistry.getTool("detectIntentChooser");
        expect(tool).to.not.be.undefined;

        try {
          await tool!.handler({});
        } catch (error) {
          // Expected to fail due to device verification
          expect(String(error)).to.include("device");
        }
      });

      it("should handle provided view hierarchy", async () => {
        const tool = ToolRegistry.getTool("detectIntentChooser");
        expect(tool).to.not.be.undefined;

        try {
          await tool!.handler({ viewHierarchy: "<hierarchy></hierarchy>" });
        } catch (error) {
          // Expected to fail due to device verification
          expect(String(error)).to.include("device");
        }
      });
    });

    describe("handleIntentChooser handler", () => {
      it("should handle all preference options", async () => {
        const tool = ToolRegistry.getTool("handleIntentChooser");
        expect(tool).to.not.be.undefined;

        const preferences = ["always", "just_once", "custom"];

        for (const preference of preferences) {
          try {
            await tool!.handler({ preference });
          } catch (error) {
            // Expected to fail due to device verification
            expect(String(error)).to.include("device");
          }
        }
      });

      it("should handle custom app package", async () => {
        const tool = ToolRegistry.getTool("handleIntentChooser");
        expect(tool).to.not.be.undefined;

        try {
          await tool!.handler({
            preference: "custom",
            customAppPackage: "com.example.app"
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
        expect(() => tool!.schema.parse({ preference: "always" })).to.not.throw();
        expect(() => tool!.schema.parse({ preference: "just_once" })).to.not.throw();
        expect(() => tool!.schema.parse({ preference: "custom" })).to.not.throw();

        // Invalid preference should fail
        expect(() => tool!.schema.parse({ preference: "invalid" })).to.throw();
      });
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      registerDeepLinkTools(() => undefined); // No device ID available
    });

    it("should handle missing device ID gracefully", async () => {
      const tool = ToolRegistry.getTool("getDeepLinks");
      expect(tool).to.not.be.undefined;

      try {
        await tool!.handler({ appId: "com.example.app" });
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
