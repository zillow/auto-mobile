import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { FakeTimer } from "../fakes/FakeTimer";
import { FakeVideoCaptureBackend } from "../fakes/FakeVideoCaptureBackend";
import { VideoRecorderService } from "../../src/features/video";
import type { BootedDevice } from "../../src/models";
import {
  listVideoRecordings,
  resetVideoRecordingManagerDependencies,
  setVideoRecordingManagerDependencies,
  startVideoRecording,
  stopVideoRecording,
} from "../../src/server/videoRecordingManager";

describe("videoRecordingManager", () => {
  let fakeTimer: FakeTimer;
  let fakeBackend: FakeVideoCaptureBackend;
  let archiveRoot: string;
  let testDevice: BootedDevice;

  beforeEach(async () => {
    fakeTimer = new FakeTimer();
    fakeTimer.setManualMode();
    fakeBackend = new FakeVideoCaptureBackend();
    archiveRoot = await fs.mkdtemp(path.join(os.tmpdir(), "auto-mobile-video-"));

    const service = new VideoRecorderService({
      backend: fakeBackend,
      archiveRoot,
      now: () => new Date(fakeTimer.now()),
    });

    setVideoRecordingManagerDependencies({
      videoRecorderService: service,
      timer: fakeTimer,
    });

    testDevice = {
      deviceId: "test-device",
      platform: "android",
      name: "Test Device",
    };
  });

  afterEach(async () => {
    resetVideoRecordingManagerDependencies();
    await fs.remove(archiveRoot);
  });

  const waitForRecordingCount = async (expected: number): Promise<void> => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const recordings = await listVideoRecordings();
      if (recordings.length === expected) {
        return;
      }
      await new Promise(resolve => setImmediate(resolve));
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
});
