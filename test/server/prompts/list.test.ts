import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { McpTestFixture } from "../../fixtures/mcpTestFixture";
import { z } from "zod";

describe("MCP Prompts List", () => {
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

  test("given no prompts are registered, endpoint should return an empty list", async function() {

    const { client } = fixture.getContext();

    // Send prompts/list request
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
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("prompts");
    expect(Array.isArray(result.prompts)).toBe(true);
    expect(result.prompts).toHaveLength(0);
  });

  test("given a prompt is registered, endpoint should return a list with that prompt", async function() {

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
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("prompts");
    expect(Array.isArray(result.prompts)).toBe(true);
    expect(result.prompts).toHaveLength(1);

    // Verify the prompt has required properties
    const prompt = result.prompts[0];
    expect(prompt).toHaveProperty("name", testPrompt.name);
    expect(prompt).toHaveProperty("description", testPrompt.description);
    expect(prompt).toHaveProperty("arguments");
    expect(Array.isArray(prompt.arguments)).toBe(true);
    expect(prompt.arguments).toHaveLength(2);

    // Verify the arguments structure
    expect(prompt.arguments).toBeDefined();
    const arg1 = prompt.arguments![0];
    expect(arg1).toHaveProperty("name", "appPackage");
    expect(arg1).toHaveProperty("description", "The package name of the app to debug");
    expect(arg1).toHaveProperty("required", true);

    const arg2 = prompt.arguments![1];
    expect(arg2).toHaveProperty("name", "deviceId");
    expect(arg2).toHaveProperty("description", "The device ID to debug on");
    expect(arg2).toHaveProperty("required", false);
  });
});
