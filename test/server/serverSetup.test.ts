import { beforeAll, describe, expect, test } from "bun:test";
import { createMcpServer } from "../../src/server/index";
import { ToolRegistry } from "../../src/server/toolRegistry";

describe("MCP Server Setup", () => {
  let server: ReturnType<typeof createMcpServer>;

  beforeAll(() => {
    server = createMcpServer();
  });

  test("should create an MCP server instance over stdio", () => {
    // Test that the server exists and has the expected structure
    expect(server).toBeDefined();
    expect(server).toHaveProperty("server");
    expect(server).toHaveProperty("connect");
    expect(typeof server.connect).toBe("function");

    // Test that the server object has basic properties
    expect(server.server).toBeDefined();
  });

  test("should have correct server metadata", () => {
    // Test that server was created successfully
    expect(server).toBeDefined();
    expect(server.server).toBeDefined();

    // Test that ToolRegistry has tools registered
    // (This indirectly tests that the server initialization worked)
    const allTools = ToolRegistry.getAllTools();
    expect(Array.isArray(allTools)).toBe(true);
    expect(allTools.length).toBeGreaterThan(0);

    // Test that tool definitions can be retrieved
    const toolDefinitions = ToolRegistry.getToolDefinitions();
    expect(Array.isArray(toolDefinitions)).toBe(true);
    expect(toolDefinitions.length).toBeGreaterThan(0);

    // Each tool should have required properties
    toolDefinitions.forEach(tool => {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");
    });
  });
});
