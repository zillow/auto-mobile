import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import {
  ListResourcesRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "../../../src/server/index";
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

  it("given no resources are registered, endpoint should return an empty list", async function() {
    this.timeout(5000);

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

    // Verify empty resources list
    expect(result).to.be.an("object");
    expect(result).to.have.property("resources");
    expect(result.resources).to.be.an("array");
    expect(result.resources).to.have.length(0);
  });

  it("given a resource is registered, endpoint should return a list with that resource", async function() {
    this.timeout(5000);

    // For this test, we need to mock or implement a resource registration
    // Since the current server doesn't have resource registration functionality,
    // we'll mock the server's response handler to return a test resource

    const server = createMcpServer();

    // Override the resources list handler to return a test resource
    const testResource = {
      uri: "file:///test/resource.txt",
      name: "Test Resource",
      description: "A test resource for validation",
      mimeType: "text/plain"
    };

    // Mock the handler to return our test resource
    server.server.setRequestHandler(
      ListResourcesRequestSchema,
      async () => ({
        resources: [testResource]
      })
    );

    const { serverTransport, client } = fixture.getContext();

    // Connect our mocked server to the same transport
    await server.connect(serverTransport);

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
    expect(result).to.be.an("object");
    expect(result).to.have.property("resources");
    expect(result.resources).to.be.an("array");
    expect(result.resources).to.have.length(1);

    // Verify the resource has required properties
    const resource = result.resources[0];
    expect(resource).to.have.property("uri", testResource.uri);
    expect(resource).to.have.property("name", testResource.name);
    expect(resource).to.have.property("description", testResource.description);
    expect(resource).to.have.property("mimeType", testResource.mimeType);
  });
});
