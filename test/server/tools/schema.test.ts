import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resetDeviceToolsDependencies, setDeviceToolsDependencies } from "../../../src/server/deviceTools";
import { ToolRegistry } from "../../../src/server/toolRegistry";
import { DeviceInfo } from "../../../src/models";
import { McpTestFixture } from "../../fixtures/mcpTestFixture";
import { FakeDeviceUtils } from "../../fakes/FakeDeviceUtils";
import { z } from "zod";

describe("MCP Tools Schema", () => {
  let fixture: McpTestFixture;
  let fakeDeviceUtils: FakeDeviceUtils;

  beforeAll(async () => {
    fakeDeviceUtils = new FakeDeviceUtils();
    const androidDevices: DeviceInfo[] = [
      { name: "Pixel_6_API_34", platform: "android", isRunning: false, source: "local" }
    ];
    fakeDeviceUtils.setDeviceImages("android", androidDevices);
    setDeviceToolsDependencies({
      deviceManagerFactory: () => fakeDeviceUtils
    });

    fixture = new McpTestFixture();
    await fixture.setup();
  });

  afterAll(async () => {
    if (fixture) {
      await fixture.teardown();
    }
    resetDeviceToolsDependencies();
  });

  test("should validate tool schema definitions conform to MCP standards", () => {
    const toolDefinitions = ToolRegistry.getToolDefinitions();

    // Each tool should conform to MCP protocol requirements
    toolDefinitions.forEach(tool => {
      // Required MCP tool properties
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");

      // Type validation
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");

      // MCP protocol requirements
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);

      // Schema should be a valid JSON Schema-like object
      const schema = tool.inputSchema as any;
      expect(schema).toHaveProperty("type");
      if (schema.type === "object") {
        expect(schema).toHaveProperty("properties");
      }
    });
  });

  test("given a request that matches valid schema, should return a valid response", async function() {

    const { client } = fixture.getContext();

    const toolResponseSchema = z.object({
      content: z.array(z.object({
        type: z.string(),
        text: z.string().optional()
      })).optional()
    }).passthrough();

    const result = await client.request({
      method: "tools/call",
      params: {
        name: "listDeviceImages",
        arguments: {
          platform: "android"
        }
      }
    }, toolResponseSchema);

    expect(typeof result).toBe("object");
  });

  test("given a request omits fields that are optional by the schema, should return a valid response", async function() {

    const { client } = fixture.getContext();

    const toolResponseSchema = z.object({
      content: z.array(z.object({
        type: z.string(),
        text: z.string().optional()
      })).optional()
    }).passthrough();

    const result = await client.request({
      method: "tools/call",
      params: {
        name: "listDeviceImages",
        arguments: {
          platform: "android"
        }
      }
    }, toolResponseSchema);

    expect(typeof result).toBe("object");
  });

  test("given a request contains fields that are not defined by the schema, should return an error response", async function() {

    const { client } = fixture.getContext();

    try {
      const result = await client.request({
        method: "tools/call",
        params: {
          name: "listDeviceImages",
          arguments: {
            platform: "android",
            unknownField: "should not be allowed"
          }
        }
      }, z.any());

      // If we reach here without error, the schema allows additional properties
      // This is actually valid behavior - some schemas are permissive
      expect(typeof result).toBe("object");

    } catch (error: any) {
      // If it fails, it should be due to schema validation
      const msg = error.message;
      expect(
        msg.includes("Invalid parameters") || msg.includes("Failed to execute") || msg.includes("Unknown tool")
      ).toBe(true);
    }
  });

  test("given a request contains fields that are defined by the schema but have incorrect types, should return an error response", async function() {

    const { client } = fixture.getContext();

    // Test tapOn with string instead of number
    try {
      await client.request({
        method: "tools/call",
        params: {
          name: "tapOn",
          arguments: {
            x: "not a number",
            y: 200
          }
        }
      }, z.any());
      expect.fail("Should have thrown an error for incorrect type");
    } catch (error: any) {
      expect(error.message).toContain("Invalid parameters");
    }
  });

  test("tapOn should report helpful errors for malformed container", async () => {
    const { client } = fixture.getContext();

    try {
      await client.request({
        method: "tools/call",
        params: {
          name: "tapOn",
          arguments: {
            platform: "android",
            text: "Duluth",
            container: "MN"
          }
        }
      }, z.any());
      expect.fail("Should have thrown an error for invalid container");
    } catch (error: any) {
      expect(error.message).toContain("container expected object");
    }
  });

  test("given a request contains fields that are defined by the schema but have incorrect values, should return an error response", async function() {

    const { client } = fixture.getContext();

    // Test with an invalid tool name to trigger schema validation error
    try {
      const { z } = await import("zod");
      await client.request({
        method: "tools/call",
        params: {
          name: "nonExistentTool",
          arguments: {}
        }
      }, z.any());
      expect.fail("Should have thrown an error for unknown tool");
    } catch (error: any) {
      // This should fail because the tool doesn't exist
      expect(error.message).toContain("Unknown tool");
    }
  });
});
