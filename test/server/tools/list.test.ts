import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createMcpServer } from "../../../src/server/index";
import { ToolRegistry } from "../../../src/server/toolRegistry";
import { McpTestFixture } from "../../fixtures/mcpTestFixture";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { FakeToolRegistry } from "../../fakes/FakeToolRegistry";

describe("MCP Tools List", () => {
  let fixture: McpTestFixture;

  beforeEach(async () => {
    fixture = new McpTestFixture();
    await fixture.setup();
  });

  afterEach(async () => {
    if (fixture) {
      await fixture.teardown();
    }
  });

  test("given no tools are registered, endpoint should return an empty list", async function() {

    // Create fake registry with no tools registered
    const fakeRegistry = new FakeToolRegistry();

    // Save original method
    const originalGetToolDefinitions = ToolRegistry.getToolDefinitions;

    // Replace with fake that returns no tools
    (ToolRegistry as any).getToolDefinitions = () => fakeRegistry.getTools();

    try {
      // Create server using createMcpServer()
      const server = createMcpServer();

      // Create linked in-memory transports for client-server communication
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

      // Connect server to its transport
      await server.connect(serverTransport);

      // Create client using the linked transport
      const client = new Client({
        name: "test-client",
        version: "0.0.1"
      });

      await client.connect(clientTransport);

      // Send list_tools request
      const { z } = await import("zod");
      const listToolsResponseSchema = z.object({
        tools: z.array(z.object({
          name: z.string(),
          description: z.string(),
          inputSchema: z.object({}).passthrough()
        }))
      });

      const result = await client.request({
        method: "tools/list",
        params: {}
      }, listToolsResponseSchema);

      // Verify empty tools list
      expect(typeof result).toBe("object");
      expect(result).toHaveProperty("tools");
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools).toHaveLength(0);

      await client.close();
    } finally {
      // Restore the original method
      (ToolRegistry as any).getToolDefinitions = originalGetToolDefinitions;
    }
  });

  test("given a tool is registered, endpoint should return a list with that tool", async function() {
    const { client } = fixture.getContext();

    // Send list_tools request
    const { z } = await import("zod");
    const listToolsResponseSchema = z.object({
      tools: z.array(z.object({
        name: z.string(),
        description: z.string(),
        inputSchema: z.object({}).passthrough()
      }))
    });

    const result = await client.request({
      method: "tools/list",
      params: {}
    }, listToolsResponseSchema);

    // Verify tools list contains registered tools
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("tools");
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools.length).toBeGreaterThan(0);

    // Verify each tool has required properties
    result.tools.forEach(tool => {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");
    });

    // Verify we have some expected tools (like observe, etc.)
    const toolNames = result.tools.map(tool => tool.name);
    expect(toolNames).toContain("observe");
    expect(toolNames).toContain("tapOn");
  });
});
