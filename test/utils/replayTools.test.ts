import { expect } from "chai";
import fs from "fs";
import path from "path";
import sinon from "sinon";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { replayToolCall, replayToolSession, listToolLogs } from "../../src/utils/replayTools";
import { LOG_DIR } from "../../src/utils/constants";
import { ToolRegistry } from "../../src/server/toolRegistry";
import * as io from "../../src/utils/io";

describe("Replay Tools", () => {
  let readFileAsyncStub: sinon.SinonStub;
  let fsExistsStub: sinon.SinonStub;
  let readdirAsyncStub: sinon.SinonStub;
  let serverStub: sinon.SinonStubbedInstance<McpServer>;
  let toolRegistryStub: sinon.SinonStub;
  let toolHandlerStub: sinon.SinonStub;

  beforeEach(() => {
    // Stub filesystem methods
    readFileAsyncStub = sinon.stub(io, "readFileAsync");
    fsExistsStub = sinon.stub(fs, "existsSync").returns(true);
    readdirAsyncStub = sinon.stub(io, "readdirAsync");

    // Create a stub for the server
    serverStub = sinon.createStubInstance(McpServer);

    // Create a stub for the tool handler
    toolHandlerStub = sinon.stub();

    // Stub the ToolRegistry's getTool method
    toolRegistryStub = sinon.stub(ToolRegistry, "getTool").returns({
      name: "testTool",
      description: "Test tool",
      schema: {},
      handler: toolHandlerStub
    });
  });

  afterEach(() => {
    // Restore stubs
    sinon.restore();
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

    // Setup stubs
    readFileAsyncStub.resolves(JSON.stringify(toolCall));
    toolHandlerStub.resolves({ status: "success" });

    // Call the function
    const result = await replayToolCall(serverStub as any, logFilePath);

    // Verify results
    expect(result).to.be.true;
    expect(fsExistsStub.calledWith(logFilePath)).to.be.true;
    expect(readFileAsyncStub.calledWith(logFilePath, "utf8")).to.be.true;

    // Verify the tool was retrieved and the handler was called
    expect(toolRegistryStub.calledWith(toolCall.tool)).to.be.true;
    expect(toolHandlerStub.calledOnce).to.be.true;
    expect(toolHandlerStub.firstCall.args[0]).to.deep.equal(toolCall.params);
  });

  it("should handle file not found when replaying tool call", async () => {
    // Setup stubs
    fsExistsStub.returns(false);

    // Call the function
    const result = await replayToolCall(serverStub as any, "nonexistent.json");

    // Verify results
    expect(result).to.be.false;
    expect(readFileAsyncStub.called).to.be.false;
    expect(toolHandlerStub.called).to.be.false;
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

    // Setup stubs
    readFileAsyncStub.resolves(JSON.stringify(toolCalls));
    toolHandlerStub.resolves({ status: "success" });

    // Call the function
    const result = await replayToolSession(serverStub as any, sessionId);

    // Verify results
    expect(result).to.be.true;
    expect(fsExistsStub.calledWith(sessionFilePath)).to.be.true;
    expect(readFileAsyncStub.calledWith(sessionFilePath, "utf8")).to.be.true;

    // Verify the tool handler was called for each tool call
    expect(toolHandlerStub.callCount).to.equal(toolCalls.length);

    // Verify each tool call was correct
    for (let i = 0; i < toolCalls.length; i++) {
      expect(toolRegistryStub.getCall(i).args[0]).to.equal(toolCalls[i].tool);
      expect(toolHandlerStub.getCall(i).args[0]).to.deep.equal(toolCalls[i].params);
    }
  });

  it("should list all tool logs", async () => {
    // Prepare test data
    const logFiles = ["log1.json", "log2.json", "session_abc.json"];

    // Setup stubs
    readdirAsyncStub.resolves(logFiles);

    // Call the function
    const logs = await listToolLogs();

    // Verify results
    expect(logs.length).to.equal(logFiles.length);
    for (let i = 0; i < logFiles.length; i++) {
      expect(logs[i]).to.equal(path.join(LOG_DIR, logFiles[i]));
    }
  });

  it("should handle directory not found when listing logs", async () => {
    // Setup stubs
    fsExistsStub.returns(false);

    // Call the function
    const logs = await listToolLogs();

    // Verify results
    expect(logs).to.be.an("array").that.is.empty;
    expect(readdirAsyncStub.called).to.be.false;
  });
});
