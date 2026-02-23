import { beforeAll, describe, expect, test } from "bun:test";
import { createMcpServer } from "../../../src/server/index";
import { ToolRegistry } from "../../../src/server/toolRegistry";

describe("MCP Tools Registry", () => {
  beforeAll(() => {
    createMcpServer();
  });

  test("should expose all required MCP tools through the registry", () => {
    // Test that the server exposes MCP tools correctly
    const toolDefinitions = ToolRegistry.getToolDefinitions();
    expect(Array.isArray(toolDefinitions)).toBe(true);
    expect(toolDefinitions.length).toBeGreaterThan(0);

    // Verify we have the expected tool categories for MCP protocol
    const toolNames = toolDefinitions.map(tool => tool.name);

    // Should include observe tools (core MCP functionality)
    expect(toolNames).toContain("observe");

    // Should include interaction tools (MCP touch/gesture tools)
    expect(toolNames).toContain("tapOn");

    // Should include app management tools (MCP app lifecycle)
    expect(toolNames).toContain("launchApp");
    expect(toolNames).toContain("terminateApp");
    expect(toolNames).toContain("listApps");

  });

  test("should maintain singleton registry across server instances", () => {
    // This tests the MCP initialization pattern
    createMcpServer();

    const tools1 = ToolRegistry.getToolDefinitions();
    const tools2 = ToolRegistry.getToolDefinitions();

    // Both should reference the same registry (MCP pattern)
    expect(tools1.length).toBe(tools2.length);
    expect(tools1.map(t => t.name).sort()).toEqual(tools2.map(t => t.name).sort());

    // Registry should be consistent
    expect(ToolRegistry.getAllTools().length).toBe(tools1.length);
  });

  test("should provide tools that can be executed (handler functions exist)", () => {
    const allTools = ToolRegistry.getAllTools();

    // Each registered tool should have an executable handler
    allTools.forEach(tool => {
      expect(tool).toHaveProperty("handler");
      expect(typeof tool.handler).toBe("function");

      // Should also have a schema for validation
      expect(tool).toHaveProperty("schema");
      expect(typeof tool.schema).toBe("object");
    });
  });

  test("should register all tool categories", () => {
    const toolDefinitions = ToolRegistry.getToolDefinitions();
    const toolNames = toolDefinitions.map(tool => tool.name);

    // Verify all expected tool categories are registered
    const expectedCategories = {
      // Observe tools (screen observation and data collection)
      observe: ["observe"],

      // Interaction tools (touch, gestures, input)
      interaction: ["tapOn", "sendText", "pressButton", "swipeOn"],

      // App management tools (lifecycle management)
      app: ["launchApp", "terminateApp", "installApp", "listApps"],

      // Utility tools (device state and configuration)
      utility: ["changeOrientation", "setActiveDevice", "openUrl", "exitDialog"],

      // Emulator tools (AVD management)
      emulator: ["listDeviceImages", "checkRunningDevices", "startDevice", "killDevice"]
    };

    // Check that each category has at least one tool registered
    Object.entries(expectedCategories).forEach(([category, expectedTools]) => {
      const categoryToolsFound = expectedTools.filter(toolName => toolNames.includes(toolName));
      expect(categoryToolsFound.length).toBeGreaterThan(0,
                                                        `No tools found for ${category} category. Expected: ${expectedTools.join(", ")}`);
    });

    // Verify specific core tools are present
    expect(toolNames).toContain("observe", "observe tool should be registered");
    expect(toolNames).toContain("tapOn", "tapOn tool should be registered");

    // Verify total tool count is reasonable (should have tools from all categories)
    expect(toolDefinitions.length).toBeGreaterThan(15, "Should have a substantial number of tools registered");
  });
});
