import { createServer, Server as NetServer, Socket } from "node:net";
import { existsSync } from "node:fs";
import { unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { logger } from "../../utils/logger";
import { Timer, defaultTimer } from "../../utils/SystemTimer";

/**
 * Abstract base class for Unix domain socket servers.
 * Handles common functionality: socket lifecycle, line protocol, connection management.
 */
export abstract class BaseSocketServer {
  protected server: NetServer | null = null;
  protected readonly socketPath: string;
  protected readonly timer: Timer;
  protected readonly serverName: string;

  constructor(socketPath: string, timer: Timer = defaultTimer, serverName: string = "Socket") {
    this.socketPath = socketPath;
    this.timer = timer;
    this.serverName = serverName;
  }

  /**
   * Start the socket server.
   */
  async start(): Promise<void> {
    const directory = path.dirname(this.socketPath);
    if (!existsSync(directory)) {
      await mkdir(directory, { recursive: true });
    }

    if (existsSync(this.socketPath)) {
      await unlink(this.socketPath);
    }

    this.server = createServer(socket => {
      this.handleConnection(socket);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.socketPath, () => {
        logger.info(`[${this.serverName}] Socket listening on ${this.socketPath}`);
        this.onServerStarted();
        resolve();
      });

      this.server!.on("error", error => {
        logger.error(`[${this.serverName}] Socket error: ${error}`);
        reject(error);
      });
    });
  }

  /**
   * Stop the socket server.
   */
  async close(): Promise<void> {
    this.onServerClosing();

    if (!this.server) {
      return;
    }

    await new Promise<void>(resolve => {
      this.server!.close(() => resolve());
    });
    this.server = null;

    if (existsSync(this.socketPath)) {
      await unlink(this.socketPath);
    }
  }

  /**
   * Check if the server is listening.
   */
  isListening(): boolean {
    return this.server?.listening ?? false;
  }

  /**
   * Handle a new connection. Sets up line-based protocol.
   */
  protected handleConnection(socket: Socket): void {
    let buffer = "";

    socket.on("data", data => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          this.processLine(socket, line).catch(error => {
            logger.error(`[${this.serverName}] Request error: ${error}`);
          });
        }
      }
    });

    socket.on("error", error => {
      logger.error(`[${this.serverName}] Connection error: ${error}`);
      this.onConnectionError(socket, error);
    });

    socket.on("close", () => {
      this.onConnectionClose(socket);
    });

    this.onConnectionEstablished(socket);
  }

  /**
   * Process a single line of input. Subclasses implement this.
   */
  protected abstract processLine(socket: Socket, line: string): Promise<void>;

  /**
   * Called when the server starts. Override for custom initialization.
   */
  protected onServerStarted(): void {
    // Default: no-op
  }

  /**
   * Called before the server closes. Override for custom cleanup.
   */
  protected onServerClosing(): void {
    // Default: no-op
  }

  /**
   * Called when a connection is established. Override for custom handling.
   */
  protected onConnectionEstablished(_socket: Socket): void {
    // Default: no-op
  }

  /**
   * Called when a connection error occurs. Override for custom handling.
   */
  protected onConnectionError(_socket: Socket, _error: Error): void {
    // Default: no-op
  }

  /**
   * Called when a connection closes. Override for custom handling.
   */
  protected onConnectionClose(_socket: Socket): void {
    // Default: no-op
  }

  /**
   * Send a JSON response to a socket.
   */
  protected sendJson(socket: Socket, data: unknown): void {
    if (!socket.destroyed) {
      socket.write(JSON.stringify(data) + "\n");
    }
  }

  /**
   * Parse JSON from a line, returning null if invalid.
   */
  protected parseJson<T>(line: string): T | null {
    try {
      return JSON.parse(line) as T;
    } catch {
      return null;
    }
  }
}
