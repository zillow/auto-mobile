import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { WriteStream } from "node:fs";
import fs from "fs-extra";
import { ActionableError, BootedDevice } from "../../models";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { SimCtlClient } from "../../utils/ios-cmdline-tools/SimCtlClient";
import { logger } from "../../utils/logger";
import type {
  RecordingHandle,
  RecordingResult,
  VideoCaptureBackend,
  VideoCaptureConfig,
} from "./VideoRecorderService";

const ANDROID_SCREENRECORD_MAX_SECONDS = 180;
const PROCESS_EXIT_TIMEOUT_MS = 5000;

interface ProcessExitState {
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  endedAt?: string;
}

interface AndroidBackendHandle {
  kind: "android";
  process: ChildProcessWithoutNullStreams;
  outputStream: WriteStream;
  exitState: ProcessExitState;
  exitPromise: Promise<void>;
  stderr: string[];
}

interface IosBackendHandle {
  kind: "ios";
  process: ChildProcessWithoutNullStreams;
  exitState: ProcessExitState;
  exitPromise: Promise<void>;
  stderr: string[];
}

type BackendHandle = AndroidBackendHandle | IosBackendHandle;

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

function clampBitrateKbps(config: VideoCaptureConfig): number {
  const maxBitrateKbps = Math.max(0, Math.floor(config.maxThroughputMbps * 1000));
  if (!maxBitrateKbps) {
    return config.targetBitrateKbps;
  }

  return Math.min(config.targetBitrateKbps, maxBitrateKbps);
}

export class PlatformVideoCaptureBackend implements VideoCaptureBackend {
  async start(config: VideoCaptureConfig): Promise<RecordingHandle> {
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
    const backendHandle = handle.backendHandle as BackendHandle | undefined;
    if (!backendHandle) {
      throw new Error("Missing backend handle for video recording.");
    }

    await waitForExit(backendHandle.process, backendHandle.exitPromise);

    if (backendHandle.kind === "android") {
      await new Promise<void>((resolve, reject) => {
        backendHandle.outputStream.once("close", resolve);
        backendHandle.outputStream.once("error", reject);
      });
    }

    const sizeBytes = await this.getFileSize(handle.outputPath);
    const codec = "h264";

    if (backendHandle.exitState.exitCode && backendHandle.exitState.exitCode !== 0) {
      logger.warn(
        `[VideoCapture] Recording exited with code ${backendHandle.exitState.exitCode}: ${backendHandle.stderr.join("")}`
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
    const bitrateKbps = clampBitrateKbps(config);
    const bitrateBps = Math.max(1, Math.round(bitrateKbps * 1000));
    const timeLimitSeconds = this.resolveAndroidTimeLimit(config.maxDurationSeconds);

    if (config.maxDurationSeconds && config.maxDurationSeconds > ANDROID_SCREENRECORD_MAX_SECONDS) {
      logger.warn(
        `[VideoCapture] Android screenrecord caps at ${ANDROID_SCREENRECORD_MAX_SECONDS}s; requested ${config.maxDurationSeconds}s.`
      );
    }

    const args = [
      ...baseArgs,
      "exec-out",
      "screenrecord",
      "--bit-rate",
      String(bitrateBps),
      "--time-limit",
      String(timeLimitSeconds),
    ];

    if (config.resolution) {
      args.push("--size", `${config.resolution.width}x${config.resolution.height}`);
    }

    const process = spawn(adbPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    const outputStream = fs.createWriteStream(config.outputPath);
    process.stdout.pipe(outputStream);

    try {
      await this.waitForSpawn(process);
    } catch (error) {
      outputStream.destroy();
      throw new ActionableError(`Failed to start Android recording: ${error}`);
    }

    const stderr: string[] = [];
    const { exitState, exitPromise } = createExitTracker(process, stderr);

    const backendHandle: AndroidBackendHandle = {
      kind: "android",
      process,
      outputStream,
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
    const simctl = new SimCtlClient(device);
    const available = await simctl.isAvailable();
    if (!available) {
      throw new ActionableError("simctl is not available. Install Xcode command line tools.");
    }

    const args = [
      "simctl",
      "io",
      device.deviceId,
      "recordVideo",
      config.outputPath,
    ];

    const process = spawn("xcrun", args, { stdio: ["ignore", "pipe", "pipe"] });

    try {
      await this.waitForSpawn(process);
    } catch (error) {
      throw new ActionableError(`Failed to start iOS recording: ${error}`);
    }

    const stderr: string[] = [];
    const { exitState, exitPromise } = createExitTracker(process, stderr);

    const backendHandle: IosBackendHandle = {
      kind: "ios",
      process,
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

  private resolveAndroidTimeLimit(maxDurationSeconds?: number): number {
    if (maxDurationSeconds && maxDurationSeconds > 0) {
      return Math.min(maxDurationSeconds, ANDROID_SCREENRECORD_MAX_SECONDS);
    }

    return ANDROID_SCREENRECORD_MAX_SECONDS;
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
