import { createConnection, Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { logger } from "../utils/logger";
import { ActionableError } from "../models";
import { DaemonRequest, DaemonResponse } from "./types";
import {
  SOCKET_PATH,
  CONNECTION_TIMEOUT_MS,
} from "./constants";

/**
 * Custom error thrown when daemon is unavailable
 */
export class DaemonUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DaemonUnavailableError";
  }
}

/**
 * CLI Client for communicating with the daemon via Unix socket
 *
 * Responsibilities:
 * - Check if daemon is available
 * - Connect to daemon via Unix socket
 * - Send tool call requests
 * - Receive and parse responses
 * - Handle timeouts and errors
 */
export class DaemonClient {
  private socket: Socket | null = null;
  private socketPath: string;
  private connectionTimeout: number;
  private pendingRequests: Map<string, {
    resolve: (value: DaemonResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private buffer: string = "";
  private connected: boolean = false;

  constructor(
    socketPath: string = SOCKET_PATH,
    connectionTimeout: number = CONNECTION_TIMEOUT_MS
  ) {
    this.socketPath = socketPath;
    this.connectionTimeout = connectionTimeout;
  }

  /**
   * Check if daemon is available (socket file exists and is accessible)
   */
  static async isAvailable(socketPath: string = SOCKET_PATH): Promise<boolean> {
    // Quick check: socket file exists
    if (!existsSync(socketPath)) {
      return false;
    }

    // Try to connect to verify daemon is responding
    const client = new DaemonClient(socketPath, 1000); // Short timeout for availability check
    try {
      await client.connect();
      await client.close();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Connect to the daemon
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    if (!existsSync(this.socketPath)) {
      throw new DaemonUnavailableError(
        `Daemon socket not found: ${this.socketPath}`
      );
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.socket) {
          this.socket.destroy();
        }
        reject(
          new DaemonUnavailableError(
            `Failed to connect to daemon within ${this.connectionTimeout}ms`
          )
        );
      }, this.connectionTimeout);

      this.socket = createConnection(this.socketPath, () => {
        clearTimeout(timeout);
        this.connected = true;
        logger.info(`Connected to daemon at ${this.socketPath}`);
        resolve();
      });

      this.socket.on("data", data => {
        this.handleData(data);
      });

      this.socket.on("error", error => {
        clearTimeout(timeout);
        this.connected = false;
        logger.error(`Daemon socket error: ${error.message}`);

        // Reject all pending requests
        for (const [, { reject, timeout }] of this.pendingRequests) {
          clearTimeout(timeout);
          reject(error);
        }
        this.pendingRequests.clear();

        reject(error);
      });

      this.socket.on("close", () => {
        this.connected = false;
        logger.info("Daemon socket connection closed");
      });
    });
  }

  /**
   * Handle incoming data from daemon
   */
  private handleData(data: Buffer): void {
    this.buffer += data.toString();

    // Process complete JSON messages (newline-delimited)
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        try {
          const response: DaemonResponse = JSON.parse(line);
          this.handleResponse(response);
        } catch (error) {
          logger.error(`Error parsing daemon response: ${error}`);
        }
      }
    }
  }

  /**
   * Handle a response from daemon
   */
  private handleResponse(response: DaemonResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      logger.warn(`Received response for unknown request ID: ${response.id}`);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id);

    if (response.success) {
      pending.resolve(response);
    } else {
      pending.reject(
        new ActionableError(response.error || "Unknown error from daemon")
      );
    }
  }

  /**
   * Call a tool on the daemon
   */
  async callTool(toolName: string, params: Record<string, any>): Promise<any> {
    return this.sendRequest("tools/call", {
      name: toolName,
      arguments: params,
    });
  }

  /**
   * Read a resource from the daemon
   */
  async readResource(uri: string): Promise<any> {
    return this.sendRequest("resources/read", { uri });
  }

  private async sendRequest(method: string, params: Record<string, any>): Promise<any> {
    // Ensure we're connected
    if (!this.connected) {
      await this.connect();
    }

    const requestId = randomUUID();

    // Create request
    const request: DaemonRequest = {
      id: requestId,
      type: "mcp_request",
      method,
      params,
    };

    // Send request
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(
          new DaemonUnavailableError(
            `Daemon request timeout after ${this.connectionTimeout}ms`
          )
        );
      }, this.connectionTimeout);

      this.pendingRequests.set(requestId, {
        resolve: response => {
          resolve(response.result);
        },
        reject,
        timeout,
      });

      if (!this.socket) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(
          new DaemonUnavailableError("Socket connection lost")
        );
        return;
      }

      this.socket.write(JSON.stringify(request) + "\n");
    });
  }

  /**
   * Call a daemon method directly over the socket
   */
  async callDaemonMethod(
    method: string,
    params: Record<string, any> = {}
  ): Promise<any> {
    if (!this.connected) {
      await this.connect();
    }

    const requestId = randomUUID();

    const request: DaemonRequest = {
      id: requestId,
      type: "daemon_request",
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(
          new DaemonUnavailableError(
            `Daemon request timeout after ${this.connectionTimeout}ms`
          )
        );
      }, this.connectionTimeout);

      this.pendingRequests.set(requestId, {
        resolve: response => {
          resolve(response.result);
        },
        reject,
        timeout,
      });

      if (!this.socket) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(
          new DaemonUnavailableError("Socket connection lost")
        );
        return;
      }

      this.socket.write(JSON.stringify(request) + "\n");
    });
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.connected = false;

    // Reject all pending requests
    for (const [, { timeout }] of this.pendingRequests) {
      clearTimeout(timeout);
    }
    this.pendingRequests.clear();
  }
}

export interface DaemonClientLike {
  connect(): Promise<void>;
  close(): Promise<void>;
  callTool(toolName: string, params: Record<string, any>): Promise<any>;
  readResource(uri: string): Promise<any>;
  callDaemonMethod(method: string, params: Record<string, any>): Promise<any>;
}

export type DaemonClientFactory = () => DaemonClientLike;
