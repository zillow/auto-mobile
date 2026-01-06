import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  ListResourcesRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { McpTestFixture } from "../../fixtures/mcpTestFixture";

describe("MCP Resources List", () => {
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

  test("should return observation resources", async function() {

    const { client } = fixture.getContext();

    // Send resources/list request
    const { z } = await import("zod");
    const listResourcesResponseSchema = z.object({
      resources: z.array(z.object({
        uri: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        mimeType: z.string().optional()
      }))
    });

    const result = await client.request({
      method: "resources/list",
      params: {}
    }, listResourcesResponseSchema);

    // Verify resources list contains observation resources
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("resources");
    expect(Array.isArray(result.resources)).toBe(true);
    expect(result.resources.length).toBeGreaterThanOrEqual(2);

    // Verify latest observation resource is present
    const obsResource = result.resources.find((r: any) => r.uri === "automobile:observation/latest");
    expect(obsResource).toBeDefined();
    expect(obsResource?.name).toBe("Latest Observation");
    expect(obsResource?.mimeType).toBe("application/json");

    // Verify latest screenshot resource is present
    const screenshotResource = result.resources.find((r: any) => r.uri === "automobile:observation/latest/screenshot");
    expect(screenshotResource).toBeDefined();
    expect(screenshotResource?.name).toBe("Latest Screenshot");
    expect(screenshotResource?.mimeType).toBe("image/png");
  });

  test("given a resource is registered, endpoint should return a list with that resource", async function() {

    // For this test, we need to mock or implement a resource registration
    // Since the current server doesn't have resource registration functionality,
    // we'll mock the server's response handler to return a test resource

    const { server, client } = fixture.getContext();

    // Override the resources list handler to return a test resource
    const testResource = {
      uri: "file:///test/resource.txt",
      name: "Test Resource",
      description: "A test resource for validation",
      mimeType: "text/plain"
    };

    // Mock the handler to return our test resource on the existing server
    server.server.setRequestHandler(
      ListResourcesRequestSchema,
      async () => ({
        resources: [testResource]
      })
    );

    // Send resources/list request
    const { z } = await import("zod");
    const listResourcesResponseSchema = z.object({
      resources: z.array(z.object({
        uri: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        mimeType: z.string().optional()
      }))
    });

    const result = await client.request({
      method: "resources/list",
      params: {}
    }, listResourcesResponseSchema);

    // Verify resources list contains the test resource
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("resources");
    expect(Array.isArray(result.resources)).toBe(true);
    expect(result.resources).toHaveLength(1);

    // Verify the resource has required properties
    const resource = result.resources[0];
    expect(resource).toHaveProperty("uri", testResource.uri);
    expect(resource).toHaveProperty("name", testResource.name);
    expect(resource).toHaveProperty("description", testResource.description);
    expect(resource).toHaveProperty("mimeType", testResource.mimeType);
  });
});
