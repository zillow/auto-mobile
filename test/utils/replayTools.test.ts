import { expect } from "chai";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LOG_DIR } from "../../src/utils/constants";
import { FakeFileSystem } from "../fakes/FakeFileSystem";
import { FakeToolRegistry } from "../fakes/FakeToolRegistry";
import { ReplayToolsService } from "../../src/utils/replayTools";

describe("Replay Tools", () => {
  let fakeFileSystem: FakeFileSystem;
  let fakeToolRegistry: FakeToolRegistry;
  let replayToolsService: ReplayToolsService;
  let serverStub: McpServer;

  beforeEach(() => {
    // Create fake implementations
    fakeFileSystem = new FakeFileSystem();
    fakeToolRegistry = new FakeToolRegistry();
    replayToolsService = new ReplayToolsService(fakeFileSystem, fakeToolRegistry);

    // Create a stub for the server
    serverStub = {} as McpServer;
  });

  it("should replay a single tool call", async () => {
    // Prepare test data
    const logFilePath = path.join(LOG_DIR, "test-call.json");
    const toolCall = {
      timestamp: new Date().toISOString(),
      tool: "testTool",
      params: { param1: "value1", param2: 123 },
      result: { success: true, data: { status: "ok" } }
    };

    // Setup fakes - register tool and set up file system
    let handlerWasCalled = false;
    let handlerParams: any;
    const handler = async (params: any) => {
      handlerWasCalled = true;
      handlerParams = params;
      return { status: "success" };
    };

    fakeToolRegistry.registerTool("testTool", "Test tool", {}, handler);
    fakeFileSystem.setFile(logFilePath, JSON.stringify(toolCall));

    // Call the function
    const result = await replayToolsService.replayToolCall(serverStub, logFilePath);

    // Verify results
    expect(result).to.be.true;
    expect(handlerWasCalled).to.be.true;
    expect(handlerParams).to.deep.equal(toolCall.params);
  });

  it("should handle file not found when replaying tool call", async () => {
    // File system is configured to not have the file by default
    const logFilePath = "nonexistent.json";
    fakeFileSystem.setExists(logFilePath, false);

    // Call the function
    const result = await replayToolsService.replayToolCall(serverStub, logFilePath);

    // Verify results
    expect(result).to.be.false;
  });

  it("should handle tool not found error", async () => {
    // Prepare test data
    const logFilePath = path.join(LOG_DIR, "test-call.json");
    const toolCall = {
      timestamp: new Date().toISOString(),
      tool: "nonexistentTool",
      params: { param1: "value1" },
      result: { success: true, data: { status: "ok" } }
    };

    // Setup fakes - don't register the tool, set up file system
    let handlerWasCalled = false;
    fakeFileSystem.setFile(logFilePath, JSON.stringify(toolCall));

    const handler = async () => {
      handlerWasCalled = true;
      return { status: "success" };
    };
    fakeToolRegistry.registerTool("differentTool", "Different tool", {}, handler);

    // Call the function - nonexistentTool is not registered
    const result = await replayToolsService.replayToolCall(serverStub, logFilePath);

    // Verify results
    expect(result).to.be.false;
    expect(handlerWasCalled).to.be.false;
  });

  it("should replay a session of tool calls", async () => {
    // Prepare test data
    const sessionId = "test-session";
    const sessionFilePath = path.join(LOG_DIR, `session_${sessionId}.json`);
    const toolCalls = [
      {
        timestamp: new Date().toISOString(),
        tool: "tool1",
        params: { param: "value1" },
        result: { success: true, data: { result: "ok" } }
      },
      {
        timestamp: new Date().toISOString(),
        tool: "tool2",
        params: { param: "value2" },
        result: { success: true, data: { result: "ok" } }
      }
    ];

    // Setup fakes
    const handlerCalls: Array<{ toolName: string; params: any }> = [];

    const handler1 = async (params: any) => {
      handlerCalls.push({ toolName: "tool1", params });
      return { status: "success" };
    };

    const handler2 = async (params: any) => {
      handlerCalls.push({ toolName: "tool2", params });
      return { status: "success" };
    };

    fakeToolRegistry.registerTool("tool1", "Tool 1", {}, handler1);
    fakeToolRegistry.registerTool("tool2", "Tool 2", {}, handler2);
    fakeFileSystem.setFile(sessionFilePath, JSON.stringify(toolCalls));

    // Call the function
    const result = await replayToolsService.replayToolSession(serverStub, sessionId);

    // Verify results
    expect(result).to.be.true;
    expect(handlerCalls.length).to.equal(toolCalls.length);

    // Verify each tool call was correct
    for (let i = 0; i < toolCalls.length; i++) {
      expect(handlerCalls[i].toolName).to.equal(toolCalls[i].tool);
      expect(handlerCalls[i].params).to.deep.equal(toolCalls[i].params);
    }
  });

  it("should list all tool logs", async () => {
    // Prepare test data
    const logFiles = ["log1.json", "log2.json", "session_abc.json"];

    // Setup fakes - set up file system with log directory and files
    fakeFileSystem.setDirectory(LOG_DIR);
    logFiles.forEach(file => {
      fakeFileSystem.setFile(path.join(LOG_DIR, file), "{}");
    });

    // Call the function
    const logs = await replayToolsService.listToolLogs();

    // Verify results
    expect(logs.length).to.equal(logFiles.length);
    for (let i = 0; i < logFiles.length; i++) {
      expect(logs[i]).to.equal(path.join(LOG_DIR, logFiles[i]));
    }
  });

  it("should handle directory not found when listing logs", async () => {
    // Setup fakes - log directory does not exist
    fakeFileSystem.setExists(LOG_DIR, false);

    // Call the function
    const logs = await replayToolsService.listToolLogs();

    // Verify results
    expect(logs).to.be.an("array").that.is.empty;
  });
});
