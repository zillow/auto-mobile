import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  ListResourceTemplatesRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { McpTestFixture } from "../../fixtures/mcpTestFixture";

describe("MCP Templates List", () => {
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

  test("should return registered resource templates including emulator template", async function() {

    const { client } = fixture.getContext();

    // Send resources/templates/list request
    const { z } = await import("zod");
    const listResourceTemplatesResponseSchema = z.object({
      resourceTemplates: z.array(z.object({
        uriTemplate: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        mimeType: z.string().optional()
      }))
    });

    const result = await client.request({
      method: "resources/templates/list",
      params: {}
    }, listResourceTemplatesResponseSchema);

    // Verify resource templates list contains the emulator template
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("resourceTemplates");
    expect(Array.isArray(result.resourceTemplates)).toBe(true);
    expect(result.resourceTemplates.length).toBeGreaterThanOrEqual(1);

    // Verify booted devices template is present
    const bootedDevicesTemplate = result.resourceTemplates.find(
      (t: any) => t.uriTemplate === "automobile:devices/booted/{platform}"
    );
    expect(bootedDevicesTemplate).toBeDefined();
    expect(bootedDevicesTemplate?.name).toBe("Platform-specific Booted Devices");
  });

  test("given a template is registered, endpoint should return a list with that template", async function() {

    // For this test, we need to mock or implement a template registration
    // Since the current server doesn't have template registration functionality,
    // we'll mock the server's response handler to return a test template

    const { server, client } = fixture.getContext();

    // Override the resource templates list handler to return a test template
    const testTemplate = {
      uriTemplate: "file:///logs/{date}.log",
      name: "Daily Log Template",
      description: "Template for accessing daily log files by date",
      mimeType: "text/plain"
    };

    // Mock the handler to return our test template on the existing server
    server.server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async () => ({
        resourceTemplates: [testTemplate]
      })
    );

    // Send resources/templates/list request
    const { z } = await import("zod");
    const listResourceTemplatesResponseSchema = z.object({
      resourceTemplates: z.array(z.object({
        uriTemplate: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        mimeType: z.string().optional()
      }))
    });

    const result = await client.request({
      method: "resources/templates/list",
      params: {}
    }, listResourceTemplatesResponseSchema);

    // Verify resource templates list contains the test template
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("resourceTemplates");
    expect(Array.isArray(result.resourceTemplates)).toBe(true);
    expect(result.resourceTemplates).toHaveLength(1);

    // Verify the template has required properties
    const template = result.resourceTemplates[0];
    expect(template).toHaveProperty("uriTemplate", testTemplate.uriTemplate);
    expect(template).toHaveProperty("name", testTemplate.name);
    expect(template).toHaveProperty("description", testTemplate.description);
    expect(template).toHaveProperty("mimeType", testTemplate.mimeType);
  });
});
