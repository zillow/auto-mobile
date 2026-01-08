import { EventEmitter } from "node:events";
import type { WriteStream } from "node:fs";

/**
 * Fake WriteStream for testing file output without real filesystem I/O
 */
export class FakeWriteStream extends EventEmitter implements Partial<WriteStream> {
  path: string;
  bytesWritten = 0;
  pending = false;
  writableEnded = false;
  writableFinished = false;
  writableHighWaterMark = 16384;
  writableLength = 0;
  writableObjectMode = false;
  writableCorked = 0;
  destroyed = false;
  closed = false;
  errored: Error | null = null;

  private chunks: Buffer[] = [];
  private shouldError = false;
  private errorMessage = "Write stream error";
  private closeDelay = 0;

  constructor(path: string) {
    super();
    this.path = path;

    // Simulate open event after next tick
    setImmediate(() => {
      if (!this.shouldError) {
        this.emit("open", 1); // fd = 1
      }
    });
  }

  /**
   * Make the stream emit an error
   */
  setError(message = "Write stream error"): void {
    this.shouldError = true;
    this.errorMessage = message;
    this.errored = new Error(message);
  }

  /**
   * Configure close delay
   */
  setCloseDelay(ms: number): void {
    this.closeDelay = ms;
  }

  /**
   * Write data to the stream
   */
  write(
    chunk: any,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean {
    if (this.destroyed || this.writableEnded) {
      const error = new Error("write after end");
      if (typeof encodingOrCallback === "function") {
        encodingOrCallback(error);
      } else if (callback) {
        callback(error);
      }
      return false;
    }

    if (this.shouldError) {
      const error = new Error(this.errorMessage);
      if (typeof encodingOrCallback === "function") {
        setImmediate(() => encodingOrCallback(error));
      } else if (callback) {
        setImmediate(() => callback(error));
      }
      this.emit("error", error);
      return false;
    }

    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.chunks.push(buffer);
    this.bytesWritten += buffer.length;
    this.writableLength += buffer.length;

    if (typeof encodingOrCallback === "function") {
      setImmediate(() => encodingOrCallback(null));
    } else if (callback) {
      setImmediate(() => callback(null));
    }

    return true;
  }

  /**
   * End the stream
   */
  end(
    chunkOrCallback?: any,
    encodingOrCallback?: BufferEncoding | (() => void),
    callback?: () => void
  ): this {
    if (typeof chunkOrCallback === "function") {
      callback = chunkOrCallback;
    } else if (chunkOrCallback) {
      const encoding =
        typeof encodingOrCallback === "string" ? encodingOrCallback : undefined;
      this.write(chunkOrCallback, encoding);
      if (typeof encodingOrCallback === "function") {
        callback = encodingOrCallback;
      }
    } else if (typeof encodingOrCallback === "function") {
      callback = encodingOrCallback;
    }

    this.writableEnded = true;
    this.writableFinished = true;

    setImmediate(() => {
      this.emit("finish");
      if (callback) {
        callback();
      }
    });

    return this;
  }

  /**
   * Destroy the stream
   */
  destroy(error?: Error): this {
    if (this.destroyed) {
      return this;
    }

    this.destroyed = true;
    this.writableEnded = true;

    setImmediate(() => {
      if (error) {
        this.emit("error", error);
      }
      this.close();
    });

    return this;
  }

  /**
   * Close the stream
   */
  close(callback?: (err?: NodeJS.ErrnoException | null) => void): void {
    if (this.closed) {
      if (callback) {
        setImmediate(() => callback(null));
      }
      return;
    }

    setTimeout(() => {
      this.closed = true;
      this.emit("close");
      if (callback) {
        callback(null);
      }
    }, this.closeDelay);
  }

  /**
   * Get all written data as a single buffer
   */
  getWrittenData(): Buffer {
    return Buffer.concat(this.chunks);
  }

  /**
   * Get all written chunks
   */
  getChunks(): Buffer[] {
    return [...this.chunks];
  }

  /**
   * Clear all written data (for testing)
   */
  clearData(): void {
    this.chunks = [];
    this.bytesWritten = 0;
    this.writableLength = 0;
  }

  // Stub methods for interface compatibility
  cork(): void {
    this.writableCorked++;
  }

  uncork(): void {
    this.writableCorked = Math.max(0, this.writableCorked - 1);
  }

  setDefaultEncoding(encoding: BufferEncoding): this {
    return this;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }
}
