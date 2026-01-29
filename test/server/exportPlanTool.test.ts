import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { registerPlanTools } from "../../src/server/planTools";
import { ToolRegistry } from "../../src/server/toolRegistry";

describe("exportPlan tool", () => {
  const mockStopTestRecording = mock(() => Promise.resolve({
    recordingId: "rec-123",
    startedAt: "2024-01-01T00:00:00.000Z",
    stoppedAt: "2024-01-01T00:01:00.000Z",
    durationMs: 60000,
    planName: "test-plan",
    planContent: "name: test-plan\nsteps:\n  - tool: tapOn\n    params:\n      text: Button\n",
    stepCount: 1,
    deviceId: "emulator-5554",
    platform: "android",
  }));

  const mockGetTestRecordingStatus = mock(() => ({
    recordingId: "rec-123",
    deviceId: "emulator-5554",
    platform: "android",
    startedAt: "2024-01-01T00:00:00.000Z",
    eventCount: 5,
    durationMs: 30000,
  }));

  beforeAll(() => {
    if (!ToolRegistry.getTool("exportPlan")) {
      registerPlanTools();
    }
  });

  afterEach(() => {
    mockStopTestRecording.mockClear();
    mockGetTestRecordingStatus.mockClear();
  });

  test("successfully exports plan from active recording", async () => {
    mock.module("../../src/server/testRecordingManager", () => ({
      stopTestRecording: mockStopTestRecording,
      getTestRecordingStatus: mockGetTestRecordingStatus,
    }));

    const tool = ToolRegistry.getTool("exportPlan");
    expect(tool).toBeDefined();
    expect(tool!.handler).toBeDefined();

    const response = await tool!.handler({});
    const payload = JSON.parse(response.content?.[0]?.text ?? "{}");

    expect(payload.success).toBe(true);
    expect(payload.recordingId).toBe("rec-123");
    expect(payload.planName).toBe("test-plan");
    expect(payload.planContent).toContain("name: test-plan");
    expect(payload.stepCount).toBe(1);
    expect(payload.durationMs).toBe(60000);
  });

  test("returns error when no active recording", async () => {
    mock.module("../../src/server/testRecordingManager", () => ({
      stopTestRecording: mockStopTestRecording,
      getTestRecordingStatus: mock(() => null),
    }));

    const tool = ToolRegistry.getTool("exportPlan");
    expect(tool).toBeDefined();

    const response = await tool!.handler({});
    const payload = JSON.parse(response.content?.[0]?.text ?? "{}");

    expect(payload.success).toBe(false);
    expect(payload.error).toContain("No active recording");
  });

  test("returns error when recording ID does not match", async () => {
    mock.module("../../src/server/testRecordingManager", () => ({
      stopTestRecording: mockStopTestRecording,
      getTestRecordingStatus: mockGetTestRecordingStatus,
    }));

    const tool = ToolRegistry.getTool("exportPlan");
    expect(tool).toBeDefined();

    const response = await tool!.handler({ recordingId: "wrong-id" });
    const payload = JSON.parse(response.content?.[0]?.text ?? "{}");

    expect(payload.success).toBe(false);
    expect(payload.error).toContain("does not match active recording");
  });

  test("respects optional planName parameter", async () => {
    const customPlanName = "my-custom-plan";
    const mockStopWithName = mock(() => Promise.resolve({
      recordingId: "rec-123",
      startedAt: "2024-01-01T00:00:00.000Z",
      stoppedAt: "2024-01-01T00:01:00.000Z",
      durationMs: 60000,
      planName: customPlanName,
      planContent: `name: ${customPlanName}\nsteps:\n  - tool: tapOn\n    params:\n      text: Button\n`,
      stepCount: 1,
      deviceId: "emulator-5554",
      platform: "android",
    }));

    mock.module("../../src/server/testRecordingManager", () => ({
      stopTestRecording: mockStopWithName,
      getTestRecordingStatus: mockGetTestRecordingStatus,
    }));

    const tool = ToolRegistry.getTool("exportPlan");
    expect(tool).toBeDefined();

    const response = await tool!.handler({ planName: customPlanName });
    const payload = JSON.parse(response.content?.[0]?.text ?? "{}");

    expect(payload.success).toBe(true);
    expect(payload.planName).toBe(customPlanName);
  });

  test("respects optional recordingId parameter", async () => {
    mock.module("../../src/server/testRecordingManager", () => ({
      stopTestRecording: mockStopTestRecording,
      getTestRecordingStatus: mockGetTestRecordingStatus,
    }));

    const tool = ToolRegistry.getTool("exportPlan");
    expect(tool).toBeDefined();

    const response = await tool!.handler({ recordingId: "rec-123" });
    const payload = JSON.parse(response.content?.[0]?.text ?? "{}");

    expect(payload.success).toBe(true);
    expect(payload.recordingId).toBe("rec-123");
  });
});
