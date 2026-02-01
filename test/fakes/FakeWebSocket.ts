import { EventEmitter } from "events";
import { Timer } from "../../src/utils/SystemTimer";
import { defaultTimer } from "../../src/utils/SystemTimer";

/**
 * WebSocket states as defined by the WebSocket API
 */
export enum WebSocketState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3
}

/**
 * Fake WebSocket implementation for testing
 * Allows simulating instant connection failures without waiting for timeout
 */
export class FakeWebSocket extends EventEmitter {
  public readyState: WebSocketState = WebSocketState.CONNECTING;
  private failureMode: "instant" | "timeout" | "none" = "none";
  private connectTimeoutMs: number = 0;
  private timer: Timer;

  constructor(url: string, failureMode: "instant" | "timeout" | "none" = "none", connectTimeoutMs: number = 0, timer: Timer = defaultTimer) {
    super();
    this.failureMode = failureMode;
    this.connectTimeoutMs = connectTimeoutMs;
    this.timer = timer;

    // For success mode with no delay, emit open synchronously after constructor returns
    // This ensures the "open" event fires before any FakeTimer.setTimeout with autoAdvance
    // can schedule its timeout callback via setImmediate
    if (this.failureMode === "none" && this.connectTimeoutMs === 0) {
      // Use queueMicrotask to emit after constructor returns but before setImmediate callbacks
      queueMicrotask(() => {
        this.handleConnection();
      });
    } else {
      // For failure modes or delayed connections, use setImmediate
      setImmediate(() => {
        this.handleConnection();
      });
    }
  }

  private handleConnection(): void {
    if (this.failureMode === "instant") {
      // Fail instantly
      this.readyState = WebSocketState.CLOSED;
      this.emit("error", new Error("Connection refused"));
      this.emit("close");
    } else if (this.failureMode === "timeout") {
      // Simulate timeout after specified duration
      this.timer.setTimeout(() => {
        if (this.readyState === WebSocketState.CONNECTING) {
          this.readyState = WebSocketState.CLOSED;
          this.emit("error", new Error("Connection timeout"));
          this.emit("close");
        }
      }, this.connectTimeoutMs);
    } else {
      // Success case
      this.readyState = WebSocketState.OPEN;
      this.emit("open");
    }
  }

  send(data: any): void {
    if (this.readyState !== WebSocketState.OPEN) {
      throw new Error("WebSocket is not open");
    }
    // In fake mode, we don't actually send data
  }

  close(): void {
    if (this.readyState === WebSocketState.OPEN || this.readyState === WebSocketState.CONNECTING) {
      this.readyState = WebSocketState.CLOSING;
      // Use setImmediate for 0-delay close to work with FakeTimer
      setImmediate(() => {
        this.readyState = WebSocketState.CLOSED;
        this.emit("close");
      });
    }
  }

  // Method to simulate receiving a message from server
  simulateMessage(data: any): void {
    if (this.readyState === WebSocketState.OPEN) {
      this.emit("message", data);
    }
  }
}

/**
 * Factory function that creates FakeWebSockets configured to fail instantly
 * This is useful for testing connection failure scenarios without waiting for timeouts
 */
export function createInstantFailureWebSocketFactory(timer?: Timer): (url: string) => FakeWebSocket {
  return (url: string) => new FakeWebSocket(url, "instant", 0, timer);
}

/**
 * Factory function that creates FakeWebSockets that connect successfully
 * This is useful for testing normal operation scenarios
 */
export function createSuccessWebSocketFactory(timer?: Timer): (url: string) => FakeWebSocket {
  return (url: string) => new FakeWebSocket(url, "none", 0, timer);
}
