import { describe, it, expect, beforeEach } from "bun:test";
import { FakeFailureRecorder } from "./FakeFailureRecorder";
import type { RecordToolFailureInput, RecordCrashInput, RecordAnrInput } from "../../src/features/failures/FailureRecorder";

describe("FakeFailureRecorder", () => {
  let recorder: FakeFailureRecorder;

  beforeEach(() => {
    recorder = new FakeFailureRecorder();
  });

  const createToolFailureInput = (): RecordToolFailureInput => ({
    toolName: "tapOn",
    errorCode: "ELEMENT_NOT_FOUND",
    errorMessage: "Element not found",
    deviceModel: "Pixel 6",
    os: "Android 14",
    appVersion: "1.0.0",
    sessionId: "session-1",
  });

  const createCrashInput = (): RecordCrashInput => ({
    exceptionType: "NullPointerException",
    exceptionMessage: "Cannot invoke method on null",
    stackTrace: [
      { className: "com.example.App", methodName: "onClick", lineNumber: 42, isAppCode: true },
    ],
    deviceModel: "Pixel 6",
    os: "Android 14",
    appVersion: "1.0.0",
    sessionId: "session-1",
  });

  const createAnrInput = (): RecordAnrInput => ({
    reason: "Input dispatching timed out",
    deviceModel: "Pixel 6",
    os: "Android 14",
    appVersion: "1.0.0",
    sessionId: "session-1",
  });

  describe("recordToolFailure", () => {
    it("records tool failure and returns occurrence ID", async () => {
      const input = createToolFailureInput();
      const occurrenceId = await recorder.recordToolFailure(input);

      expect(occurrenceId).toStartWith("occ_");
      expect(recorder.getFailureCount()).toBe(1);
      expect(recorder.getToolFailures()).toHaveLength(1);
    });

    it("increments occurrence IDs", async () => {
      const id1 = await recorder.recordToolFailure(createToolFailureInput());
      const id2 = await recorder.recordToolFailure(createToolFailureInput());

      expect(id1).toBe("occ_1");
      expect(id2).toBe("occ_2");
    });
  });

  describe("recordCrash", () => {
    it("records crash and returns occurrence ID", async () => {
      const input = createCrashInput();
      const occurrenceId = await recorder.recordCrash(input);

      expect(occurrenceId).toStartWith("occ_");
      expect(recorder.getCrashes()).toHaveLength(1);
      expect(recorder.getCrashes()[0].input).toEqual(input);
    });
  });

  describe("recordAnr", () => {
    it("records ANR and returns occurrence ID", async () => {
      const input = createAnrInput();
      const occurrenceId = await recorder.recordAnr(input);

      expect(occurrenceId).toStartWith("occ_");
      expect(recorder.getAnrs()).toHaveLength(1);
      expect(recorder.getAnrs()[0].input).toEqual(input);
    });
  });

  describe("getRecordedFailures", () => {
    it("returns all failures in order", async () => {
      await recorder.recordToolFailure(createToolFailureInput());
      await recorder.recordCrash(createCrashInput());
      await recorder.recordAnr(createAnrInput());

      const failures = recorder.getRecordedFailures();
      expect(failures).toHaveLength(3);
      expect(failures[0].type).toBe("tool_failure");
      expect(failures[1].type).toBe("crash");
      expect(failures[2].type).toBe("anr");
    });
  });

  describe("setFailure", () => {
    it("causes next call to throw", async () => {
      recorder.setFailure(new Error("Database error"));

      await expect(recorder.recordToolFailure(createToolFailureInput())).rejects.toThrow("Database error");
    });

    it("can be cleared", async () => {
      recorder.setFailure(new Error("Database error"));
      recorder.clearFailure();

      const id = await recorder.recordToolFailure(createToolFailureInput());
      expect(id).toStartWith("occ_");
    });
  });

  describe("reset", () => {
    it("clears all recorded failures", async () => {
      await recorder.recordToolFailure(createToolFailureInput());
      await recorder.recordCrash(createCrashInput());
      recorder.reset();

      expect(recorder.getFailureCount()).toBe(0);
    });

    it("resets occurrence ID counter", async () => {
      await recorder.recordToolFailure(createToolFailureInput());
      recorder.reset();

      const id = await recorder.recordToolFailure(createToolFailureInput());
      expect(id).toBe("occ_1");
    });

    it("clears failure configuration", async () => {
      recorder.setFailure(new Error("Test"));
      recorder.reset();

      const id = await recorder.recordToolFailure(createToolFailureInput());
      expect(id).toStartWith("occ_");
    });
  });
});
