import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import { createMcpServer } from "../../../src/server/index";
import { ToolRegistry } from "../../../src/server/toolRegistry";
import { McpTestFixture } from "../../fixtures/mcpTestFixture";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import sinon from "sinon";

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

  it("given no tools are registered, endpoint should return an empty list", async function() {

    // Mock the ToolRegistry to return no tools
    const stub = sinon.stub(ToolRegistry, "getToolDefinitions").returns([]);

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
      expect(result).to.be.an("object");
      expect(result).to.have.property("tools");
      expect(result.tools).to.be.an("array");
      expect(result.tools).to.have.length(0);

      await client.close();
    } finally {
      // Restore the original method
      stub.restore();
    }
  });

  it("given a tool is registered, endpoint should return a list with that tool", async function() {
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
    expect(result).to.be.an("object");
    expect(result).to.have.property("tools");
    expect(result.tools).to.be.an("array");
    expect(result.tools.length).to.be.greaterThan(0);

    // Verify each tool has required properties
    result.tools.forEach(tool => {
      expect(tool).to.have.property("name");
      expect(tool).to.have.property("description");
      expect(tool).to.have.property("inputSchema");
      expect(typeof tool.name).to.equal("string");
      expect(typeof tool.description).to.equal("string");
      expect(typeof tool.inputSchema).to.equal("object");
    });

    // Verify we have some expected tools (like observe, etc.)
    const toolNames = result.tools.map(tool => tool.name);
    expect(toolNames).to.include("observe");
    expect(toolNames).to.include("tapOn");
  });
});
