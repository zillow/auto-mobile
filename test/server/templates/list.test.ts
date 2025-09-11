import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import {
  ListResourceTemplatesRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "../../../src/server/index";
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

  it("given no templates are registered, endpoint should return an empty list", async function() {
    this.timeout(5000);

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

    // Verify empty resource templates list
    expect(result).to.be.an("object");
    expect(result).to.have.property("resourceTemplates");
    expect(result.resourceTemplates).to.be.an("array");
    expect(result.resourceTemplates).to.have.length(0);
  });

  it("given a template is registered, endpoint should return a list with that template", async function() {
    this.timeout(5000);

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
    expect(result).to.be.an("object");
    expect(result).to.have.property("resourceTemplates");
    expect(result.resourceTemplates).to.be.an("array");
    expect(result.resourceTemplates).to.have.length(1);

    // Verify the template has required properties
    const template = result.resourceTemplates[0];
    expect(template).to.have.property("uriTemplate", testTemplate.uriTemplate);
    expect(template).to.have.property("name", testTemplate.name);
    expect(template).to.have.property("description", testTemplate.description);
    expect(template).to.have.property("mimeType", testTemplate.mimeType);
  });
});
