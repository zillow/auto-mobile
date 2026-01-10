import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { McpTestFixture } from "../../fixtures/mcpTestFixture";
import { ResourceRegistry } from "../../../src/server/resourceRegistry";
import { z } from "zod";

describe("MCP Resources List", () => {
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

  test("should return observation resources", async function() {

    const { client } = fixture.getContext();

    // Send resources/list request
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

    const { client } = fixture.getContext();

    const testResource = {
      uri: "automobile:test/resource",
      name: "Test Resource",
      description: "A test resource for validation",
      mimeType: "text/plain"
    };

    ResourceRegistry.register(
      testResource.uri,
      testResource.name,
      testResource.description,
      testResource.mimeType,
      async () => ({
        uri: testResource.uri,
        mimeType: testResource.mimeType,
        text: "ok"
      })
    );

    // Send resources/list request
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

    try {
      // Verify resources list contains the test resource
      expect(typeof result).toBe("object");
      expect(result).toHaveProperty("resources");
      expect(Array.isArray(result.resources)).toBe(true);

      const resource = result.resources.find((r: any) => r.uri === testResource.uri);
      expect(resource).toBeDefined();
      expect(resource).toHaveProperty("name", testResource.name);
      expect(resource).toHaveProperty("description", testResource.description);
      expect(resource).toHaveProperty("mimeType", testResource.mimeType);
    } finally {
      ResourceRegistry.unregister(testResource.uri);
    }
  });
});
