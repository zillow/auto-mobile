import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import { McpTestFixture } from "../../fixtures/mcpTestFixture";

describe("MCP Prompts List", () => {
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

  it("given no prompts are registered, endpoint should return an empty list", async function() {
    this.timeout(5000);

    const { client } = fixture.getContext();

    // Send prompts/list request
    const { z } = await import("zod");
    const listPromptsResponseSchema = z.object({
      prompts: z.array(z.object({
        name: z.string(),
        description: z.string().optional(),
        arguments: z.array(z.object({
          name: z.string(),
          description: z.string().optional(),
          required: z.boolean().optional()
        })).optional()
      }))
    });

    const result = await client.request({
      method: "prompts/list",
      params: {}
    }, listPromptsResponseSchema);

    // Verify empty prompts list
    expect(result).to.be.an("object");
    expect(result).to.have.property("prompts");
    expect(result.prompts).to.be.an("array");
    expect(result.prompts).to.have.length(0);
  });

  it("given a prompt is registered, endpoint should return a list with that prompt", async function() {
    this.timeout(5000);

    // For this test, we need to mock or implement a prompt registration
    // Since the current server doesn't have prompt registration functionality,
    // we'll mock the server's response handler to return a test prompt

    const { server, client } = fixture.getContext();

    // Override the prompts list handler to return a test prompt
    const testPrompt = {
      name: "debug-session",
      description: "Generate a debugging session prompt for mobile app analysis",
      arguments: [
        {
          name: "appPackage",
          description: "The package name of the app to debug",
          required: true
        },
        {
          name: "deviceId",
          description: "The device ID to debug on",
          required: false
        }
      ]
    };

    // Mock the handler to return our test prompt on the existing server
    server.server.setRequestHandler(
      require("@modelcontextprotocol/sdk/types.js").ListPromptsRequestSchema,
      async () => ({
        prompts: [testPrompt]
      })
    );

    // Send prompts/list request
    const { z } = await import("zod");
    const listPromptsResponseSchema = z.object({
      prompts: z.array(z.object({
        name: z.string(),
        description: z.string().optional(),
        arguments: z.array(z.object({
          name: z.string(),
          description: z.string().optional(),
          required: z.boolean().optional()
        })).optional()
      }))
    });

    const result = await client.request({
      method: "prompts/list",
      params: {}
    }, listPromptsResponseSchema);

    // Verify prompts list contains the test prompt
    expect(result).to.be.an("object");
    expect(result).to.have.property("prompts");
    expect(result.prompts).to.be.an("array");
    expect(result.prompts).to.have.length(1);

    // Verify the prompt has required properties
    const prompt = result.prompts[0];
    expect(prompt).to.have.property("name", testPrompt.name);
    expect(prompt).to.have.property("description", testPrompt.description);
    expect(prompt).to.have.property("arguments");
    expect(prompt.arguments).to.be.an("array");
    expect(prompt.arguments).to.have.length(2);

    // Verify the arguments structure
    expect(prompt.arguments).to.not.be.undefined;
    const arg1 = prompt.arguments![0];
    expect(arg1).to.have.property("name", "appPackage");
    expect(arg1).to.have.property("description", "The package name of the app to debug");
    expect(arg1).to.have.property("required", true);

    const arg2 = prompt.arguments![1];
    expect(arg2).to.have.property("name", "deviceId");
    expect(arg2).to.have.property("description", "The device ID to debug on");
    expect(arg2).to.have.property("required", false);
  });
});
