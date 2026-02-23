import { beforeEach, describe, expect, test } from "bun:test";
import { observeSchema, registerObserveTools } from "../../src/server/observeTools";
import { ToolRegistry } from "../../src/server/toolRegistry";

describe("observeSchema raw flag", () => {
  test("accepts raw: true", () => {
    expect(() =>
      observeSchema.parse({ platform: "android", raw: true })
    ).not.toThrow();
  });

  test("accepts raw: false", () => {
    expect(() =>
      observeSchema.parse({ platform: "android", raw: false })
    ).not.toThrow();
  });

  test("accepts missing raw (defaults to undefined)", () => {
    const parsed = observeSchema.parse({ platform: "android" });
    expect(parsed.raw).toBeUndefined();
  });

  test("raw field is present in tool inputSchema", () => {
    (ToolRegistry as any).tools.clear();
    registerObserveTools();

    const tool = ToolRegistry.getTool("observe");
    expect(tool).toBeDefined();

    // Parse the schema shape to confirm raw is a valid optional boolean
    expect(() =>
      tool!.schema.parse({ platform: "ios", raw: true })
    ).not.toThrow();
  });
});

describe("observe tool registration", () => {
  beforeEach(() => {
    (ToolRegistry as any).tools.clear();
  });

  test("registers observe tool", () => {
    registerObserveTools();
    const toolNames = ToolRegistry.getToolDefinitions().map(t => t.name);
    expect(toolNames).toContain("observe");
  });

  test("does not register rawViewHierarchy tool", () => {
    registerObserveTools();
    const toolNames = ToolRegistry.getToolDefinitions().map(t => t.name);
    expect(toolNames).not.toContain("rawViewHierarchy");
  });

  test("registers identifyInteractions tool", () => {
    registerObserveTools();
    const toolNames = ToolRegistry.getToolDefinitions().map(t => t.name);
    expect(toolNames).toContain("identifyInteractions");
  });
});
