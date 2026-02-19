import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { registerStorageTools } from "../../src/server/storageTools";
import { ToolRegistry } from "../../src/server/toolRegistry";

describe("Storage Tools Registration", () => {
  beforeEach(() => {
    (ToolRegistry as any).tools.clear();
  });

  afterEach(() => {
    (ToolRegistry as any).tools.clear();
  });

  test("registers all three storage write tools", () => {
    registerStorageTools();

    const toolNames = ToolRegistry.getToolDefinitions().map(t => t.name);
    expect(toolNames).toContain("setKeyValue");
    expect(toolNames).toContain("removeKeyValue");
    expect(toolNames).toContain("clearKeyValueFile");
  });

  describe("setKeyValue schema", () => {
    test("accepts valid arguments", () => {
      registerStorageTools();
      const tool = ToolRegistry.getTool("setKeyValue");
      expect(tool).toBeDefined();

      expect(() => tool!.schema.parse({
        platform: "android",
        appId: "com.example.app",
        fileName: "user_prefs",
        key: "dark_mode",
        value: "true",
        type: "BOOLEAN",
      })).not.toThrow();
    });

    test("accepts null value", () => {
      registerStorageTools();
      const tool = ToolRegistry.getTool("setKeyValue");

      expect(() => tool!.schema.parse({
        platform: "android",
        appId: "com.example.app",
        fileName: "user_prefs",
        key: "some_key",
        value: null,
        type: "STRING",
      })).not.toThrow();
    });

    test("rejects missing required fields", () => {
      registerStorageTools();
      const tool = ToolRegistry.getTool("setKeyValue");

      // Missing key
      expect(() => tool!.schema.parse({
        platform: "android",
        appId: "com.example.app",
        fileName: "user_prefs",
        value: "true",
        type: "BOOLEAN",
      })).toThrow();

      // Missing appId
      expect(() => tool!.schema.parse({
        platform: "android",
        fileName: "user_prefs",
        key: "dark_mode",
        value: "true",
        type: "BOOLEAN",
      })).toThrow();
    });

    test("rejects invalid type", () => {
      registerStorageTools();
      const tool = ToolRegistry.getTool("setKeyValue");

      expect(() => tool!.schema.parse({
        platform: "android",
        appId: "com.example.app",
        fileName: "user_prefs",
        key: "dark_mode",
        value: "true",
        type: "INVALID_TYPE",
      })).toThrow();
    });

    test("accepts all valid KeyValueType values", () => {
      registerStorageTools();
      const tool = ToolRegistry.getTool("setKeyValue");

      const validTypes = ["STRING", "INT", "LONG", "FLOAT", "BOOLEAN", "STRING_SET"];
      for (const type of validTypes) {
        expect(() => tool!.schema.parse({
          platform: "android",
          appId: "com.example.app",
          fileName: "prefs",
          key: "k",
          value: "v",
          type,
        })).not.toThrow();
      }
    });
  });

  describe("removeKeyValue schema", () => {
    test("accepts valid arguments", () => {
      registerStorageTools();
      const tool = ToolRegistry.getTool("removeKeyValue");
      expect(tool).toBeDefined();

      expect(() => tool!.schema.parse({
        platform: "android",
        appId: "com.example.app",
        fileName: "user_prefs",
        key: "dark_mode",
      })).not.toThrow();
    });

    test("rejects missing required fields", () => {
      registerStorageTools();
      const tool = ToolRegistry.getTool("removeKeyValue");

      // Missing key
      expect(() => tool!.schema.parse({
        platform: "android",
        appId: "com.example.app",
        fileName: "user_prefs",
      })).toThrow();
    });
  });

  describe("clearKeyValueFile schema", () => {
    test("accepts valid arguments", () => {
      registerStorageTools();
      const tool = ToolRegistry.getTool("clearKeyValueFile");
      expect(tool).toBeDefined();

      expect(() => tool!.schema.parse({
        platform: "android",
        appId: "com.example.app",
        fileName: "user_prefs",
      })).not.toThrow();
    });

    test("rejects missing required fields", () => {
      registerStorageTools();
      const tool = ToolRegistry.getTool("clearKeyValueFile");

      // Missing fileName
      expect(() => tool!.schema.parse({
        platform: "android",
        appId: "com.example.app",
      })).toThrow();
    });
  });
});
