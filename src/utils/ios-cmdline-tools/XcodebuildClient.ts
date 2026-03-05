import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ActionableError, ExecResult } from "../../models";
import { logger } from "../logger";
import { createExecResult } from "../execResult";
import { isRunningInDocker } from "../dockerEnv";
import { isHostControlAvailable, runXcodebuildExec, shouldUseHostControl } from "../hostControlClient";
import { defaultTimer, Timer } from "../SystemTimer";

interface XcodebuildCommandOptions {
  timeoutMs?: number;
  maxBuffer?: number;
}

export interface Xcodebuild {
  executeCommand(args: string[], options?: XcodebuildCommandOptions): Promise<ExecResult>;
  isAvailable(): Promise<boolean>;
}

interface XcodebuildHostControlRunner {
  isAvailable(): Promise<boolean>;
  isRunningInDocker(): boolean;
  runXcodebuild(args: string[]): Promise<ExecResult>;
  shouldUseHostControl(): boolean;
}

const execAsync = async (file: string, args: string[], maxBuffer?: number): Promise<ExecResult> => {
  const options = maxBuffer ? { maxBuffer } : undefined;
  const result = await promisify(execFile)(file, args, options);
  const stdout = typeof result.stdout === "string" ? result.stdout : result.stdout.toString();
  const stderr = typeof result.stderr === "string" ? result.stderr : result.stderr.toString();
  return createExecResult(stdout, stderr);
};

export class XcodebuildClient implements Xcodebuild {
  execAsync: (file: string, args: string[], maxBuffer?: number) => Promise<ExecResult>;
  private hostControl: XcodebuildHostControlRunner;
  private hostControlAvailability: Promise<boolean> | null = null;
  private timer: Timer;

  constructor(
    execAsyncFn: ((file: string, args: string[], maxBuffer?: number) => Promise<ExecResult>) | null = null,
    hostControlRunner: XcodebuildHostControlRunner | null = null,
    timer: Timer = defaultTimer
  ) {
    this.execAsync = execAsyncFn || execAsync;
    this.timer = timer;
    this.hostControl = hostControlRunner || {
      isAvailable: () => isHostControlAvailable(),
      isRunningInDocker,
      runXcodebuild: async (args: string[]) => {
        const result = await runXcodebuildExec(args);
        if (!result.success || !result.data) {
          throw new Error(result.error || "Host control xcodebuild failed");
        }
        return result.data;
      },
      shouldUseHostControl
    };
  }

  async isAvailable(): Promise<boolean> {
    const wantsHostControl = this.hostControl.shouldUseHostControl() && this.hostControl.isRunningInDocker();
    if (wantsHostControl) {
      return this.isHostControlAvailable();
    }
    return this.isLocalXcodebuildAvailable();
  }

  async executeCommand(args: string[], options: XcodebuildCommandOptions = {}): Promise<ExecResult> {
    const { timeoutMs, maxBuffer } = options;
    const wantsHostControl = this.hostControl.shouldUseHostControl() && this.hostControl.isRunningInDocker();
    const hostControlAvailable = wantsHostControl ? await this.isHostControlAvailable() : false;
    const useHostControl = wantsHostControl && hostControlAvailable;
    const fullCommand = useHostControl ? `host-control xcodebuild ${args.join(" ")}` : `xcodebuild ${args.join(" ")}`;
    const startTime = this.timer.now();

    logger.debug(`[iOS] Executing command: ${fullCommand}`);

    if (wantsHostControl && !hostControlAvailable) {
      throw new ActionableError(
        "xcodebuild is not available via host control. " +
        "Ensure the host control daemon is running and reachable from the container."
      );
    }

    if (!useHostControl && !(await this.isLocalXcodebuildAvailable())) {
      throw new ActionableError("xcodebuild is not available. Please install Xcode to continue.");
    }

    const runCommand = () => (
      useHostControl
        ? this.hostControl.runXcodebuild(args)
        : this.execAsync("xcodebuild", args, maxBuffer)
    );

    if (timeoutMs) {
      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise<ExecResult>((_, reject) => {
        timeoutId = this.timer.setTimeout(
          () => reject(new Error(`Command timed out after ${timeoutMs}ms: ${fullCommand}`)),
          timeoutMs
        );
      });

      try {
        const result = await Promise.race([runCommand(), timeoutPromise]);
        const duration = this.timer.now() - startTime;
        logger.debug(`[iOS] Command completed in ${duration}ms: ${fullCommand}`);
        return result;
      } catch (error) {
        const duration = this.timer.now() - startTime;
        logger.warn(`[iOS] Command failed after ${duration}ms: ${fullCommand} - ${(error as Error).message}`);
        throw error;
      } finally {
        clearTimeout(timeoutId!);
      }
    }

    try {
      const result = await runCommand();
      const duration = this.timer.now() - startTime;
      logger.debug(`[iOS] Command completed in ${duration}ms: ${fullCommand}`);
      return result;
    } catch (error) {
      const duration = this.timer.now() - startTime;
      logger.warn(`[iOS] Command failed after ${duration}ms: ${fullCommand} - ${(error as Error).message}`);
      throw error;
    }
  }

  private async isHostControlAvailable(): Promise<boolean> {
    if (!this.hostControlAvailability) {
      this.hostControlAvailability = this.hostControl.isAvailable();
    }

    const available = await this.hostControlAvailability;
    if (!available) {
      this.hostControlAvailability = null;
    }

    return available;
  }

  private async isLocalXcodebuildAvailable(): Promise<boolean> {
    try {
      await this.execAsync("xcodebuild", ["-version"]);
      return true;
    } catch {
      return false;
    }
  }
}
