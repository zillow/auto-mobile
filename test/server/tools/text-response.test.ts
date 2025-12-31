import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { McpTestFixture } from "../../fixtures/mcpTestFixture";

describe("MCP Tools Text Response", () => {
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

  test.skip("given a tool configured with text response, expect valid JSON structure", async function() {

    const { client } = fixture.getContext();

    const { z } = await import("zod");
    const toolResponseSchema = z.object({
      content: z.array(z.object({
        type: z.string(),
        text: z.string().optional(),
        data: z.any().optional()
      })).optional(),
      isError: z.boolean().optional()
    }).passthrough();

    // Test listDeviceImages tool which should return text response without device dependency
    const result = await client.request({
      method: "tools/call",
      params: {
        name: "listDeviceImages",
        arguments: {}
      }
    }, toolResponseSchema);

    // Verify response structure conforms to MCP text response format
    expect(typeof result).toBe("object");

    if (result.content) {
      expect(Array.isArray(result.content)).toBe(true);

      result.content.forEach((contentItem: any) => {
        expect(contentItem).toHaveProperty("type");
        expect(typeof contentItem.type).toBe("string");

        // For text responses, should have text property
        if (contentItem.type === "text") {
          expect(contentItem).toHaveProperty("text");
          expect(typeof contentItem.text).toBe("string");
        }
      });
    }

    // Test checkRunningDevices which also doesn't require device connectivity
    const emulatorResult = await client.request({
      method: "tools/call",
      params: {
        name: "checkRunningDevices",
        arguments: {}
      }
    }, toolResponseSchema);

    expect(typeof emulatorResult).toBe("object");

    if (emulatorResult.content) {
      expect(Array.isArray(emulatorResult.content)).toBe(true);

      emulatorResult.content.forEach((contentItem: any) => {
        expect(contentItem).toHaveProperty("type");
        expect(typeof contentItem.type).toBe("string");
      });
    }
  });
});
