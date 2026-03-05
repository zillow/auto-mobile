import { EventEmitter } from "events";

/**
 * Fake Socket for testing socket-based servers without real network connections.
 * Works cross-platform (Windows, macOS, Linux) and doesn't require file system.
 */
export class FakeSocket extends EventEmitter {
  public destroyed = false;
  public writable = true;
  private _writtenData: string[] = [];
  private _peer: FakeSocket | null = null;

  /**
   * Get all data written to this socket
   */
  getWrittenData(): string[] {
    return [...this._writtenData];
  }

  /**
   * Get all written data as a single string
   */
  getWrittenDataString(): string {
    return this._writtenData.join("");
  }

  /**
   * Parse all written JSON messages (newline-delimited)
   */
  getWrittenMessages<T = unknown>(): T[] {
    const allData = this.getWrittenDataString();
    const lines = allData.split("\n").filter(line => line.trim());
    return lines.map(line => JSON.parse(line) as T);
  }

  /**
   * Connect this socket to a peer (for bidirectional communication)
   */
  connectToPeer(peer: FakeSocket): void {
    this._peer = peer;
    peer._peer = this;
  }

  /**
   * Write data to the socket. Returns true if successful.
   */
  write(data: string | Buffer): boolean {
    if (this.destroyed) {
      throw new Error("Socket is destroyed");
    }
    const str = typeof data === "string" ? data : data.toString();
    this._writtenData.push(str);
    return true;
  }

  /**
   * Simulate receiving data on this socket (triggers 'data' event)
   */
  simulateData(data: string): void {
    if (!this.destroyed) {
      this.emit("data", Buffer.from(data));
    }
  }

  /**
   * Send data to the peer socket (simulates data going through the connection)
   */
  sendToPeer(data: string): void {
    if (this._peer && !this._peer.destroyed) {
      this._peer.simulateData(data);
    }
  }

  /**
   * Destroy the socket
   */
  destroy(): void {
    if (!this.destroyed) {
      this.destroyed = true;
      this.writable = false;
      this.emit("close");
    }
  }

  /**
   * End the socket gracefully
   */
  end(): void {
    if (!this.destroyed) {
      this.destroyed = true;
      this.writable = false;
      this.emit("close");
    }
  }

  /**
   * Simulate a connection event
   */
  connect(_options: { path: string }): this {
    // In fake mode, connection is instant
    process.nextTick(() => {
      if (!this.destroyed) {
        this.emit("connect");
      }
    });
    return this;
  }

  /**
   * Simulate an error on the socket
   */
  simulateError(error: Error): void {
    this.emit("error", error);
  }

  /**
   * Reset the socket state for reuse in tests
   */
  reset(): void {
    this._writtenData = [];
    this.destroyed = false;
    this.writable = true;
    this._peer = null;
    this.removeAllListeners();
  }
}
