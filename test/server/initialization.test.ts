import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { McpTestFixture } from "../fixtures/mcpTestFixture";
import { getMcpServerVersion } from "../../src/utils/mcpVersion";
import { z } from "zod";

describe("MCP Server Initialization", () => {
  let fixture: McpTestFixture;

  beforeAll(async () => {
    fixture = new McpTestFixture();
    await fixture.setup();
  });

  afterAll(async () => {
    if (fixture) {
      await fixture.teardown();
    }
  });

  test("should handle initialize endpoint request", async function() {
    const { client } = fixture.getContext();

    // Send initialize request
    const initializeResponseSchema = z.object({
      capabilities: z.object({
        resources: z.object({}),
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
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("capabilities");
    expect(result).toHaveProperty("serverInfo");

    // Verify capabilities structure
    expect(result.capabilities).toHaveProperty("resources");
    expect(result.capabilities).toHaveProperty("tools");

    // Verify server info
    expect(result.serverInfo).toHaveProperty("name", "AutoMobile");
    expect(result.serverInfo).toHaveProperty("version", getMcpServerVersion());
  });

});
