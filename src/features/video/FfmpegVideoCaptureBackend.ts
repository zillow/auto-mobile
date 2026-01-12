import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { platform } from "node:os";
import fs from "fs-extra";
import { ActionableError, type BootedDevice } from "../../models";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
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

interface FfmpegBackendHandle {
  kind: "ffmpeg";
  process: ChildProcessWithoutNullStreams;
  sourceProcess?: ChildProcessWithoutNullStreams;
  exitState: ProcessExitState;
  exitPromise: Promise<void>;
  stderr: string[];
}

interface HardwareAccelInfo {
  encoder: string;
  available: boolean;
  description: string;
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

export class FfmpegVideoCaptureBackend implements VideoCaptureBackend {
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

    if (backendHandle.sourceProcess) {
      await waitForExit(backendHandle.sourceProcess, Promise.resolve());
    }

    await waitForExit(backendHandle.process, backendHandle.exitPromise);

    const sizeBytes = await this.getFileSize(handle.outputPath);
    const codec = "h264";

    if (backendHandle.exitState.exitCode && backendHandle.exitState.exitCode !== 0) {
      logger.warn(
        `[FfmpegVideoCapture] Recording exited with code ${backendHandle.exitState.exitCode}: ${backendHandle.stderr.join("")}`
      );
    }

    return {
      recordingId: handle.recordingId,
      outputPath: handle.outputPath,
      startedAt: handle.startedAt,
      endedAt: backendHandle.exitState.endedAt ?? new Date().toISOString(),
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

    // Remove --output-format flag as it's not supported by screenrecord
    // screenrecord always outputs in mp4 format which contains h264
    const screenrecordArgs = [
      ...baseArgs,
      "exec-out",
      "screenrecord",
      "-",
    ];

    logger.info(`[FfmpegVideoCapture] Starting screenrecord: ${adbPath} ${screenrecordArgs.join(" ")}`);

    const sourceProcess = spawn(adbPath, screenrecordArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Log screenrecord stderr
    const screenrecordStderr: string[] = [];
    sourceProcess.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      screenrecordStderr.push(text);
      logger.info(`[FfmpegVideoCapture] screenrecord stderr: ${text.trim()}`);
    });

    // Log when data flows
    let bytesReceived = 0;
    sourceProcess.stdout.on("data", (chunk) => {
      bytesReceived += chunk.length;
      if (bytesReceived % (1024 * 100) === 0) { // Log every 100KB
        logger.info(`[FfmpegVideoCapture] Received ${bytesReceived} bytes from screenrecord`);
      }
    });

    try {
      await this.waitForSpawn(sourceProcess);
      logger.info(`[FfmpegVideoCapture] screenrecord process spawned`);
    } catch (error) {
      logger.error(`[FfmpegVideoCapture] Failed to spawn screenrecord: ${error}`);
      throw new ActionableError(`Failed to start Android screenrecord: ${error}`);
    }

    const hwAccel = await this.detectHardwareAccel();
    const ffmpegArgs = await this.buildFfmpegArgs(config, hwAccel, true);

    logger.info(`[FfmpegVideoCapture] Starting ffmpeg: ${this.ffmpegPath} ${ffmpegArgs.join(" ")}`);

    const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    sourceProcess.stdout.pipe(ffmpegProcess.stdin);
    logger.info(`[FfmpegVideoCapture] Piped screenrecord stdout to ffmpeg stdin`);

    try {
      await this.waitForSpawn(ffmpegProcess);
      logger.info(`[FfmpegVideoCapture] ffmpeg process spawned`);
    } catch (error) {
      logger.error(`[FfmpegVideoCapture] Failed to spawn ffmpeg: ${error}`);
      sourceProcess.kill("SIGKILL");
      throw new ActionableError(`Failed to start FFmpeg encoder: ${error}`);
    }

    const stderr: string[] = [];
    const { exitState, exitPromise } = createExitTracker(ffmpegProcess, stderr);

    const backendHandle: FfmpegBackendHandle = {
      kind: "ffmpeg",
      process: ffmpegProcess,
      sourceProcess,
      exitState,
      exitPromise,
      stderr,
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
    const hwAccel = await this.detectHardwareAccel();
    const ffmpegArgs = await this.buildFfmpegArgs(config, hwAccel, false);

    const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    try {
      await this.waitForSpawn(ffmpegProcess);
    } catch (error) {
      throw new ActionableError(`Failed to start FFmpeg iOS capture: ${error}`);
    }

    const stderr: string[] = [];
    const { exitState, exitPromise } = createExitTracker(ffmpegProcess, stderr);

    const backendHandle: FfmpegBackendHandle = {
      kind: "ffmpeg",
      process: ffmpegProcess,
      exitState,
      exitPromise,
      stderr,
    };

    return {
      recordingId: config.recordingId,
      outputPath: config.outputPath,
      startedAt: config.startedAt,
      backendHandle,
    };
  }

  private async buildFfmpegArgs(
    config: VideoCaptureConfig,
    hwAccel: HardwareAccelInfo,
    pipedInput: boolean
  ): Promise<string[]> {
    const args: string[] = [];

    if (pipedInput) {
      // screenrecord outputs MP4 container format to stdout, not raw h264
      args.push("-f", "mp4", "-i", "pipe:0");
    } else {
      throw new ActionableError("Direct screen capture not yet implemented for iOS");
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
        `[FfmpegVideoCapture] Using hardware acceleration: ${hwAccel.description}`
      );
    } else {
      args.push("-c:v", "libx264");
      args.push("-preset", "ultrafast");
      logger.warn(
        `[FfmpegVideoCapture] Hardware acceleration unavailable, falling back to software encoding`
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
      logger.warn(`[FfmpegVideoCapture] Failed to detect VideoToolbox: ${error}`);
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
      logger.warn(`[FfmpegVideoCapture] Failed to detect Linux HW accel: ${error}`);
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
            logger.debug(`[FfmpegVideoCapture] Found FFmpeg ${versionMatch[1]}`);
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
}
