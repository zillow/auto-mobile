import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { registerPlanTools } from "../../src/server/planTools";
import { ToolRegistry } from "../../src/server/toolRegistry";

describe("startTestRecording tool", () => {
  const mockDevice = {
    deviceId: "emulator-5554",
    name: "Pixel 6 API 33",
    platform: "android" as const,
    status: "booted" as const,
  };

  const mockStartTestRecording = mock(() => Promise.resolve({
    recordingId: "rec-123",
    startedAt: "2024-01-01T00:00:00.000Z",
    deviceId: "emulator-5554",
    platform: "android",
  }));

  beforeAll(() => {
    if (!ToolRegistry.getTool("startTestRecording")) {
      registerPlanTools();
    }
  });

  afterEach(() => {
    mockStartTestRecording.mockClear();
  });

  test("successfully starts a new recording", async () => {
    mock.module("../../src/server/testRecordingManager", () => ({
      startTestRecording: mockStartTestRecording,
      stopTestRecording: mock(() => Promise.resolve({})),
      getTestRecordingStatus: mock(() => null),
    }));

    const tool = ToolRegistry.getTool("startTestRecording");
    expect(tool).toBeDefined();
    expect(tool!.deviceAwareHandler).toBeDefined();

    const response = await tool!.deviceAwareHandler!(mockDevice, {});
    const payload = JSON.parse(response.content?.[0]?.text ?? "{}");

    expect(payload.success).toBe(true);
    expect(payload.recordingId).toBe("rec-123");
    expect(payload.startedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(payload.deviceId).toBe("emulator-5554");
    expect(payload.platform).toBe("android");
  });

  test("returns existing session when recording already active", async () => {
    const existingSession = {
      recordingId: "existing-456",
      startedAt: "2024-01-01T00:30:00.000Z",
      deviceId: "emulator-5554",
      platform: "android",
    };

    mock.module("../../src/server/testRecordingManager", () => ({
      startTestRecording: mock(() => Promise.resolve(existingSession)),
      stopTestRecording: mock(() => Promise.resolve({})),
      getTestRecordingStatus: mock(() => existingSession),
    }));

    const tool = ToolRegistry.getTool("startTestRecording");
    expect(tool).toBeDefined();

    const response = await tool!.deviceAwareHandler!(mockDevice, {});
    const payload = JSON.parse(response.content?.[0]?.text ?? "{}");

    expect(payload.success).toBe(true);
    expect(payload.recordingId).toBe("existing-456");
    expect(payload.startedAt).toBe("2024-01-01T00:30:00.000Z");
  });

  test("returns error when recording fails to start", async () => {
    mock.module("../../src/server/testRecordingManager", () => ({
      startTestRecording: mock(() => Promise.reject(new Error("Unable to connect to accessibility service"))),
      stopTestRecording: mock(() => Promise.resolve({})),
      getTestRecordingStatus: mock(() => null),
    }));

    const tool = ToolRegistry.getTool("startTestRecording");
    expect(tool).toBeDefined();

    const response = await tool!.deviceAwareHandler!(mockDevice, {});
    const payload = JSON.parse(response.content?.[0]?.text ?? "{}");

    expect(payload.success).toBe(false);
    expect(payload.error).toContain("Unable to connect to accessibility service");
  });

  test("returns error when recording active on different device", async () => {
    const differentDevice = {
      deviceId: "emulator-5556",
      name: "Pixel 7 API 34",
      platform: "android" as const,
      status: "booted" as const,
    };

    mock.module("../../src/server/testRecordingManager", () => ({
      startTestRecording: mock(() => Promise.reject(
        new Error("Recording already active on device emulator-5554 (rec-123). Stop the existing recording before starting a new one on emulator-5556.")
      )),
      stopTestRecording: mock(() => Promise.resolve({})),
      getTestRecordingStatus: mock(() => ({
        recordingId: "rec-123",
        deviceId: "emulator-5554",
        platform: "android",
        startedAt: "2024-01-01T00:00:00.000Z",
        eventCount: 5,
        durationMs: 30000,
      })),
    }));

    const tool = ToolRegistry.getTool("startTestRecording");
    expect(tool).toBeDefined();

    const response = await tool!.deviceAwareHandler!(differentDevice, {});
    const payload = JSON.parse(response.content?.[0]?.text ?? "{}");

    expect(payload.success).toBe(false);
    expect(payload.error).toContain("Recording already active on device emulator-5554");
    expect(payload.error).toContain("emulator-5556");
  });
});
