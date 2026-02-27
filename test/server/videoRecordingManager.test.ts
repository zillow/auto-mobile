import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import { promises as fsPromises } from "node:fs";
import { FakeTimer } from "../fakes/FakeTimer";
import { FakeVideoCaptureBackend } from "../fakes/FakeVideoCaptureBackend";
import { FakeHighlightClient } from "../fakes/FakeHighlightClient";
import { FakeVideoRecordingRepository } from "../fakes/FakeVideoRecordingRepository";
import { FakeVideoRecordingConfigRepository } from "../fakes/FakeVideoRecordingConfigRepository";
import { VideoRecorderService } from "../../src/features/video";
import type { BootedDevice } from "../../src/models";
import {
  listVideoRecordings,
  recordVideoRecordingHighlightAdded,
  resetVideoRecordingManagerDependencies,
  setVideoRecordingManagerDependencies,
  startVideoRecording,
  stopVideoRecording,
} from "../../src/server/videoRecordingManager";
import { defaultTimer } from "../../src/utils/SystemTimer";

describe("videoRecordingManager", () => {
  let fakeTimer: FakeTimer;
  let fakeBackend: FakeVideoCaptureBackend;
  let fakeHighlightClient: FakeHighlightClient;
  let archiveRoot: string;
  let testDevice: BootedDevice;

  beforeAll(async () => {
    archiveRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "auto-mobile-video-"));
  });

  beforeEach(async () => {
    fakeTimer = new FakeTimer();
    fakeBackend = new FakeVideoCaptureBackend();
    fakeBackend.setNowProvider(() => new Date(fakeTimer.now()));
    fakeHighlightClient = new FakeHighlightClient();
    await fsPromises.rm(archiveRoot, { recursive: true, force: true });
    await fsPromises.mkdir(archiveRoot, { recursive: true });

    const service = new VideoRecorderService({
      backend: fakeBackend,
      archiveRoot,
      now: () => new Date(fakeTimer.now()),
    });

    await setVideoRecordingManagerDependencies({
      videoRecorderService: service,
      recordingRepository: new FakeVideoRecordingRepository(),
      configRepository: new FakeVideoRecordingConfigRepository(),
      highlightClient: fakeHighlightClient,
      timer: fakeTimer,
      now: () => new Date(fakeTimer.now()),
    });

    testDevice = {
      deviceId: "test-device",
      platform: "android",
      name: "Test Device",
    };
  });

  afterEach(async () => {
    resetVideoRecordingManagerDependencies();
  });

  afterAll(async () => {
    await fsPromises.rm(archiveRoot, { recursive: true, force: true });
  });

  const waitForRecordingCount = async (expected: number): Promise<void> => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const recordings = await listVideoRecordings();
      if (recordings.length === expected) {
        return;
      }
      // Use setTimeout instead of setImmediate for more reliable cross-platform timing
      // The auto-stop callback fires async work that needs multiple event loop cycles
      await defaultTimer.sleep(1);
    }
    throw new Error(`Timed out waiting for ${expected} recordings`);
  };

  test("auto-stops recordings using FakeTimer", async () => {
    const stopCall = fakeBackend.waitForStopCall();
    const active = await startVideoRecording({
      device: testDevice,
      maxDurationSeconds: 2,
    });

    expect(fakeTimer.getPendingTimeoutCount()).toBe(1);
    expect(fakeBackend.stopCalls.length).toBe(0);

    fakeTimer.advanceTime(1999);
    expect(fakeBackend.stopCalls.length).toBe(0);

    fakeTimer.advanceTime(1);
    await stopCall;
    await waitForRecordingCount(1);

    const recordings = await listVideoRecordings();
    expect(recordings[0]?.recordingId).toBe(active.recordingId);
  });

  test("manual stop clears auto-stop timeout", async () => {
    const active = await startVideoRecording({
      device: testDevice,
      maxDurationSeconds: 3,
    });

    expect(fakeTimer.getPendingTimeoutCount()).toBe(1);

    await stopVideoRecording(active.recordingId);
    expect(fakeTimer.getPendingTimeoutCount()).toBe(0);
    expect(fakeBackend.stopCalls.length).toBe(1);

    fakeTimer.advanceTime(3000);
    expect(fakeBackend.stopCalls.length).toBe(1);
  });

  test("records highlight timelines for scheduled highlights", async () => {
    const highlightShapeOne = {
      type: "box",
      bounds: { x: 10, y: 20, width: 30, height: 40 },
    } as const;
    const highlightShapeTwo = {
      type: "circle",
      bounds: { x: 50, y: 60, width: 25, height: 25 },
    } as const;

    const active = await startVideoRecording({
      device: testDevice,
      highlights: [
        {
          description: "Expected position",
          shape: highlightShapeOne,
          timing: { startTimeMs: 0 },
        },
        {
          description: "Actual position",
          shape: highlightShapeTwo,
          timing: { startTimeMs: 1000 },
        },
      ],
      maxDurationSeconds: 5,
    });

    fakeTimer.advanceTime(1000);
    await new Promise(resolve => setImmediate(resolve));
    fakeTimer.advanceTime(1000);
    await new Promise(resolve => setImmediate(resolve));
    fakeTimer.advanceTime(1000);
    await new Promise(resolve => setImmediate(resolve));

    fakeBackend.setStopResultOverrides({
      endedAt: new Date(fakeTimer.now()).toISOString(),
    });

    const { metadata } = await stopVideoRecording(active.recordingId);

    expect(metadata.highlights).toEqual([
      {
        description: "Expected position",
        shape: highlightShapeOne,
        timeline: { appearedAtSeconds: 0, disappearedAtSeconds: 3 },
      },
      {
        description: "Actual position",
        shape: highlightShapeTwo,
        timeline: { appearedAtSeconds: 1, disappearedAtSeconds: 3 },
      },
    ]);
  });

  test("records dynamic highlight events during recording", async () => {
    const highlightShape = {
      type: "box",
      bounds: { x: 5, y: 15, width: 50, height: 60 },
    } as const;

    const active = await startVideoRecording({
      device: testDevice,
      maxDurationSeconds: 5,
    });

    fakeTimer.advanceTime(500);
    await recordVideoRecordingHighlightAdded(testDevice, {
      shape: highlightShape,
    });

    fakeTimer.advanceTime(500);
    fakeBackend.setStopResultOverrides({
      endedAt: new Date(fakeTimer.now()).toISOString(),
    });

    const { metadata } = await stopVideoRecording(active.recordingId);

    expect(metadata.highlights).toEqual([
      {
        shape: highlightShape,
        timeline: { appearedAtSeconds: 0.5, disappearedAtSeconds: 1 },
      },
    ]);
  });
});
