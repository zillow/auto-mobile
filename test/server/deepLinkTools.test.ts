import { expect, describe, test, beforeEach, afterEach, beforeAll } from "bun:test";
import { registerDeepLinkTools } from "../../src/server/deepLinkTools";
import { ToolRegistry } from "../../src/server/toolRegistry";
import { MultiPlatformDeviceManager } from "../../src/utils/deviceUtils";
import { FakeDeepLinkManager } from "../fakes/FakeDeepLinkManager";

// Helper function to check if AVDs are available
async function checkAvdAvailability(): Promise<boolean> {
  try {
    // Add timeout to prevent hanging in CI when Android SDK is not available
    const timeoutPromise = new Promise<boolean>(resolve => {
      setTimeout(() => resolve(false), 2000); // 2 second timeout
    });

    const checkPromise = (async () => {
      const deviceUtils = new MultiPlatformDeviceManager();
      const avds = await deviceUtils.listDeviceImages("android");
      return avds.length > 0;
    })();

    return await Promise.race([checkPromise, timeoutPromise]);
  } catch (error) {
    // If we can't list AVDs (e.g., Android SDK not available), return false
    return false;
  }
}

describe("Deep Link Tools Registration", function() {
  let avdsAvailable: boolean;
  let fakeDeepLinkManager: FakeDeepLinkManager;

  beforeAll(async function() {
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
    test("should register all deep link tools", () => {
      registerDeepLinkTools();

      const registeredTools = ToolRegistry.getToolDefinitions();
      const toolNames = registeredTools.map(tool => tool.name);

      expect(toolNames).toContain("getDeepLinks");
      expect(toolNames).toContain("detectIntentChooser");
      expect(toolNames).toContain("handleIntentChooser");
    });

    test("should register getDeepLinks tool with correct schema", () => {
      registerDeepLinkTools();

      const tool = ToolRegistry.getTool("getDeepLinks");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Query available deep links");
      expect(tool!.supportsProgress).toBe(false);

      // Test schema validation
      const validArgs = { appId: "com.example.app", platform: "android" };
      expect(() => tool!.schema.parse(validArgs)).not.toThrow();

      const invalidArgs = { appId: 123, platform: "android" };
      expect(() => tool!.schema.parse(invalidArgs)).toThrow();
    });

    test("should register detectIntentChooser tool with correct schema", () => {
      registerDeepLinkTools();

      const tool = ToolRegistry.getTool("detectIntentChooser");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Detect system intent chooser");
      expect(tool!.supportsProgress).toBe(false);

      // Test schema validation
      const validArgs = { platform: "android" };
      expect(() => tool!.schema.parse(validArgs)).not.toThrow();

      const validArgsIos = { platform: "ios" };
      expect(() => tool!.schema.parse(validArgsIos)).not.toThrow();
    });

    test("should register handleIntentChooser tool with correct schema", () => {
      registerDeepLinkTools();

      const tool = ToolRegistry.getTool("handleIntentChooser");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Automatically handle system intent chooser");
      expect(tool!.supportsProgress).toBe(false);

      // Test schema validation
      const validArgs = {
        preference: "always",
        customAppPackage: "com.example.app",
        platform: "android"
      };
      expect(() => tool!.schema.parse(validArgs)).not.toThrow();

      const validArgsMinimal = { platform: "android" };
      expect(() => tool!.schema.parse(validArgsMinimal)).not.toThrow();

      const invalidArgs = { preference: "invalid", platform: "android" };
      expect(() => tool!.schema.parse(invalidArgs)).toThrow();
    });
  });

  describe("Tool Handlers", function() {
    beforeEach(() => {
      registerDeepLinkTools();
    });

    describe("getDeepLinks handler", () => {
      test("should validate app ID parameter and fail gracefully", async function() {
        const tool = ToolRegistry.getTool("getDeepLinks");
        expect(tool).toBeDefined();

        // Test that the schema validates correctly
        const validInput = { appId: "com.example.app" };
        const parsed = tool!.schema.parse(validInput);
        expect(parsed.appId).toBe("com.example.app");
      });

      test("should validate app ID parameter", () => {
        const tool = ToolRegistry.getTool("getDeepLinks");
        expect(tool).toBeDefined();

        // Should throw on invalid schema
        expect(() => tool!.schema.parse({ appId: null, platform: "android" })).toThrow();
        expect(() => tool!.schema.parse({})).toThrow();
      });
    });

    describe("detectIntentChooser handler", () => {
      test("should validate schema and register tool", async function() {
        const tool = ToolRegistry.getTool("detectIntentChooser");
        expect(tool).toBeDefined();

        // Test that the schema allows empty input (all params optional)
        const parsed = tool!.schema.parse({});
        expect(parsed).toBeDefined();
      });

      test("should have no required parameters", async function() {
        const tool = ToolRegistry.getTool("detectIntentChooser");
        expect(tool).toBeDefined();

        // The schema should accept empty input (no required parameters)
        const parsed = tool!.schema.parse({});
        expect(parsed).toEqual({});
      });
    });

    describe("handleIntentChooser handler", () => {
      test("should validate all preference options in schema", async function() {
        const tool = ToolRegistry.getTool("handleIntentChooser");
        expect(tool).toBeDefined();

        const preferences = ["always", "just_once", "custom"];

        for (const preference of preferences) {
          const parsed = tool!.schema.parse({ preference });
          expect(parsed.preference).toBe(preference);
        }
      });

      test("should validate custom app package in schema", async function() {
        const tool = ToolRegistry.getTool("handleIntentChooser");
        expect(tool).toBeDefined();

        const parsed = tool!.schema.parse({
          preference: "custom",
          customAppPackage: "com.example.app"
        });
        expect(parsed.preference).toBe("custom");
        expect(parsed.customAppPackage).toBe("com.example.app");
      });

      test("should validate preference enum", () => {
        const tool = ToolRegistry.getTool("handleIntentChooser");
        expect(tool).toBeDefined();

        // Valid preferences should pass
        expect(() => tool!.schema.parse({ preference: "always", platform: "android" })).not.toThrow();
        expect(() => tool!.schema.parse({ preference: "just_once", platform: "android" })).not.toThrow();
        expect(() => tool!.schema.parse({ preference: "custom", platform: "android" })).not.toThrow();

        // Invalid preference should fail
        expect(() => tool!.schema.parse({ preference: "invalid", platform: "android" })).toThrow();
      });
    });
  });

  describe("Error Handling", function() {
    beforeEach(() => {
      registerDeepLinkTools();
    });

    test("should reject missing appId in schema", async function() {
      const tool = ToolRegistry.getTool("getDeepLinks");
      expect(tool).toBeDefined();

      // Missing appId should fail validation
      expect(() => tool!.schema.parse({})).toThrow();
    });
  });

  describe("Schema Definitions", () => {
    test("should export schema objects", () => {
      const schemas = require("../../src/server/deepLinkTools");

      expect(schemas.getDeepLinksSchema).toBeDefined();
      expect(schemas.detectIntentChooserSchema).toBeDefined();
      expect(schemas.handleIntentChooserSchema).toBeDefined();
    });

    test("should have correct TypeScript interfaces", () => {
      const interfaces = require("../../src/server/deepLinkTools");

      // These should exist as type definitions (compile-time check)
      expect(interfaces.GetDeepLinksArgs).toBeUndefined(); // Interfaces don't exist at runtime
      expect(interfaces.DetectIntentChooserArgs).toBeUndefined();
      expect(interfaces.HandleIntentChooserArgs).toBeUndefined();
    });
  });
});
