import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { registerHighlightTools } from "../../src/server/highlightTools";
import { ToolRegistry } from "../../src/server/toolRegistry";

describe("Highlight Tools Registration", () => {
  beforeEach(() => {
    (ToolRegistry as any).tools.clear();
  });

  afterEach(() => {
    (ToolRegistry as any).tools.clear();
  });

  test("registers highlight tool", () => {
    registerHighlightTools();

    const toolNames = ToolRegistry.getToolDefinitions().map(tool => tool.name);
    expect(toolNames).toContain("highlight");
  });

  test("validates highlight schema for add action", () => {
    registerHighlightTools();

    const tool = ToolRegistry.getTool("highlight");
    expect(tool).toBeDefined();

    const validShape = {
      type: "box",
      bounds: {
        x: 10,
        y: 20,
        width: 100,
        height: 50
      },
      style: {
        strokeColor: "#FF0000"
      }
    };

    expect(() => tool!.schema.parse({
      platform: "android",
      shape: validShape
    })).not.toThrow();

    expect(() => tool!.schema.parse({
      platform: "android"
    })).toThrow();

    expect(() => tool!.schema.parse({
      shape: validShape
    })).toThrow();
  });

  test("rejects invalid highlight shapes", () => {
    registerHighlightTools();

    const tool = ToolRegistry.getTool("highlight");
    expect(tool).toBeDefined();

    expect(() => tool!.schema.parse({
      platform: "android",
      shape: {
        type: "box",
        bounds: {
          x: 10,
          y: 20,
          width: 0,
          height: 50
        }
      }
    })).toThrow();
  });

  test("returns unsupported response for iOS", async () => {
    registerHighlightTools();

    const tool = ToolRegistry.getTool("highlight");
    expect(tool).toBeDefined();

    const validShape = {
      type: "box",
      bounds: {
        x: 10,
        y: 20,
        width: 100,
        height: 50
      }
    };

    const parsed = tool!.schema.parse({
      platform: "ios",
      shape: validShape
    });

    const response = await tool!.handler(parsed);
    const payload = JSON.parse(response.content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.error).toContain("Android");
  });
});
