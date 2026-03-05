import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { logger } from "../../../utils/logger";
import type { GestureEmitter, GestureEvent } from "./types";
import type { TouchInputNode } from "./TouchNodeDiscovery";
import type { CoordScaler } from "./AxisRanges";
import { TouchFrameReconstructor } from "./TouchFrameReconstructor";
import { GestureClassifier } from "./GestureClassifier";

interface GetEventReaderOptions {
  deviceId: string;
  touchNode: TouchInputNode;
  scaler: CoordScaler;
  /** Display density in dp multiplier (e.g. 2.75 for 440dpi) */
  density: number;
  /** Override for testing — defaults to `spawn` from node:child_process */
  spawnFn?: typeof spawn;
  /** Override ADB binary path for testing — defaults to "adb" */
  adbPath?: string;
}

/**
 * Spawns `adb -s <deviceId> shell getevent -lt <touchNode.path>` and pipes
 * the output through TouchFrameReconstructor → GestureClassifier.
 *
 * Implements GestureEmitter so it can be replaced with a fake in tests.
 */
export class GetEventReader implements GestureEmitter {
  private child: ChildProcess | null = null;
  private readonly spawnFn: typeof spawn;
  private readonly adbPath: string;

  constructor(private readonly opts: GetEventReaderOptions) {
    this.spawnFn = opts.spawnFn ?? spawn;
    this.adbPath = opts.adbPath ?? "adb";
  }

  start(
    onGesture: (event: GestureEvent) => void,
    onError?: (err: Error) => void
  ): void {
    if (this.child) {return;} // already running

    const reconstructor = new TouchFrameReconstructor();
    const classifier = new GestureClassifier(this.opts.scaler, this.opts.density);

    const args = [
      "-s",
      this.opts.deviceId,
      "shell",
      "getevent",
      "-lt",
      this.opts.touchNode.path,
    ];

    logger.debug(`[GetEventReader] Spawning: ${this.adbPath} ${args.join(" ")}`);
    this.child = this.spawnFn(this.adbPath, args);

    let lineBuffer = "";

    this.child.stdout?.on("data", (data: Buffer) => {
      lineBuffer += data.toString();
      const lines = lineBuffer.split("\n");
      // Keep the incomplete last fragment in the buffer
      lineBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) {continue;}
        const arrivedAt = Date.now();
        const result = reconstructor.feedLine(line, arrivedAt);
        if (!result) {continue;}

        if (isRawTouchFrame(result)) {
          const gesture = classifier.feedFrame(result);
          if (gesture) {onGesture(gesture);}
        } else {
          // GestureEvent (pressButton)
          onGesture(result);
        }
      }
    });

    this.child.stderr?.on("data", (data: Buffer) => {
      logger.debug(`[GetEventReader] stderr: ${data.toString().trim()}`);
    });

    this.child.on("error", (err: Error) => {
      logger.error(`[GetEventReader] spawn error: ${err.message}`);
      onError?.(err);
    });

    this.child.on("close", (code: number | null) => {
      if (code !== null && code !== 0) {
        logger.warn(`[GetEventReader] getevent exited with code ${code}`);
      }
      this.child = null;
    });
  }

  stop(): void {
    if (this.child && !this.child.killed) {
      logger.debug("[GetEventReader] Stopping getevent process");
      this.child.kill();
    }
    this.child = null;
  }
}

function isRawTouchFrame(
  result: ReturnType<TouchFrameReconstructor["feedLine"]>
): result is import("./types").RawTouchFrame {
  return result !== null && "activeSlots" in result;
}
