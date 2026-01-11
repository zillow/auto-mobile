import { createServer, Server as NetServer, Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { logger } from "../utils/logger";
import {
  DaemonRequest,
  DaemonResponse,
  SessionContext,
} from "./types";
import { SOCKET_PATH } from "./constants";
import { DaemonState } from "./daemonState";
import { DaemonStateAccess, handleDaemonRequest } from "./daemonRequestHandlers";

/**
 * Unix Socket Server that proxies requests to the HTTP MCP server
 *
 * Responsibilities:
 * - Listen on Unix socket for CLI client connections
 * - Parse incoming DaemonRequest messages
 * - Forward tool calls to local HTTP MCP server
 * - Return DaemonResponse to clients
 * - Manage concurrent client sessions
 */
export class UnixSocketServer {
  private server: NetServer | null = null;
  private sessions: Map<string, SessionContext> = new Map();
  private socketPath: string;
  private mcpEndpoint: string;
  private daemonState: DaemonStateAccess;
  private mcpClient: Client | null = null;
  private mcpClientPromise: Promise<Client> | null = null;

  constructor(
    socketPath: string = SOCKET_PATH,
    mcpEndpoint: string,
    daemonState: DaemonStateAccess = DaemonState.getInstance()
  ) {
    this.socketPath = socketPath;
    this.mcpEndpoint = mcpEndpoint;
    this.daemonState = daemonState;
    logger.info(`UnixSocketServer initialized with endpoint: "${mcpEndpoint}"`);
    if (!mcpEndpoint) {
      logger.error("ERROR: mcpEndpoint is empty or undefined!");
    }
  }

  /**
   * Start the Unix socket server
   */
  async start(): Promise<void> {
    // Remove existing socket file if it exists
    if (existsSync(this.socketPath)) {
      await unlink(this.socketPath);
    }

    this.server = createServer(socket => {
      this.handleConnection(socket);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.socketPath, () => {
        logger.info(`Unix socket server listening on ${this.socketPath}`);
        resolve();
      });

      this.server!.on("error", error => {
        logger.error(`Unix socket server error: ${error}`);
        reject(error);
      });
    });
  }

  /**
   * Handle a new client connection
   */
  private handleConnection(socket: Socket): void {
    const sessionId = randomUUID();
    const session: SessionContext = {
      sessionId,
      createdAt: Date.now(),
      requestQueue: [],
      processing: false,
    };

    this.sessions.set(sessionId, session);
    logger.info(`New client connection: ${sessionId}`);

    let buffer = "";

    socket.on("data", async data => {
      try {
        // Accumulate data into buffer
        buffer += data.toString();

        // Process complete JSON messages (newline-delimited)
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            const request: DaemonRequest = JSON.parse(line);
            const response = await this.handleRequest(sessionId, request);
            socket.write(JSON.stringify(response) + "\n");
          }
        }
      } catch (error) {
        logger.error(`Error processing request from ${sessionId}:`, error);
        const errorResponse: DaemonResponse = {
          id: "unknown",
          type: "mcp_response",
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
        socket.write(JSON.stringify(errorResponse) + "\n");
      }
    });

    socket.on("close", () => {
      logger.info(`Client disconnected: ${sessionId}`);
      this.sessions.delete(sessionId);
    });

    socket.on("error", error => {
      logger.error(`Socket error for ${sessionId}:`, error);
      this.sessions.delete(sessionId);
    });
  }

  /**
   * Handle a request from a client
   */
  private async handleRequest(
    sessionId: string,
    request: DaemonRequest
  ): Promise<DaemonResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        id: request.id,
        type: "mcp_response",
        success: false,
        error: "Session not found",
      };
    }

    // Enqueue request to maintain order
    return this.enqueueRequest(session, async () => {
      try {
        if (request.method.startsWith("daemon/")) {
          const daemonResponse = await handleDaemonRequest(request, this.daemonState);
          return {
            id: request.id,
            type: "mcp_response",
            ...daemonResponse,
          };
        }

        const mcpClient = await this.getMcpClient();

        const result = await this.handleIdeRequest(mcpClient, request);

        return {
          id: request.id,
          type: "mcp_response",
          success: true,
          result,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : "no stack";
        logger.error(`Error forwarding request to MCP server: ${errorMessage}`);
        logger.error(`Error stack: ${errorStack}`);
        logger.error(`Full error: ${JSON.stringify(error)}`);
        return {
          id: request.id,
          type: "mcp_response",
          success: false,
          error: errorMessage,
        };
      }
    });
  }

  private async handleIdeRequest(
    mcpClient: Client,
    request: DaemonRequest
  ): Promise<any> {
    switch (request.method) {
      case "tools/call": {
        return await mcpClient.callTool({
          name: request.params.name,
          arguments: request.params.arguments,
        });
      }
      case "resources/list": {
        return await mcpClient.listResources();
      }
      case "resources/read": {
        if (!request.params?.uri) {
          throw new Error("resources/read requires params.uri");
        }
        return await mcpClient.readResource({ uri: request.params.uri });
      }
      case "resources/list-templates": {
        return await mcpClient.listResourceTemplates();
      }
      case "ide/getNavigationGraph": {
        const args = request.params ?? {};
        return await mcpClient.callTool({ name: "getNavigationGraph", arguments: args });
      }
      case "ide/ping": {
        return { ok: true, timestamp: Date.now() };
      }
      default:
        throw new Error(`Unsupported daemon method: ${request.method}`);
    }
  }

  /**
   * Create an MCP client connected to the HTTP server
   */
  private async createMcpClient(): Promise<Client> {
    logger.info(`Creating MCP client with endpoint: "${this.mcpEndpoint}"`);
    if (!this.mcpEndpoint) {
      logger.error(`ERROR: mcpEndpoint is empty or undefined when creating client!`);
      throw new Error("mcpEndpoint is not set");
    }
    const transport = new StreamableHTTPClientTransport(this.mcpEndpoint);

    const client = new Client(
      {
        name: "auto-mobile-daemon-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);
    logger.info(`MCP client connected to ${this.mcpEndpoint}`);

    return client;
  }

  /**
   * Get or create a shared MCP client (single session for state persistence)
   */
  private async getMcpClient(): Promise<Client> {
    if (this.mcpClient) {
      return this.mcpClient;
    }

    if (this.mcpClientPromise) {
      return this.mcpClientPromise;
    }

    this.mcpClientPromise = this.createMcpClient()
      .then(client => {
        this.mcpClient = client;
        return client;
      })
      .catch(error => {
        this.mcpClientPromise = null;
        throw error;
      });

    return this.mcpClientPromise;
  }

  /**
   * Enqueue a request in the session to maintain sequential order
   */
  private async enqueueRequest<T>(
    session: SessionContext,
    handler: () => Promise<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      session.requestQueue.push(async () => {
        try {
          const result = await handler();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      // Process queue if not already processing
      if (!session.processing) {
        this.processQueue(session);
      }
    });
  }

  /**
   * Process queued requests sequentially
   */
  private async processQueue(session: SessionContext): Promise<void> {
    if (session.processing || session.requestQueue.length === 0) {
      return;
    }

    session.processing = true;

    while (session.requestQueue.length > 0) {
      const handler = session.requestQueue.shift()!;
      try {
        await handler();
      } catch (error) {
        logger.error(`Error processing queued request:`, error);
      }
    }

    session.processing = false;
  }

  /**
   * Check if socket server is listening
   */
  isListening(): boolean {
    return this.server !== null && this.server.listening;
  }

  /**
   * Stop the Unix socket server
   */
  async close(): Promise<void> {
    logger.info("Closing Unix socket server...");

    // Close shared MCP client
    if (this.mcpClient) {
      try {
        await this.mcpClient.close();
      } catch (error) {
        logger.warn(`Error closing MCP client:`, error);
      }
      this.mcpClient = null;
    }
    this.mcpClientPromise = null;

    // Clear sessions
    this.sessions.clear();

    // Close server
    if (this.server) {
      return new Promise(resolve => {
        this.server!.close(() => {
          logger.info("Unix socket server closed");
          resolve();
        });
      });
    }

    // Remove socket file
    if (existsSync(this.socketPath)) {
      await unlink(this.socketPath);
    }
  }
}
