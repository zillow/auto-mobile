import { expect, describe, test, beforeEach, spyOn, afterEach } from "bun:test";
import {
  startMcpRecording,
  stopMcpRecording,
  getMcpRecordingStatus,
  getMcpRecorder,
  resetMcpRecordingState,
} from "../../src/server/mcpRecordingManager";
import { PlanValidator } from "../../src/utils/plan/PlanValidator";
import { FakeTimer } from "../fakes/FakeTimer";

describe("mcpRecordingManager", () => {
  beforeEach(() => {
    resetMcpRecordingState();
  });

  describe("startMcpRecording", () => {
    test("starts a recording session", () => {
      const timer = new FakeTimer();
      timer.setCurrentTime(1000);
      const result = startMcpRecording(timer);

      expect(result.recording).toBe(true);
      expect(result.startedAt).toBe(new Date(1000).toISOString());
    });

    test("returns existing session if already recording", () => {
      const timer = new FakeTimer();
      timer.setCurrentTime(1000);
      startMcpRecording(timer);

      const timer2 = new FakeTimer();
      timer2.setCurrentTime(2000);
      const result = startMcpRecording(timer2);

      // Should return original startedAt, not the second call's time
      expect(result.recording).toBe(true);
      expect(result.startedAt).toBe(new Date(1000).toISOString());
    });

    test("returns alreadyActive and currentStepCount on duplicate begin", () => {
      const timer = new FakeTimer();
      timer.setCurrentTime(1000);
      startMcpRecording(timer);

      const recorder = getMcpRecorder()!;
      recorder.record("tapOn", { text: "A" });
      recorder.record("tapOn", { text: "B" });

      const result = startMcpRecording(timer);

      expect(result.alreadyActive).toBe(true);
      expect(result.currentStepCount).toBe(2);
    });
  });

  describe("getMcpRecorder", () => {
    test("returns null when no recording active", () => {
      expect(getMcpRecorder()).toBeNull();
    });

    test("returns recorder when recording is active", () => {
      const timer = new FakeTimer();
      timer.setCurrentTime(1000);
      startMcpRecording(timer);

      const recorder = getMcpRecorder();
      expect(recorder).not.toBeNull();
      expect(recorder!.isRecording()).toBe(true);
    });
  });

  describe("getMcpRecordingStatus", () => {
    test("returns null when no recording active", () => {
      expect(getMcpRecordingStatus()).toBeNull();
    });

    test("returns status with step count and duration", () => {
      const timer = new FakeTimer();
      timer.setCurrentTime(1000);
      startMcpRecording(timer);

      const recorder = getMcpRecorder()!;
      recorder.record("tapOn", { text: "Login" });
      recorder.record("inputText", { text: "test" });

      const statusTimer = new FakeTimer();
      statusTimer.setCurrentTime(3000);
      const status = getMcpRecordingStatus(statusTimer);

      expect(status).not.toBeNull();
      expect(status!.recording).toBe(true);
      expect(status!.stepCount).toBe(2);
      expect(status!.durationMs).toBe(2000);
    });
  });

  describe("stopMcpRecording", () => {
    test("throws when no recording active", () => {
      expect(() => stopMcpRecording()).toThrow("No active MCP recording");
    });

    test("throws when no steps were recorded", () => {
      const timer = new FakeTimer();
      timer.setCurrentTime(1000);
      startMcpRecording(timer);

      const stopTimer = new FakeTimer();
      stopTimer.setCurrentTime(2000);
      expect(() => stopMcpRecording(undefined, stopTimer)).toThrow("No MCP tool calls were recorded");
    });

    test("returns YAML plan content with recorded steps", () => {
      const timer = new FakeTimer();
      timer.setCurrentTime(1000);
      startMcpRecording(timer);

      const recorder = getMcpRecorder()!;
      recorder.record("launchApp", { appId: "com.test.app", platform: "android" });
      recorder.record("tapOn", { text: "Login", sessionUuid: "abc" });
      recorder.record("terminateApp", { appId: "com.test.app" });

      const stopTimer = new FakeTimer();
      stopTimer.setCurrentTime(5000);
      const result = stopMcpRecording("test-plan", stopTimer);

      expect(result.planName).toBe("test-plan");
      expect(result.stepCount).toBe(3);
      expect(result.durationMs).toBe(4000);
      expect(result.planContent).toContain("name: test-plan");
      expect(result.planContent).toContain("tool: launchApp");
      expect(result.planContent).toContain("tool: tapOn");
      expect(result.planContent).toContain("tool: terminateApp");
      expect(result.planContent).toContain("generatedFromToolCalls: true");
    });

    test("strips internal params from plan content", () => {
      const timer = new FakeTimer();
      timer.setCurrentTime(1000);
      startMcpRecording(timer);

      const recorder = getMcpRecorder()!;
      recorder.record("tapOn", {
        text: "Login",
        action: "tap",
        platform: "android",
        deviceId: "emulator-5554",
        sessionUuid: "abc-123",
      });

      const stopTimer = new FakeTimer();
      stopTimer.setCurrentTime(2000);
      const result = stopMcpRecording("stripped-test", stopTimer);

      // Internal params should not appear in YAML
      expect(result.planContent).not.toContain("platform:");
      expect(result.planContent).not.toContain("deviceId:");
      expect(result.planContent).not.toContain("sessionUuid:");
      // But real params should
      expect(result.planContent).toContain("text: Login");
      expect(result.planContent).toContain("action: tap");
    });

    test("auto-generates plan name when not provided", () => {
      const timer = new FakeTimer();
      timer.setCurrentTime(1000);
      startMcpRecording(timer);

      const recorder = getMcpRecorder()!;
      recorder.record("observe", {});

      const stopTimer = new FakeTimer();
      stopTimer.setCurrentTime(2000);
      const result = stopMcpRecording(undefined, stopTimer);

      expect(result.planName).toMatch(/^mcp-recorded-plan-/);
    });

    test("clears recording state after stop", () => {
      const timer = new FakeTimer();
      timer.setCurrentTime(1000);
      startMcpRecording(timer);

      const recorder = getMcpRecorder()!;
      recorder.record("observe", {});

      const stopTimer = new FakeTimer();
      stopTimer.setCurrentTime(2000);
      stopMcpRecording("test", stopTimer);

      expect(getMcpRecorder()).toBeNull();
      expect(getMcpRecordingStatus()).toBeNull();
    });

    test("clears session when validation throws (no zombie session)", () => {
      const spy = spyOn(PlanValidator, "validate").mockImplementation(() => {
        throw new Error("validation boom");
      });

      const timer = new FakeTimer();
      timer.setCurrentTime(1000);
      startMcpRecording(timer);

      const recorder = getMcpRecorder()!;
      recorder.record("tapOn", { text: "Login" });

      expect(() => stopMcpRecording("test", timer)).toThrow("validation boom");
      expect(getMcpRecorder()).toBeNull();
      expect(getMcpRecordingStatus()).toBeNull();

      spy.mockRestore();
    });
  });
});
