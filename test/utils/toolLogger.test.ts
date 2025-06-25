import { expect } from "chai";
import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";
import sinon from "sinon";
import { LOG_DIR } from "../../src/utils/constants";

describe("Tool Logger", () => {
  let fsExtraWriteFileStub: sinon.SinonStub;
  let fsExtraMkdirStub: sinon.SinonStub;
  let fsExistsStub: sinon.SinonStub;

  // Module variables
  let toolLogger: any;

  beforeEach(() => {
    // Clear module cache first
    delete require.cache[require.resolve("../../src/utils/toolLogger")];
    delete require.cache[require.resolve("../../src/utils/io")];

    // Stub fs-extra methods that are used by the io module
    fsExtraWriteFileStub = sinon.stub(fsExtra, "writeFile");
    fsExtraMkdirStub = sinon.stub(fsExtra, "mkdir");
    fsExistsStub = sinon.stub(fs, "existsSync").returns(true);

    // Now require the module - this will create promisified functions from our stubs
    toolLogger = require("../../src/utils/toolLogger");
  });

  afterEach(() => {
    // Restore stubs
    sinon.restore();
  });

  it("should log a tool call", async () => {
    const toolName = "testTool";
    const toolParams = { param1: "value1", param2: 123 };
    const result = { success: true, data: { status: "ok" } };

    // Setup stubs - make fs-extra.writeFile call the callback with success
    fsExtraWriteFileStub.callsArgWith(2, null);

    const logFile = await toolLogger.logToolCall(toolName, toolParams, result);

    expect(logFile).to.not.be.null;
    expect(fsExtraWriteFileStub.called).to.be.true;

    // Check that the first argument to writeFile starts with the LOG_DIR
    const firstArg = fsExtraWriteFileStub.firstCall.args[0] as string;
    expect(firstArg.startsWith(LOG_DIR)).to.be.true;

    // Verify log content by parsing the JSON string
    const logContentString = fsExtraWriteFileStub.firstCall.args[1] as string;
    const logContent = JSON.parse(logContentString);
    expect(logContent.tool).to.equal(toolName);
    expect(logContent.params).to.deep.equal(toolParams);
    expect(logContent.result).to.deep.equal(result);
    expect(logContent.timestamp).to.be.a("string");
  });

  it("should log a tool session", async () => {
    const sessionId = "test-session-123";
    const toolCalls = [
      {
        timestamp: new Date().toISOString(),
        tool: "tool1",
        params: { param: "value" },
        result: { success: true, data: { result: "ok" } }
      },
      {
        timestamp: new Date().toISOString(),
        tool: "tool2",
        params: { param: "value2" },
        result: { success: false, error: "Failed" }
      }
    ];

    // Setup stubs - make fs-extra.writeFile call the callback with success
    fsExtraWriteFileStub.callsArgWith(2, null);

    const logFile = await toolLogger.logToolSession(sessionId, toolCalls);

    expect(logFile).to.not.be.null;
    expect(fsExtraWriteFileStub.called).to.be.true;

    // Check that the first argument to writeFile is the expected session file
    const expectedFilePath = path.join(LOG_DIR, `session_${sessionId}.json`);
    expect(fsExtraWriteFileStub.firstCall.args[0]).to.equal(expectedFilePath);

    // Verify log content by parsing the JSON string
    const logContentString = fsExtraWriteFileStub.firstCall.args[1] as string;
    const logContent = JSON.parse(logContentString);
    expect(logContent).to.deep.equal(toolCalls);
  });

  it("should handle errors when log directory does not exist", async () => {
    // Simulate directory doesn't exist initially
    fsExistsStub.returns(false);
    // Setup stubs for successful directory creation and file write
    fsExtraMkdirStub.callsArgWith(2, null);
    fsExtraWriteFileStub.callsArgWith(2, null);

    const toolName = "testTool";
    const toolParams = { param1: "value1" };
    const result = { success: true };

    const logFile = await toolLogger.logToolCall(toolName, toolParams, result);

    // The main assertion should be that logging still succeeds even when directory doesn't exist
    expect(logFile).to.not.be.null;
    expect(fsExtraWriteFileStub.called).to.be.true;

    // Verify log content
    const logContentString = fsExtraWriteFileStub.firstCall.args[1] as string;
    const logContent = JSON.parse(logContentString);
    expect(logContent.tool).to.equal(toolName);
    expect(logContent.params).to.deep.equal(toolParams);
    expect(logContent.result).to.deep.equal(result);
  });

  it("should handle write errors gracefully", async () => {
    // Simulate write error
    fsExtraWriteFileStub.callsArgWith(2, new Error("Write error"));

    const toolName = "testTool";
    const toolParams = { param1: "value1" };
    const result = { success: true };

    const logFile = await toolLogger.logToolCall(toolName, toolParams, result);

    // Should return null when write fails
    expect(logFile).to.be.null;
  });
});
