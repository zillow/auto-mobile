import { describe, it } from "mocha";
import { expect } from "chai";
import { createMcpServer } from "../../src/server/index";
import { ToolRegistry } from "../../src/server/toolRegistry";

describe("MCP Server Setup", () => {

  it("should create an MCP server instance over stdio", () => {
    const server = createMcpServer();

    // Test that the server exists and has the expected structure
    expect(server).to.not.be.undefined;
    expect(server).to.have.property("server");
    expect(server).to.have.property("connect");
    expect(typeof server.connect).to.equal("function");

    // Test that the server object has basic properties
    expect(server.server).to.not.be.undefined;
  });

  it("should have correct server metadata", () => {
    const server = createMcpServer();

    // Test that server was created successfully
    expect(server).to.not.be.undefined;
    expect(server.server).to.not.be.undefined;

    // Test that ToolRegistry has tools registered
    // (This indirectly tests that the server initialization worked)
    const allTools = ToolRegistry.getAllTools();
    expect(Array.isArray(allTools)).to.be.true;
    expect(allTools.length).to.be.greaterThan(0);

    // Test that tool definitions can be retrieved
    const toolDefinitions = ToolRegistry.getToolDefinitions();
    expect(Array.isArray(toolDefinitions)).to.be.true;
    expect(toolDefinitions.length).to.be.greaterThan(0);

    // Each tool should have required properties
    toolDefinitions.forEach(tool => {
      expect(tool).to.have.property("name");
      expect(tool).to.have.property("description");
      expect(tool).to.have.property("inputSchema");
      expect(typeof tool.name).to.equal("string");
      expect(typeof tool.description).to.equal("string");
      expect(typeof tool.inputSchema).to.equal("object");
    });
  });
});
