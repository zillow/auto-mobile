import { expect } from "chai";
import fs from "fs-extra";
import path from "path";
import sinon from "sinon";
import { logToolCall, logToolSession } from "../../src/utils/toolLogger";
import { LOG_DIR } from "../../src/utils/constants";
import * as io from "../../src/utils/io";

describe("Tool Logger", () => {
  let writeJsonStub: sinon.SinonStub;
  let ensureDirStub: sinon.SinonStub;
  let fsExistsStub: sinon.SinonStub;

  beforeEach(() => {
    // Stub filesystem methods to prevent actual file operations during tests
    writeJsonStub = sinon.stub(io, "writeJsonToFile").resolves();
    ensureDirStub = sinon.stub(io, "ensureDirExists").resolves();
    fsExistsStub = sinon.stub(fs, "existsSync").returns(true);
  });

  afterEach(() => {
    // Restore stubs
    sinon.restore();
  });

  it("should log a tool call", async () => {
    const toolName = "testTool";
    const toolParams = { param1: "value1", param2: 123 };
    const result = { success: true, data: { status: "ok" } };

    const logFile = await logToolCall(toolName, toolParams, result);

    expect(logFile).to.not.be.null;
    expect(writeJsonStub.called).to.be.true;

    // Check that the first argument to writeJsonToFile starts with the LOG_DIR
    const firstArg = writeJsonStub.firstCall.args[0] as string;
    expect(firstArg.startsWith(LOG_DIR)).to.be.true;

    // Verify log content
    const logContent = writeJsonStub.firstCall.args[1];
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

    const logFile = await logToolSession(sessionId, toolCalls);

    expect(logFile).to.not.be.null;
    expect(writeJsonStub.called).to.be.true;

    // Check that the first argument to writeJsonToFile is the expected session file
    const expectedFilePath = path.join(LOG_DIR, `session_${sessionId}.json`);
    expect(writeJsonStub.firstCall.args[0]).to.equal(expectedFilePath);

    // Verify log content
    const logContent = writeJsonStub.firstCall.args[1];
    expect(logContent).to.deep.equal(toolCalls);
  });

  it("should handle errors when log directory does not exist", async () => {
    // Simulate directory doesn't exist
    fsExistsStub.returns(false);

    const toolName = "testTool";
    const toolParams = { param1: "value1" };
    const result = { success: true };

    await logToolCall(toolName, toolParams, result);

    // Directory should be created
    expect(ensureDirStub.called).to.be.true;
    expect(writeJsonStub.called).to.be.true;
  });

  it("should handle write errors gracefully", async () => {
    // Simulate write error
    writeJsonStub.rejects(new Error("Write error"));

    const toolName = "testTool";
    const toolParams = { param1: "value1" };
    const result = { success: true };

    const logFile = await logToolCall(toolName, toolParams, result);

    // Should return null when write fails
    expect(logFile).to.be.null;
  });
});
