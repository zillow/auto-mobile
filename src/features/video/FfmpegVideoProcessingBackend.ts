import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { platform } from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { ActionableError, type BootedDevice } from "../../models";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { SimCtlClient } from "../../utils/ios-cmdline-tools/SimCtlClient";
import { logger } from "../../utils/logger";
import type {
  RecordingHandle,
  RecordingResult,
  VideoCaptureBackend,
  VideoCaptureConfig,
} from "./VideoRecorderService";

const PROCESS_EXIT_TIMEOUT_MS = 5000;

interface ProcessExitState {
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  endedAt?: string;
}

interface ProcessTracker {
  process: ChildProcessWithoutNullStreams;
  exitState: ProcessExitState;
  exitPromise: Promise<void>;
  stderr: string[];
}

interface HardwareAccelInfo {
  encoder: string;
  available: boolean;
  description: string;
}

type FfmpegInput =
  | { type: "pipe" }
  | { type: "file"; path: string };

interface FfmpegBackendHandle {
  kind: "ffmpeg";
  platform: "android" | "ios";
  captureTracker: ProcessTracker;
  ffmpegTracker?: ProcessTracker;
  capturePath?: string;
  config: VideoCaptureConfig;
}

function createExitTracker(
  process: ChildProcessWithoutNullStreams,
  stderr: string[]
): { exitState: ProcessExitState; exitPromise: Promise<void> } {
  const exitState: ProcessExitState = {};
  let resolvePromise: (() => void) | null = null;
  let rejectPromise: ((error: Error) => void) | null = null;

  const exitPromise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  process.once("error", error => {
    rejectPromise?.(error instanceof Error ? error : new Error(String(error)));
  });

  process.once("exit", (code, signal) => {
    exitState.exitCode = code;
    exitState.signal = signal;
    exitState.endedAt = new Date().toISOString();
    resolvePromise?.();
  });

  process.stderr.on("data", chunk => {
    stderr.push(chunk.toString());
  });

  if (process.exitCode !== null) {
    exitState.exitCode = process.exitCode;
    exitState.signal = process.signalCode;
    exitState.endedAt = new Date().toISOString();
    resolvePromise?.();
  }

  return { exitState, exitPromise };
}

function trackProcess(process: ChildProcessWithoutNullStreams): ProcessTracker {
  const stderr: string[] = [];
  const { exitState, exitPromise } = createExitTracker(process, stderr);
  return { process, exitState, exitPromise, stderr };
}

async function waitForExit(
  process: ChildProcessWithoutNullStreams,
  exitPromise: Promise<void>
): Promise<void> {
  if (process.exitCode !== null) {
    await exitPromise;
    return;
  }

  if (process.killed) {
    await exitPromise;
    return;
  }

  process.kill("SIGINT");

  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<void>(resolve => {
    timeoutId = setTimeout(() => {
      if (process.exitCode === null) {
        process.kill("SIGKILL");
      }
      resolve();
    }, PROCESS_EXIT_TIMEOUT_MS);
  });

  await Promise.race([exitPromise, timeoutPromise]);

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  await exitPromise;
}

export class FfmpegVideoProcessingBackend implements VideoCaptureBackend {
  private ffmpegPath: string = "ffmpeg";
  private hwAccelCache: Map<string, HardwareAccelInfo> = new Map();

  async start(config: VideoCaptureConfig): Promise<RecordingHandle> {
    await this.ensureFfmpegAvailable();

    const device = config.device;
    if (!device) {
      throw new ActionableError("Device is required to start video recording.");
    }

    if (device.platform === "android") {
      return this.startAndroid(device, config);
    }

    if (device.platform === "ios") {
      return this.startIos(device, config);
    }

    throw new ActionableError(`Unsupported platform for video recording: ${device.platform}`);
  }

  async stop(handle: RecordingHandle): Promise<RecordingResult> {
    const backendHandle = handle.backendHandle as FfmpegBackendHandle | undefined;
    if (!backendHandle) {
      throw new Error("Missing backend handle for FFmpeg video recording.");
    }

    if (backendHandle.platform === "android") {
      await waitForExit(
        backendHandle.captureTracker.process,
        backendHandle.captureTracker.exitPromise
      );

      if (backendHandle.ffmpegTracker) {
        await waitForExit(
          backendHandle.ffmpegTracker.process,
          backendHandle.ffmpegTracker.exitPromise
        );
      }
    } else {
      await waitForExit(
        backendHandle.captureTracker.process,
        backendHandle.captureTracker.exitPromise
      );
      await this.postProcessRecording(backendHandle);
    }

    const sizeBytes = await this.getFileSize(handle.outputPath);
    const codec = "h264";

    this.logProcessWarnings("capture", backendHandle.captureTracker);
    if (backendHandle.ffmpegTracker) {
      this.logProcessWarnings("ffmpeg", backendHandle.ffmpegTracker);
    }

    return {
      recordingId: handle.recordingId,
      outputPath: handle.outputPath,
      startedAt: handle.startedAt,
      endedAt: backendHandle.captureTracker.exitState.endedAt ?? new Date().toISOString(),
      sizeBytes,
      codec,
    };
  }

  private async startAndroid(
    device: BootedDevice,
    config: VideoCaptureConfig
  ): Promise<RecordingHandle> {
    const adb = new AdbClient(device);
    const { adbPath, baseArgs } = await adb.getBaseCommandParts();

    const screenrecordArgs = [
      ...baseArgs,
      "exec-out",
      "screenrecord",
      "-",
    ];

    logger.info(`[FfmpegVideo] Starting screenrecord: ${adbPath} ${screenrecordArgs.join(" ")}`);

    const captureProcess = spawn(adbPath, screenrecordArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    captureProcess.stderr.on("data", chunk => {
      const text = chunk.toString();
      logger.info(`[FfmpegVideo] screenrecord stderr: ${text.trim()}`);
    });

    let bytesReceived = 0;
    captureProcess.stdout.on("data", chunk => {
      bytesReceived += chunk.length;
      if (bytesReceived % (1024 * 100) === 0) {
        logger.info(`[FfmpegVideo] Received ${bytesReceived} bytes from screenrecord`);
      }
    });

    try {
      await this.waitForSpawn(captureProcess);
      logger.info(`[FfmpegVideo] screenrecord process spawned`);
    } catch (error) {
      logger.error(`[FfmpegVideo] Failed to spawn screenrecord: ${error}`);
      throw new ActionableError(`Failed to start Android screenrecord: ${error}`);
    }

    const hwAccel = await this.detectHardwareAccel();
    const ffmpegArgs = await this.buildFfmpegArgs(config, hwAccel, { type: "pipe" });

    logger.info(`[FfmpegVideo] Starting ffmpeg: ${this.ffmpegPath} ${ffmpegArgs.join(" ")}`);

    const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    captureProcess.stdout.pipe(ffmpegProcess.stdin);
    logger.info(`[FfmpegVideo] Piped screenrecord stdout to ffmpeg stdin`);

    try {
      await this.waitForSpawn(ffmpegProcess);
      logger.info(`[FfmpegVideo] ffmpeg process spawned`);
    } catch (error) {
      logger.error(`[FfmpegVideo] Failed to spawn ffmpeg: ${error}`);
      captureProcess.kill("SIGKILL");
      throw new ActionableError(`Failed to start FFmpeg encoder: ${error}`);
    }

    const captureTracker = trackProcess(captureProcess);
    const ffmpegTracker = trackProcess(ffmpegProcess);

    const backendHandle: FfmpegBackendHandle = {
      kind: "ffmpeg",
      platform: "android",
      captureTracker,
      ffmpegTracker,
      config,
    };

    return {
      recordingId: config.recordingId,
      outputPath: config.outputPath,
      startedAt: config.startedAt,
      backendHandle,
    };
  }

  private async startIos(
    device: BootedDevice,
    config: VideoCaptureConfig
  ): Promise<RecordingHandle> {
    const simctl = new SimCtlClient(device);
    const available = await simctl.isAvailable();
    if (!available) {
      throw new ActionableError("simctl is not available. Install Xcode command line tools.");
    }

    const capturePath = path.join(
      config.outputDirectory,
      `${config.recordingId}-raw.mov`
    );

    const args = [
      "simctl",
      "io",
      device.deviceId,
      "recordVideo",
      capturePath,
    ];

    const captureProcess = spawn("xcrun", args, { stdio: ["ignore", "pipe", "pipe"] });

    try {
      await this.waitForSpawn(captureProcess);
    } catch (error) {
      throw new ActionableError(`Failed to start iOS recording: ${error}`);
    }

    const captureTracker = trackProcess(captureProcess);

    const backendHandle: FfmpegBackendHandle = {
      kind: "ffmpeg",
      platform: "ios",
      captureTracker,
      capturePath,
      config,
    };

    return {
      recordingId: config.recordingId,
      outputPath: config.outputPath,
      startedAt: config.startedAt,
      backendHandle,
    };
  }

  private async postProcessRecording(backendHandle: FfmpegBackendHandle): Promise<void> {
    const capturePath = backendHandle.capturePath;
    if (!capturePath) {
      throw new ActionableError("Missing iOS capture path for FFmpeg processing.");
    }

    const exists = await fs.pathExists(capturePath);
    if (!exists) {
      throw new ActionableError(`iOS recording file missing at ${capturePath}`);
    }

    const hwAccel = await this.detectHardwareAccel();
    const ffmpegArgs = await this.buildFfmpegArgs(
      backendHandle.config,
      hwAccel,
      { type: "file", path: capturePath }
    );

    logger.info(`[FfmpegVideo] Starting ffmpeg post-process: ${this.ffmpegPath} ${ffmpegArgs.join(" ")}`);

    const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    try {
      await this.waitForSpawn(ffmpegProcess);
    } catch (error) {
      throw new ActionableError(`Failed to start FFmpeg post-processing: ${error}`);
    }

    const ffmpegTracker = trackProcess(ffmpegProcess);
    backendHandle.ffmpegTracker = ffmpegTracker;

    await waitForExit(ffmpegProcess, ffmpegTracker.exitPromise);

    if (ffmpegTracker.exitState.exitCode && ffmpegTracker.exitState.exitCode !== 0) {
      throw new ActionableError(
        `FFmpeg post-processing failed with code ${ffmpegTracker.exitState.exitCode}: ${ffmpegTracker.stderr.join("")}`
      );
    }

    const outputExists = await fs.pathExists(backendHandle.config.outputPath);
    if (!outputExists) {
      throw new ActionableError(`FFmpeg output file missing at ${backendHandle.config.outputPath}`);
    }

    try {
      await fs.remove(capturePath);
    } catch (error) {
      logger.warn(`[FfmpegVideo] Failed to remove raw recording ${capturePath}: ${error}`);
    }
  }

  private async buildFfmpegArgs(
    config: VideoCaptureConfig,
    hwAccel: HardwareAccelInfo,
    input: FfmpegInput
  ): Promise<string[]> {
    const args: string[] = [];

    if (input.type === "pipe") {
      args.push("-f", "mp4", "-i", "pipe:0");
    } else {
      args.push("-i", input.path);
    }

    args.push("-r", String(config.fps));

    if (config.resolution) {
      args.push(
        "-vf",
        `scale=${config.resolution.width}:${config.resolution.height}`
      );
    }

    if (hwAccel.available) {
      args.push("-c:v", hwAccel.encoder);
      logger.info(
        `[FfmpegVideo] Using hardware acceleration: ${hwAccel.description}`
      );
    } else {
      args.push("-c:v", "libx264");
      args.push("-preset", "ultrafast");
      logger.warn(
        `[FfmpegVideo] Hardware acceleration unavailable, falling back to software encoding`
      );
    }

    args.push("-b:v", `${config.targetBitrateKbps}k`);
    args.push("-maxrate", `${config.targetBitrateKbps}k`);
    args.push("-bufsize", `${config.targetBitrateKbps * 2}k`);

    args.push("-profile:v", "baseline");
    args.push("-level", "3.0");
    args.push("-pix_fmt", "yuv420p");

    args.push("-movflags", "+faststart");

    if (config.maxDurationSeconds && config.maxDurationSeconds > 0) {
      args.push("-t", String(config.maxDurationSeconds));
    }

    args.push("-y");
    args.push(config.outputPath);

    return args;
  }

  private async detectHardwareAccel(): Promise<HardwareAccelInfo> {
    const os = platform();
    const cacheKey = os;

    if (this.hwAccelCache.has(cacheKey)) {
      return this.hwAccelCache.get(cacheKey)!;
    }

    let result: HardwareAccelInfo;

    if (os === "darwin") {
      result = await this.detectVideoToolbox();
    } else if (os === "linux") {
      result = await this.detectLinuxHwAccel();
    } else {
      result = {
        encoder: "libx264",
        available: false,
        description: `Unsupported platform: ${os}`,
      };
    }

    this.hwAccelCache.set(cacheKey, result);
    return result;
  }

  private async detectVideoToolbox(): Promise<HardwareAccelInfo> {
    try {
      const encoders = await this.listEncoders();
      const hasVideoToolbox = encoders.some(
        enc => enc.includes("h264_videotoolbox")
      );

      if (hasVideoToolbox) {
        return {
          encoder: "h264_videotoolbox",
          available: true,
          description: "macOS VideoToolbox (hardware acceleration)",
        };
      }

      return {
        encoder: "libx264",
        available: false,
        description: "VideoToolbox not available",
      };
    } catch (error) {
      logger.warn(`[FfmpegVideo] Failed to detect VideoToolbox: ${error}`);
      return {
        encoder: "libx264",
        available: false,
        description: "VideoToolbox detection failed",
      };
    }
  }

  private async detectLinuxHwAccel(): Promise<HardwareAccelInfo> {
    try {
      const encoders = await this.listEncoders();

      const nvencAvailable = encoders.some(enc => enc.includes("h264_nvenc"));
      if (nvencAvailable) {
        return {
          encoder: "h264_nvenc",
          available: true,
          description: "NVIDIA NVENC (hardware acceleration)",
        };
      }

      const vaapiAvailable = encoders.some(enc => enc.includes("h264_vaapi"));
      if (vaapiAvailable) {
        return {
          encoder: "h264_vaapi",
          available: true,
          description: "VAAPI (hardware acceleration)",
        };
      }

      return {
        encoder: "libx264",
        available: false,
        description: "No hardware acceleration available (VAAPI/NVENC not found)",
      };
    } catch (error) {
      logger.warn(`[FfmpegVideo] Failed to detect Linux HW accel: ${error}`);
      return {
        encoder: "libx264",
        available: false,
        description: "Hardware acceleration detection failed",
      };
    }
  }

  private async listEncoders(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.ffmpegPath, ["-encoders"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      process.stdout.on("data", chunk => {
        stdout += chunk.toString();
      });

      process.stderr.on("data", chunk => {
        stderr += chunk.toString();
      });

      process.once("error", error => reject(error));
      process.once("exit", code => {
        if (code === 0) {
          const encoders = stdout
            .split("\n")
            .filter(line => line.trim().startsWith("V"))
            .map(line => line.trim().split(/\s+/)[1])
            .filter(Boolean);
          resolve(encoders);
        } else {
          reject(new Error(`ffmpeg -encoders exited with code ${code}: ${stderr}`));
        }
      });
    });
  }

  private async ensureFfmpegAvailable(): Promise<void> {
    try {
      await this.checkFfmpegVersion();
    } catch (error) {
      throw new ActionableError(
        `FFmpeg is not available. Please install FFmpeg to use video recording.\n` +
          `  macOS: brew install ffmpeg\n` +
          `  Linux: apt-get install ffmpeg or yum install ffmpeg\n` +
          `Error: ${error}`
      );
    }
  }

  private async checkFfmpegVersion(): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.ffmpegPath, ["-version"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";

      process.stdout.on("data", chunk => {
        stdout += chunk.toString();
      });

      process.once("error", error => reject(error));
      process.once("exit", code => {
        if (code === 0 && stdout.includes("ffmpeg version")) {
          const versionMatch = stdout.match(/ffmpeg version (\S+)/);
          if (versionMatch) {
            logger.debug(`[FfmpegVideo] Found FFmpeg ${versionMatch[1]}`);
          }
          resolve();
        } else {
          reject(new Error("FFmpeg not found or invalid version output"));
        }
      });
    });
  }

  private async waitForSpawn(process: ChildProcessWithoutNullStreams): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      process.once("spawn", () => resolve());
      process.once("error", error => reject(error));
    });
  }

  private async getFileSize(filePath: string): Promise<number | undefined> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch {
      return undefined;
    }
  }

  private logProcessWarnings(label: string, tracker: ProcessTracker): void {
    if (tracker.exitState.exitCode && tracker.exitState.exitCode !== 0) {
      logger.warn(
        `[FfmpegVideo] ${label} exited with code ${tracker.exitState.exitCode}: ${tracker.stderr.join("")}`
      );
    }

    if (tracker.stderr.length > 0) {
      logger.info(`[FfmpegVideo] ${label} stderr: ${tracker.stderr.join("")}`);
    }
  }
}
