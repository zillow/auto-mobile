import { Socket } from "node:net";
import { logger } from "../../utils/logger";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { BaseSocketServer } from "./BaseSocketServer";
import { SocketRequest, SocketResponse } from "./SocketServerTypes";

/**
 * Abstract base class for request-response socket servers.
 * Handles sequential request processing with JSON-over-newline protocol.
 *
 * Subclasses implement:
 * - handleRequest(): Process a request and return a response
 * - createErrorResponse(): Create an error response for failed requests
 */
export abstract class RequestResponseSocketServer<
  TRequest extends SocketRequest,
  TResponse extends SocketResponse,
> extends BaseSocketServer {
  /** Map of socket to pending promise chain for sequential processing */
  private pendingBySocket: WeakMap<Socket, Promise<void>> = new WeakMap();

  constructor(socketPath: string, timer: Timer = defaultTimer, serverName: string = "RequestResponse") {
    super(socketPath, timer, serverName);
  }

  /**
   * Process a single line of input. Queues requests for sequential processing.
   */
  protected async processLine(socket: Socket, line: string): Promise<void> {
    // Get or create the pending promise chain for this socket
    const pending = this.pendingBySocket.get(socket) ?? Promise.resolve();

    // Chain this request to run after any pending requests
    const newPending = pending
      .then(() => this.handleLine(socket, line))
      .catch(error => {
        logger.error(`[${this.serverName}] Request processing error: ${error}`);
      });

    this.pendingBySocket.set(socket, newPending);
  }

  /**
   * Handle a single line by parsing JSON and dispatching to handleRequest.
   */
  private async handleLine(socket: Socket, line: string): Promise<void> {
    const request = this.parseJson<TRequest>(line);

    if (!request) {
      const errorResponse = this.createErrorResponse(undefined, "Invalid JSON");
      this.sendJson(socket, errorResponse);
      return;
    }

    try {
      const response = await this.handleRequest(request);
      this.sendJson(socket, response);
    } catch (error) {
      logger.error(`[${this.serverName}] Request handler error: ${error}`);
      const errorResponse = this.createErrorResponse(
        request.id,
        error instanceof Error ? error.message : String(error)
      );
      this.sendJson(socket, errorResponse);
    }
  }

  /**
   * Handle a request and return a response.
   * Subclasses must implement this.
   */
  protected abstract handleRequest(request: TRequest): Promise<TResponse>;

  /**
   * Create an error response for a failed request.
   * Subclasses must implement this.
   */
  protected abstract createErrorResponse(id: string | undefined, error: string): TResponse;
}
