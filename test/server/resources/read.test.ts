import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { McpTestFixture } from "../../fixtures/mcpTestFixture";

describe("MCP Resources Read", () => {
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

  test("reading latest observation without prior observe should return error message", async function() {
    const { client } = fixture.getContext();

    // Send resources/read request
    const { z } = await import("zod");
    const readResourceResponseSchema = z.object({
      contents: z.array(z.object({
        uri: z.string(),
        mimeType: z.string().optional(),
        text: z.string().optional(),
        blob: z.string().optional()
      }))
    });

    const result = await client.request({
      method: "resources/read",
      params: {
        uri: "automobile://observation/latest"
      }
    }, readResourceResponseSchema);

    // Verify response structure
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("contents");
    expect(Array.isArray(result.contents)).toBe(true);
    expect(result.contents).toHaveLength(1);

    // Verify content
    const content = result.contents[0];
    expect(content.uri).toBe("automobile://observation/latest");
    expect(content.mimeType).toBe("application/json");
    expect(content.text).toBeDefined();

    // Parse and verify error message
    const data = JSON.parse(content.text!);
    expect(data).toHaveProperty("error");
    expect(data.error).toContain("No observation available");
  });

  test("reading latest screenshot resource", async function() {
    const { client } = fixture.getContext();

    // Send resources/read request
    const { z } = await import("zod");
    const readResourceResponseSchema = z.object({
      contents: z.array(z.object({
        uri: z.string(),
        mimeType: z.string().optional(),
        text: z.string().optional(),
        blob: z.string().optional()
      }))
    });

    const result = await client.request({
      method: "resources/read",
      params: {
        uri: "automobile://observation/latest/screenshot"
      }
    }, readResourceResponseSchema);

    // Verify response structure
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("contents");
    expect(Array.isArray(result.contents)).toBe(true);
    expect(result.contents).toHaveLength(1);

    // Verify content
    const content = result.contents[0];
    expect(content.uri).toBe("automobile://observation/latest/screenshot");

    // Content can be either an error message (if no screenshot) or actual image data
    if (content.mimeType === "application/json") {
      // No screenshot available
      expect(content.text).toBeDefined();
      const data = JSON.parse(content.text!);
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("No screenshot available");
    } else {
      // Screenshot available
      expect(content.mimeType).toMatch(/^image\/(png|webp)$/);
      expect(content.blob).toBeDefined();
      expect(content.blob!.length).toBeGreaterThan(0);
    }
  });

  test("reading non-existent resource should throw error", async function() {
    const { client } = fixture.getContext();

    // Send resources/read request for non-existent resource
    const { z } = await import("zod");
    const readResourceResponseSchema = z.object({
      contents: z.array(z.object({
        uri: z.string(),
        mimeType: z.string().optional(),
        text: z.string().optional(),
        blob: z.string().optional()
      }))
    });

    // Expect this to throw an error
    await expect(async () => {
      await client.request({
        method: "resources/read",
        params: {
          uri: "automobile://observation/invalid"
        }
      }, readResourceResponseSchema);
    }).toThrow();
  });
});
