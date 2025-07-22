import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
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

  it.skip("given a tool configured with text response, expect valid JSON structure", async function() {
    this.timeout(5000);

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
    expect(result).to.be.an("object");

    if (result.content) {
      expect(result.content).to.be.an("array");

      result.content.forEach((contentItem: any) => {
        expect(contentItem).to.have.property("type");
        expect(typeof contentItem.type).to.equal("string");

        // For text responses, should have text property
        if (contentItem.type === "text") {
          expect(contentItem).to.have.property("text");
          expect(typeof contentItem.text).to.equal("string");
        }
      });
    }

    // Test checkRunningEmulators which also doesn't require device connectivity
    const emulatorResult = await client.request({
      method: "tools/call",
      params: {
        name: "checkRunningEmulators",
        arguments: {}
      }
    }, toolResponseSchema);

    expect(emulatorResult).to.be.an("object");

    if (emulatorResult.content) {
      expect(emulatorResult.content).to.be.an("array");

      emulatorResult.content.forEach((contentItem: any) => {
        expect(contentItem).to.have.property("type");
        expect(typeof contentItem.type).to.equal("string");
      });
    }
  });
});
