import { describe, it } from "mocha";
import { expect } from "chai";
import { createMcpServer } from "../../../src/server/index";
import { ToolRegistry } from "../../../src/server/toolRegistry";

describe("MCP Tools Registry", () => {

  it("should expose all required MCP tools through the registry", () => {
    createMcpServer();

    // Test that the server exposes MCP tools correctly
    const toolDefinitions = ToolRegistry.getToolDefinitions();
    expect(Array.isArray(toolDefinitions)).to.be.true;
    expect(toolDefinitions.length).to.be.greaterThan(0);

    // Verify we have the expected tool categories for MCP protocol
    const toolNames = toolDefinitions.map(tool => tool.name);

    // Should include observe tools (core MCP functionality)
    expect(toolNames).to.include("observe");

    // Should include interaction tools (MCP touch/gesture tools)
    expect(toolNames).to.include("tapOn");

    // Should include app management tools (MCP app lifecycle)
    expect(toolNames).to.include("listApps");
    expect(toolNames).to.include("launchApp");

    // Should include device tools (MCP device management)
    expect(toolNames).to.include("listDevices");
  });

  it("should maintain singleton registry across server instances", () => {
    // This tests the MCP initialization pattern
    createMcpServer();
    createMcpServer();

    const tools1 = ToolRegistry.getToolDefinitions();
    const tools2 = ToolRegistry.getToolDefinitions();

    // Both should reference the same registry (MCP pattern)
    expect(tools1.length).to.equal(tools2.length);
    expect(tools1.map(t => t.name).sort()).to.deep.equal(tools2.map(t => t.name).sort());

    // Registry should be consistent
    expect(ToolRegistry.getAllTools().length).to.equal(tools1.length);
  });

  it("should provide tools that can be executed (handler functions exist)", () => {
    createMcpServer();

    const allTools = ToolRegistry.getAllTools();

    // Each registered tool should have an executable handler
    allTools.forEach(tool => {
      expect(tool).to.have.property("handler");
      expect(typeof tool.handler).to.equal("function");

      // Should also have a schema for validation
      expect(tool).to.have.property("schema");
      expect(typeof tool.schema).to.equal("object");
    });
  });

  it("should register all tool categories", () => {
    createMcpServer();
    const toolDefinitions = ToolRegistry.getToolDefinitions();
    const toolNames = toolDefinitions.map(tool => tool.name);

    // Verify all expected tool categories are registered
    const expectedCategories = {
      // Observe tools (screen observation and data collection)
      observe: ["observe"],

      // Interaction tools (touch, gestures, input)
      interaction: ["tapOn", "sendText", "pressButton", "swipeOnScreen", "swipeOnElement"],

      // App management tools (lifecycle management)
      app: ["listApps", "launchApp", "terminateApp", "installApp"],

      // Utility tools (device state and configuration)
      utility: ["changeOrientation", "setActiveDevice", "openUrl", "exitDialog", "enableDemoMode", "disableDemoMode"],

      // Emulator tools (AVD management)
      emulator: ["listDeviceImages", "listDevices", "checkRunningDevices", "startDevice", "killDevice"]
    };

    // Check that each category has at least one tool registered
    Object.entries(expectedCategories).forEach(([category, expectedTools]) => {
      const categoryToolsFound = expectedTools.filter(toolName => toolNames.includes(toolName));
      expect(categoryToolsFound.length).to.be.greaterThan(0,
                                                          `No tools found for ${category} category. Expected: ${expectedTools.join(", ")}`);
    });

    // Verify specific core tools are present
    expect(toolNames).to.include("observe", "observe tool should be registered");
    expect(toolNames).to.include("tapOn", "tapOn tool should be registered");
    expect(toolNames).to.include("listApps", "listApps tool should be registered");

    // Verify total tool count is reasonable (should have tools from all categories)
    expect(toolDefinitions.length).to.be.greaterThan(15, "Should have a substantial number of tools registered");
  });
});
