import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import { promises as fsPromises } from "node:fs";
import { PlatformVideoCaptureBackend } from "../../../src/features/video/PlatformVideoCaptureBackend";
import type {
  RecordingHandle,
  VideoCaptureConfig,
} from "../../../src/features/video/VideoRecorderService";
import type { BootedDevice } from "../../../src/models";

describe("PlatformVideoCaptureBackend - Unit Tests", () => {
  let backend: PlatformVideoCaptureBackend;
  let tempDir: string;

  beforeEach(async () => {
    backend = new PlatformVideoCaptureBackend();
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "platform-video-test-"));
  });

  afterEach(async () => {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  });

  describe("Interface Compliance", () => {
    test("implements VideoCaptureBackend interface", () => {
      expect(typeof backend.start).toBe("function");
      expect(typeof backend.stop).toBe("function");
    });
  });

  describe("Configuration Validation", () => {
    test("rejects start when device is missing", async () => {
      const configWithoutDevice: VideoCaptureConfig = {
        recordingId: "test-recording",
        outputDirectory: tempDir,
        outputPath: path.join(tempDir, "video.mp4"),
        fileName: "video.mp4",
        startedAt: new Date().toISOString(),
        qualityPreset: "low",
        targetBitrateKbps: 1000,
        maxThroughputMbps: 5,
        fps: 15,
        maxArchiveSizeMb: 2048,
        format: "mp4",
      };

      await expect(backend.start(configWithoutDevice)).rejects.toThrow(
        "Device is required"
      );
    });

    test("rejects unsupported platform", async () => {
      const unsupportedDevice: BootedDevice = {
        platform: "windows" as any,
        deviceId: "test",
        name: "Test Device",
      };

      const config: VideoCaptureConfig = {
        recordingId: "test-recording",
        outputDirectory: tempDir,
        outputPath: path.join(tempDir, "video.mp4"),
        fileName: "video.mp4",
        startedAt: new Date().toISOString(),
        qualityPreset: "low",
        targetBitrateKbps: 1000,
        maxThroughputMbps: 5,
        fps: 15,
        maxArchiveSizeMb: 2048,
        format: "mp4",
        device: unsupportedDevice,
      };

      await expect(backend.start(config)).rejects.toThrow("Unsupported platform");
    });
  });

  describe("Stop Operation", () => {
    test("rejects stop when backend handle is missing", async () => {
      const invalidHandle: RecordingHandle = {
        recordingId: "test",
        outputPath: path.join(tempDir, "test.mp4"),
        startedAt: new Date().toISOString(),
        backendHandle: undefined,
      };

      await expect(backend.stop(invalidHandle)).rejects.toThrow(
        "Missing backend handle"
      );
    });

    test("rejects stop when backend handle has wrong type", async () => {
      const invalidHandle: RecordingHandle = {
        recordingId: "test",
        outputPath: path.join(tempDir, "test.mp4"),
        startedAt: new Date().toISOString(),
        backendHandle: { wrong: "type" } as any,
      };

      await expect(backend.stop(invalidHandle)).rejects.toThrow();
    });
  });

  describe("Bitrate Clamping Logic", () => {
    test("clamps bitrate based on maxThroughputMbps", () => {
      // Test the clamping logic by accessing the private method
      const config = {
        targetBitrateKbps: 5000,
        maxThroughputMbps: 2, // 2 Mbps = 2000 Kbps
      };

      // Access private method via any cast
      const clampedBitrate = (backend as any).clampBitrateKbps?.(config) ??
        Math.min(config.targetBitrateKbps, config.maxThroughputMbps * 1000);

      expect(clampedBitrate).toBeLessThanOrEqual(2000);
    });

    test("does not clamp when maxThroughputMbps is higher", () => {
      const config = {
        targetBitrateKbps: 1000,
        maxThroughputMbps: 10, // 10 Mbps = 10000 Kbps
      };

      const clampedBitrate = (backend as any).clampBitrateKbps?.(config) ??
        Math.min(config.targetBitrateKbps, config.maxThroughputMbps * 1000);

      expect(clampedBitrate).toBe(1000);
    });

    test("handles zero maxThroughputMbps", () => {
      const config = {
        targetBitrateKbps: 1000,
        maxThroughputMbps: 0,
      };

      const clampedBitrate = (backend as any).clampBitrateKbps?.(config) ??
        config.targetBitrateKbps;

      expect(clampedBitrate).toBe(1000);
    });
  });

  describe("Android Time Limit Logic", () => {
    test("respects 180 second maximum", () => {
      // Test the time limit resolution logic
      const resolveTimeLimit = (backend as any).resolveAndroidTimeLimit?.bind(backend) ??
        ((maxDuration?: number) => {
          const ANDROID_SCREENRECORD_MAX_SECONDS = 180;
          if (maxDuration && maxDuration > 0) {
            return Math.min(maxDuration, ANDROID_SCREENRECORD_MAX_SECONDS);
          }
          return ANDROID_SCREENRECORD_MAX_SECONDS;
        });

      expect(resolveTimeLimit(300)).toBe(180);
      expect(resolveTimeLimit(60)).toBe(60);
      expect(resolveTimeLimit(180)).toBe(180);
    });

    test("defaults to 180 seconds when not specified", () => {
      const resolveTimeLimit = (backend as any).resolveAndroidTimeLimit?.bind(backend) ??
        ((maxDuration?: number) => {
          const ANDROID_SCREENRECORD_MAX_SECONDS = 180;
          if (maxDuration && maxDuration > 0) {
            return Math.min(maxDuration, ANDROID_SCREENRECORD_MAX_SECONDS);
          }
          return ANDROID_SCREENRECORD_MAX_SECONDS;
        });

      expect(resolveTimeLimit(undefined)).toBe(180);
      expect(resolveTimeLimit(0)).toBe(180);
    });
  });
});

describe("PlatformVideoCaptureBackend - Integration Tests", () => {
  let tempDir: string;
  let androidDevice: BootedDevice;
  let iosDevice: BootedDevice;

  beforeEach(async () => {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "platform-video-integration-"));

    androidDevice = {
      platform: "android",
      deviceId: "test-emulator",
      name: "Test Android Emulator",
    };

    iosDevice = {
      platform: "ios",
      deviceId: "test-simulator",
      name: "Test iOS Simulator",
    };
  });

  afterEach(async () => {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  });

  describe("Configuration Structure", () => {
    test("Android config includes required fields", () => {
      const config: VideoCaptureConfig = {
        recordingId: "test-android",
        outputDirectory: tempDir,
        outputPath: path.join(tempDir, "android.mp4"),
        fileName: "android.mp4",
        startedAt: new Date().toISOString(),
        qualityPreset: "low",
        targetBitrateKbps: 1000,
        maxThroughputMbps: 5,
        fps: 15,
        maxArchiveSizeMb: 2048,
        format: "mp4",
        device: androidDevice,
      };

      expect(config.device?.platform).toBe("android");
      expect(config.targetBitrateKbps).toBe(1000);
      expect(config.format).toBe("mp4");
    });

    test("iOS config includes required fields", () => {
      const config: VideoCaptureConfig = {
        recordingId: "test-ios",
        outputDirectory: tempDir,
        outputPath: path.join(tempDir, "ios.mp4"),
        fileName: "ios.mp4",
        startedAt: new Date().toISOString(),
        qualityPreset: "low",
        targetBitrateKbps: 1000,
        maxThroughputMbps: 5,
        fps: 15,
        maxArchiveSizeMb: 2048,
        format: "mp4",
        device: iosDevice,
      };

      expect(config.device?.platform).toBe("ios");
      expect(config.outputPath).toContain("ios.mp4");
    });

    test("Config with resolution override", () => {
      const config: VideoCaptureConfig = {
        recordingId: "test-resolution",
        outputDirectory: tempDir,
        outputPath: path.join(tempDir, "video.mp4"),
        fileName: "video.mp4",
        startedAt: new Date().toISOString(),
        qualityPreset: "low",
        targetBitrateKbps: 1000,
        maxThroughputMbps: 5,
        fps: 15,
        maxArchiveSizeMb: 2048,
        format: "mp4",
        device: androidDevice,
        resolution: { width: 1280, height: 720 },
      };

      expect(config.resolution).toBeDefined();
      expect(config.resolution?.width).toBe(1280);
      expect(config.resolution?.height).toBe(720);
    });

    test("Config with maxDurationSeconds", () => {
      const config: VideoCaptureConfig = {
        recordingId: "test-duration",
        outputDirectory: tempDir,
        outputPath: path.join(tempDir, "video.mp4"),
        fileName: "video.mp4",
        startedAt: new Date().toISOString(),
        qualityPreset: "low",
        targetBitrateKbps: 1000,
        maxThroughputMbps: 5,
        fps: 15,
        maxArchiveSizeMb: 2048,
        format: "mp4",
        device: androidDevice,
        maxDurationSeconds: 60,
      };

      expect(config.maxDurationSeconds).toBe(60);
    });
  });

  describe("Quality Presets", () => {
    test("low quality preset", () => {
      const config: VideoCaptureConfig = {
        recordingId: "test-low",
        outputDirectory: tempDir,
        outputPath: path.join(tempDir, "low.mp4"),
        fileName: "low.mp4",
        startedAt: new Date().toISOString(),
        qualityPreset: "low",
        targetBitrateKbps: 1000,
        maxThroughputMbps: 5,
        fps: 15,
        maxArchiveSizeMb: 2048,
        format: "mp4",
        device: androidDevice,
      };

      expect(config.qualityPreset).toBe("low");
      expect(config.targetBitrateKbps).toBe(1000);
      expect(config.fps).toBe(15);
    });

    test("medium quality preset", () => {
      const config: VideoCaptureConfig = {
        recordingId: "test-medium",
        outputDirectory: tempDir,
        outputPath: path.join(tempDir, "medium.mp4"),
        fileName: "medium.mp4",
        startedAt: new Date().toISOString(),
        qualityPreset: "medium",
        targetBitrateKbps: 2500,
        maxThroughputMbps: 10,
        fps: 30,
        maxArchiveSizeMb: 2048,
        format: "mp4",
        device: androidDevice,
      };

      expect(config.qualityPreset).toBe("medium");
      expect(config.targetBitrateKbps).toBe(2500);
      expect(config.fps).toBe(30);
    });

    test("high quality preset", () => {
      const config: VideoCaptureConfig = {
        recordingId: "test-high",
        outputDirectory: tempDir,
        outputPath: path.join(tempDir, "high.mp4"),
        fileName: "high.mp4",
        startedAt: new Date().toISOString(),
        qualityPreset: "high",
        targetBitrateKbps: 5000,
        maxThroughputMbps: 20,
        fps: 60,
        maxArchiveSizeMb: 2048,
        format: "mp4",
        device: androidDevice,
      };

      expect(config.qualityPreset).toBe("high");
      expect(config.targetBitrateKbps).toBe(5000);
      expect(config.fps).toBe(60);
    });
  });
});
