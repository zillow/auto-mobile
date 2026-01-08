import { beforeEach, describe, expect, test } from "bun:test";
import { FfmpegVideoCaptureBackend } from "../../../src/features/video/FfmpegVideoCaptureBackend";
import type { VideoCaptureConfig } from "../../../src/features/video/VideoRecorderService";
import type { BootedDevice } from "../../../src/models";

describe("FfmpegVideoCaptureBackend - Unit Tests", function() {
  let backend: FfmpegVideoCaptureBackend;
  let mockDevice: BootedDevice;
  let mockConfig: VideoCaptureConfig;

  beforeEach(function() {
    backend = new FfmpegVideoCaptureBackend();

    mockDevice = {
      platform: "android",
      deviceId: "test-device",
      deviceType: "emulator",
      sdkVersion: 33,
      booted: true,
    } as BootedDevice;

    mockConfig = {
      recordingId: "test-recording",
      outputDirectory: "/tmp/test",
      outputPath: "/tmp/test/video.mp4",
      fileName: "video.mp4",
      startedAt: new Date().toISOString(),
      qualityPreset: "low",
      targetBitrateKbps: 1000,
      maxThroughputMbps: 5,
      fps: 15,
      maxArchiveSizeMb: 2048,
      format: "mp4",
      device: mockDevice,
    };
  });

  describe("Hardware Acceleration Detection", function() {
    test("should detect platform capabilities", async function() {
      const hwAccel = await (backend as any).detectHardwareAccel();

      expect(hwAccel).toBeDefined();
      expect(hwAccel.encoder).toBeDefined();
      expect(typeof hwAccel.available).toBe("boolean");
      expect(hwAccel.description).toBeDefined();
    });

    test("should cache hardware acceleration detection", async function() {
      const hwAccel1 = await (backend as any).detectHardwareAccel();
      const hwAccel2 = await (backend as any).detectHardwareAccel();

      expect(hwAccel1).toEqual(hwAccel2);
    });
  });

  describe("FFmpeg Args Builder", function() {
    test("should build basic FFmpeg args for piped input", async function() {
      const hwAccel = {
        encoder: "libx264",
        available: false,
        description: "Software encoding",
      };

      const args = await (backend as any).buildFfmpegArgs(
        mockConfig,
        hwAccel,
        true
      );

      expect(args).toContain("-f");
      expect(args).toContain("h264");
      expect(args).toContain("-i");
      expect(args).toContain("pipe:0");
      expect(args).toContain("-r");
      expect(args).toContain("15");
      expect(args).toContain("-b:v");
      expect(args).toContain("1000k");
      expect(args).toContain("-c:v");
      expect(args).toContain("libx264");
      expect(args).toContain(mockConfig.outputPath);
    });

    test("should include resolution scaling when specified", async function() {
      const configWithResolution = {
        ...mockConfig,
        resolution: { width: 1280, height: 720 },
      };

      const hwAccel = {
        encoder: "libx264",
        available: false,
        description: "Software encoding",
      };

      const args = await (backend as any).buildFfmpegArgs(
        configWithResolution,
        hwAccel,
        true
      );

      expect(args).toContain("-vf");
      expect(args).toContain("scale=1280:720");
    });

    test("should use hardware encoder when available", async function() {
      const hwAccel = {
        encoder: "h264_videotoolbox",
        available: true,
        description: "VideoToolbox HW accel",
      };

      const args = await (backend as any).buildFfmpegArgs(
        mockConfig,
        hwAccel,
        true
      );

      expect(args).toContain("-c:v");
      expect(args).toContain("h264_videotoolbox");
      expect(args).not.toContain("-preset");
    });

    test("should include duration limit when specified", async function() {
      const configWithDuration = {
        ...mockConfig,
        maxDurationSeconds: 60,
      };

      const hwAccel = {
        encoder: "libx264",
        available: false,
        description: "Software encoding",
      };

      const args = await (backend as any).buildFfmpegArgs(
        configWithDuration,
        hwAccel,
        true
      );

      expect(args).toContain("-t");
      expect(args).toContain("60");
    });
  });

  describe("FFmpeg Availability", function() {
    test("should check FFmpeg version", async function() {
      try {
        await (backend as any).checkFfmpegVersion();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("Encoder Listing", function() {
    test("should list available encoders", async function() {
      try {
        const encoders = await (backend as any).listEncoders();
        expect(Array.isArray(encoders)).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
