import { expect } from "chai";
import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";
import sinon from "sinon";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LOG_DIR } from "../../src/utils/constants";
import { ToolRegistry } from "../../src/server/toolRegistry";

describe("Replay Tools", () => {
  let fsExtraReadFileStub: sinon.SinonStub;
  let fsExistsStub: sinon.SinonStub;
  let fsExtraReaddirStub: sinon.SinonStub;
  let serverStub: sinon.SinonStubbedInstance<McpServer>;
  let toolRegistryStub: sinon.SinonStub;
  let toolHandlerStub: sinon.SinonStub;

  // Module variables
  let replayTools: any;

  beforeEach(() => {
    // Clear module cache first
    delete require.cache[require.resolve("../../src/utils/replayTools")];
    delete require.cache[require.resolve("../../src/utils/io")];

    // Stub fs-extra methods that are used by the io module
    fsExtraReadFileStub = sinon.stub(fsExtra, "readFile");
    fsExistsStub = sinon.stub(fs, "existsSync").returns(true);
    fsExtraReaddirStub = sinon.stub(fsExtra, "readdir");

    // Now require the module - this will create promisified functions from our stubs
    replayTools = require("../../src/utils/replayTools");

    // Create a stub for the server
    serverStub = sinon.createStubInstance(McpServer);

    // Create a stub for the tool handler
    toolHandlerStub = sinon.stub().resolves({ status: "success" });

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

    // Setup stubs - make fs-extra.readFile call the callback with success
    fsExtraReadFileStub.callsArgWith(2, null, JSON.stringify(toolCall));

    // Call the function
    const result = await replayTools.replayToolCall(serverStub as any, logFilePath);

    // Verify results
    expect(result).to.be.true;
    expect(fsExistsStub.calledWith(logFilePath)).to.be.true;
    expect(fsExtraReadFileStub.calledWith(logFilePath, "utf8")).to.be.true;

    // Verify the tool was retrieved and the handler was called
    expect(toolRegistryStub.calledWith(toolCall.tool)).to.be.true;
    expect(toolHandlerStub.calledOnce).to.be.true;
    expect(toolHandlerStub.firstCall.args[0]).to.deep.equal(toolCall.params);
  });

  it("should handle file not found when replaying tool call", async () => {
    // Setup stubs
    fsExistsStub.returns(false);

    // Call the function
    const result = await replayTools.replayToolCall(serverStub as any, "nonexistent.json");

    // Verify results
    expect(result).to.be.false;
    expect(fsExtraReadFileStub.called).to.be.false;
    expect(toolHandlerStub.called).to.be.false;
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

    // Setup stubs
    fsExtraReadFileStub.callsArgWith(2, null, JSON.stringify(toolCall));
    toolRegistryStub.withArgs("nonexistentTool").returns(null);

    // Call the function
    const result = await replayTools.replayToolCall(serverStub as any, logFilePath);

    // Verify results
    expect(result).to.be.false;
    expect(fsExistsStub.calledWith(logFilePath)).to.be.true;
    expect(fsExtraReadFileStub.calledWith(logFilePath, "utf8")).to.be.true;
    expect(toolRegistryStub.calledWith(toolCall.tool)).to.be.true;
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

    // Setup stubs - make fs-extra.readFile call the callback with success
    fsExtraReadFileStub.callsArgWith(2, null, JSON.stringify(toolCalls));
    // Need to return different tools for different calls
    toolRegistryStub.onFirstCall().returns({
      name: "tool1",
      description: "Tool 1",
      schema: {},
      handler: toolHandlerStub
    });
    toolRegistryStub.onSecondCall().returns({
      name: "tool2",
      description: "Tool 2",
      schema: {},
      handler: toolHandlerStub
    });

    // Call the function
    const result = await replayTools.replayToolSession(serverStub as any, sessionId);

    // Verify results
    expect(result).to.be.true;
    expect(fsExistsStub.calledWith(sessionFilePath)).to.be.true;
    expect(fsExtraReadFileStub.calledWith(sessionFilePath, "utf8")).to.be.true;

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

    // Setup stubs - make fs-extra.readdir call the callback with success
    fsExtraReaddirStub.callsArgWith(1, null, logFiles);

    // Call the function
    const logs = await replayTools.listToolLogs();

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
    const logs = await replayTools.listToolLogs();

    // Verify results
    expect(logs).to.be.an("array").that.is.empty;
    expect(fsExtraReaddirStub.called).to.be.false;
  });
});
