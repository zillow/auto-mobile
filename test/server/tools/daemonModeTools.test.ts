import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createMcpServer } from "../../../src/server/index";
import { ToolRegistry } from "../../../src/server/toolRegistry";

describe("Daemon-only MCP tools", () => {
  beforeEach(() => {
    (ToolRegistry as any).tools.clear();
  });

  afterEach(() => {
    (ToolRegistry as any).tools.clear();
  });

  test("does not register executePlan or criticalSection outside daemon mode", () => {
    createMcpServer();

    const toolNames = ToolRegistry.getToolDefinitions().map(tool => tool.name);
    expect(toolNames).not.toContain("executePlan");
    expect(toolNames).not.toContain("criticalSection");
  });

  test("registers executePlan and criticalSection in daemon mode", () => {
    createMcpServer({ daemonMode: true });

    const toolNames = ToolRegistry.getToolDefinitions().map(tool => tool.name);
    expect(toolNames).toContain("executePlan");
    expect(toolNames).toContain("criticalSection");
  });
});
