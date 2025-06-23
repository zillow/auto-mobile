import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import { McpTestFixture } from "../fixtures/mcpTestFixture";

describe("MCP Server Initialization", () => {
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

  it("should handle initialize endpoint request", async function() {
    const { client } = fixture.getContext();

    // Send initialize request
    const { z } = await import("zod");
    const initializeResponseSchema = z.object({
      capabilities: z.object({
        resources: z.object({
          templates: z.object({})
        }),
        tools: z.object({})
      }),
      serverInfo: z.object({
        name: z.string(),
        version: z.string()
      })
    });

    const result = await client.request({
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {
          resources: {},
          tools: {}
        },
        clientInfo: {
          name: "test-client",
          version: "0.0.1"
        }
      }
    }, initializeResponseSchema);

    // Verify initialize response structure
    expect(result).to.be.an("object");
    expect(result).to.have.property("capabilities");
    expect(result).to.have.property("serverInfo");

    // Verify capabilities structure
    expect(result.capabilities).to.have.property("resources");
    expect(result.capabilities).to.have.property("tools");
    expect(result.capabilities.resources).to.have.property("templates");

    // Verify server info
    expect(result.serverInfo).to.have.property("name", "AutoMobile");
    expect(result.serverInfo).to.have.property("version", "0.0.1");
  });

});
