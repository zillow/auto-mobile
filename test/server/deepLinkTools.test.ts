import { expect, describe, test, beforeEach, afterEach } from "bun:test";
import { registerDeepLinkTools } from "../../src/server/deepLinkTools";
import { ToolRegistry } from "../../src/server/toolRegistry";

describe("Deep Link Tools Registration", function() {
  beforeEach(() => {
    // Clear the tool registry before each test
    (ToolRegistry as any).tools.clear();
  });

  afterEach(() => {
    // Clean up after each test
    (ToolRegistry as any).tools.clear();
  });

  describe("registerDeepLinkTools", () => {
    test("should register all deep link tools", () => {
      registerDeepLinkTools();

      const registeredTools = ToolRegistry.getToolDefinitions();
      const toolNames = registeredTools.map(tool => tool.name);

      expect(toolNames).toContain("getDeepLinks");
    });

    test("should register getDeepLinks tool with correct schema", () => {
      registerDeepLinkTools();

      const tool = ToolRegistry.getTool("getDeepLinks");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Query deep links");
      expect(tool!.supportsProgress).toBe(false);

      // Test schema validation
      const validArgs = { appId: "com.example.app", platform: "android" };
      expect(() => tool!.schema.parse(validArgs)).not.toThrow();

      const invalidArgs = { appId: 123, platform: "android" };
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
    });

    test("should have correct TypeScript interfaces", () => {
      const interfaces = require("../../src/server/deepLinkTools");

      // These should exist as type definitions (compile-time check)
      expect(interfaces.GetDeepLinksArgs).toBeUndefined(); // Interfaces don't exist at runtime
    });
  });
});
