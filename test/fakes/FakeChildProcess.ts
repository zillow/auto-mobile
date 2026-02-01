import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { defaultTimer } from "../../src/utils/SystemTimer";

/**
 * Fake ChildProcess for testing without spawning real processes
 * Simulates process lifecycle: spawn -> running -> exit
 */
export class FakeChildProcess extends EventEmitter implements Partial<ChildProcessWithoutNullStreams> {
  stdout: Readable;
  stderr: Readable;
  stdin: Writable;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killed = false;
  pid: number;

  private spawnDelay: number = 0;
  private exitDelay: number = 0;
  private shouldError = false;
  private errorMessage = "Process error";
  private stdoutData: Buffer[] = [];
  private stderrData: Buffer[] = [];

  constructor() {
    super();
    this.stdout = new Readable({
      read() {
        // No-op: data is pushed manually
      },
    });
    this.stderr = new Readable({
      read() {
        // No-op: data is pushed manually
      },
    });
    this.stdin = new Writable({
      write(chunk, encoding, callback) {
        callback();
      },
    });
    this.pid = Math.floor(Math.random() * 10000) + 1000;
  }

  /**
   * Configure spawn behavior
   */
  setSpawnDelay(ms: number): void {
    this.spawnDelay = ms;
  }

  /**
   * Configure exit behavior
   */
  setExitDelay(ms: number): void {
    this.exitDelay = ms;
  }

  /**
   * Make the process emit an error event instead of spawning
   */
  setSpawnError(message = "Failed to spawn"): void {
    this.shouldError = true;
    this.errorMessage = message;
  }

  /**
   * Add data that will be written to stdout when process starts
   */
  addStdoutData(data: Buffer | string): void {
    this.stdoutData.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
  }

  /**
   * Add data that will be written to stderr when process starts
   */
  addStderrData(data: Buffer | string): void {
    this.stderrData.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
  }

  /**
   * Simulate the spawn lifecycle
   */
  simulateSpawn(): void {
    defaultTimer.setTimeout(() => {
      if (this.shouldError) {
        this.emit("error", new Error(this.errorMessage));
        return;
      }

      this.emit("spawn");

      // Write any configured stdout/stderr data
      for (const data of this.stdoutData) {
        this.stdout.push(data);
      }
      for (const data of this.stderrData) {
        this.stderr.push(data);
      }
    }, this.spawnDelay);
  }

  /**
   * Simulate process exit
   */
  simulateExit(code: number = 0, signal: NodeJS.Signals | null = null): void {
    defaultTimer.setTimeout(() => {
      this.exitCode = code;
      this.signalCode = signal;
      this.stdout.push(null); // End stdout stream
      this.stderr.push(null); // End stderr stream
      this.emit("exit", code, signal);
    }, this.exitDelay);
  }

  /**
   * Kill the process (simulated)
   */
  kill(signal?: NodeJS.Signals | number): boolean {
    if (this.killed || this.exitCode !== null) {
      return false;
    }

    this.killed = true;
    const signalName = typeof signal === "number" ? null : (signal ?? "SIGTERM");

    // Simulate exit after kill
    this.simulateExit(null, signalName);
    return true;
  }

  /**
   * Ref (no-op for testing)
   */
  ref(): this {
    return this;
  }

  /**
   * Unref (no-op for testing)
   */
  unref(): this {
    return this;
  }

  /**
   * Get all other required properties from ChildProcessWithoutNullStreams
   * These are stubs for testing purposes
   */
  channel?: any;
  connected = false;
  disconnect(): void {
    this.connected = false;
  }
  send(): boolean {
    return false;
  }
}
