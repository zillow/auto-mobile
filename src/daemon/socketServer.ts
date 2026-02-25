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
import { Timer, defaultTimer } from "../utils/SystemTimer";
import type { FeatureFlagService } from "../features/featureFlags/FeatureFlagService";
import type { FeatureFlagKey } from "../features/featureFlags/FeatureFlagDefinitions";
import { getMcpServerVersion } from "../utils/mcpVersion";
import {
  RELEASE_VERSION,
  APK_SHA256_CHECKSUM,
  APK_URL,
  IOS_CTRL_PROXY_SHA256_CHECKSUM,
  IOS_CTRL_PROXY_IPA_URL,
  IOS_CTRL_PROXY_APP_HASH,
} from "../constants/release";
import { AndroidCtrlProxyManager } from "../utils/CtrlProxyManager";
import { IOSCtrlProxyManager } from "../utils/IOSCtrlProxyManager";
import { PlatformDeviceManagerFactory } from "../utils/factories/PlatformDeviceManagerFactory";
import { CtrlProxyClient } from "../features/observe/android";
import { defaultAdbClientFactory } from "../utils/android-cmdline-tools/AdbClientFactory";
import type { KeyValueType } from "../features/storage/storageTypes";

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
  private timer: Timer;
  private featureFlagService: FeatureFlagService | null;

  constructor(
    socketPath: string = SOCKET_PATH,
    mcpEndpoint: string,
    daemonState: DaemonStateAccess = DaemonState.getInstance(),
    timer: Timer = defaultTimer,
    featureFlagService: FeatureFlagService | null = null
  ) {
    this.socketPath = socketPath;
    this.mcpEndpoint = mcpEndpoint;
    this.daemonState = daemonState;
    this.timer = timer;
    this.featureFlagService = featureFlagService;
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
      createdAt: this.timer.now(),
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

        // Handle IDE-only requests that don't need the MCP client
        const localResult = await this.handleLocalIdeRequest(request);
        if (localResult !== undefined) {
          return {
            id: request.id,
            type: "mcp_response",
            success: true,
            result: localResult,
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

  /**
   * Handle IDE requests that don't require the MCP client.
   * Returns undefined if the request should be forwarded to MCP.
   */
  private async handleLocalIdeRequest(
    request: DaemonRequest
  ): Promise<any | undefined> {
    switch (request.method) {
      case "ide/listFeatureFlags": {
        if (!this.featureFlagService) {
          throw new Error("Feature flag service not available");
        }
        const flags = await this.featureFlagService.listFlags();
        return { flags };
      }
      case "ide/setFeatureFlag": {
        if (!this.featureFlagService) {
          throw new Error("Feature flag service not available");
        }
        const args = request.params as { key?: string; enabled?: boolean; config?: Record<string, unknown> | null };
        if (!args.key || typeof args.enabled !== "boolean") {
          throw new Error("setFeatureFlag requires 'key' (string) and 'enabled' (boolean) params");
        }
        const updated = await this.featureFlagService.setFlag(
          args.key as FeatureFlagKey,
          args.enabled,
          args.config
        );
        return updated;
      }
      case "ide/ping": {
        return { ok: true, timestamp: this.timer.now() };
      }
      case "ide/status": {
        return {
          version: getMcpServerVersion(),
          releaseVersion: RELEASE_VERSION,
          android: {
            ctrlProxy: {
              expectedSha256: APK_SHA256_CHECKSUM,
              url: APK_URL,
            },
          },
          ios: {
            xcTestService: {
              expectedSha256: IOS_CTRL_PROXY_SHA256_CHECKSUM,
              expectedAppHash: IOS_CTRL_PROXY_APP_HASH,
              url: IOS_CTRL_PROXY_IPA_URL,
            },
          },
        };
      }
      case "ide/updateService": {
        const args = request.params as { deviceId?: string; platform?: string };
        if (!args.deviceId || !args.platform) {
          throw new Error("updateService requires 'deviceId' (string) and 'platform' (string) params");
        }
        if (args.platform !== "android" && args.platform !== "ios") {
          throw new Error(`Invalid platform: ${args.platform}. Must be 'android' or 'ios'.`);
        }

        // Find the booted device
        const bootedDevices = await PlatformDeviceManagerFactory.getInstance().getBootedDevices(args.platform);
        const targetDevice = bootedDevices.find(d => d.deviceId === args.deviceId);
        if (!targetDevice) {
          throw new Error(`Device not found: ${args.deviceId}`);
        }

        if (args.platform === "android") {
          const manager = AndroidCtrlProxyManager.getInstance(targetDevice);
          const result = await manager.ensureCompatibleVersion();
          const successStatuses = new Set(["compatible", "upgraded", "installed", "reinstalled"]);
          return {
            success: successStatuses.has(result.status),
            message: `Accessibility service ${result.status}${result.error ? `: ${result.error}` : ""}`,
            status: result,
          };
        } else {
          const manager = IOSCtrlProxyManager.getInstance(targetDevice);
          await manager.forceRestart();
          return {
            success: true,
            message: "CtrlProxy iOS restarted",
          };
        }
      }
      case "ide/setKeyValue": {
        const args = request.params as {
          deviceId?: string;
          appId?: string;
          fileName?: string;
          key?: string;
          value?: string | null;
          type?: string;
        };
        if (!args.deviceId || !args.appId || !args.fileName || !args.key || !args.type) {
          throw new Error("setKeyValue requires deviceId, appId, fileName, key, and type params");
        }
        const bootedDevices = await PlatformDeviceManagerFactory.getInstance().getBootedDevices("android");
        const targetDevice = bootedDevices.find(d => d.deviceId === args.deviceId);
        if (!targetDevice) {
          throw new Error(`Device not found: ${args.deviceId}`);
        }
        const client = CtrlProxyClient.getInstance(targetDevice, defaultAdbClientFactory);
        if (args.value === null || args.value === undefined) {
          await client.removePreference(args.appId, args.fileName, args.key);
        } else {
          await client.setPreference(
            args.appId,
            args.fileName,
            args.key,
            args.value,
            args.type as KeyValueType
          );
        }
        return { success: true };
      }
      case "ide/removeKeyValue": {
        const args = request.params as {
          deviceId?: string;
          appId?: string;
          fileName?: string;
          key?: string;
        };
        if (!args.deviceId || !args.appId || !args.fileName || !args.key) {
          throw new Error("removeKeyValue requires deviceId, appId, fileName, and key params");
        }
        const bootedDevices = await PlatformDeviceManagerFactory.getInstance().getBootedDevices("android");
        const targetDevice = bootedDevices.find(d => d.deviceId === args.deviceId);
        if (!targetDevice) {
          throw new Error(`Device not found: ${args.deviceId}`);
        }
        const client = CtrlProxyClient.getInstance(targetDevice, defaultAdbClientFactory);
        await client.removePreference(args.appId, args.fileName, args.key);
        return { success: true };
      }
      case "ide/clearKeyValueFile": {
        const args = request.params as {
          deviceId?: string;
          appId?: string;
          fileName?: string;
        };
        if (!args.deviceId || !args.appId || !args.fileName) {
          throw new Error("clearKeyValueFile requires deviceId, appId, and fileName params");
        }
        const bootedDevices = await PlatformDeviceManagerFactory.getInstance().getBootedDevices("android");
        const targetDevice = bootedDevices.find(d => d.deviceId === args.deviceId);
        if (!targetDevice) {
          throw new Error(`Device not found: ${args.deviceId}`);
        }
        const client = CtrlProxyClient.getInstance(targetDevice, defaultAdbClientFactory);
        await client.clearPreferenceStore(args.appId, args.fileName);
        return { success: true };
      }
      default:
        return undefined;
    }
  }

  private async handleIdeRequest(
    mcpClient: Client,
    request: DaemonRequest
  ): Promise<any> {
    // Extract timeout from request, defaulting to 30 seconds if not provided
    // (MCP SDK default is 60 seconds, but we prefer faster failure for better UX)
    const DEFAULT_MCP_REQUEST_TIMEOUT_MS = 30000;
    const requestOptions = { timeout: request.timeoutMs ?? DEFAULT_MCP_REQUEST_TIMEOUT_MS };

    switch (request.method) {
      case "tools/list": {
        return await mcpClient.listTools();
      }
      case "tools/call": {
        return await mcpClient.callTool({
          name: request.params.name,
          arguments: request.params.arguments,
        }, undefined, requestOptions);
      }
      case "resources/list": {
        return await mcpClient.listResources();
      }
      case "resources/read": {
        if (!request.params?.uri) {
          throw new Error("resources/read requires params.uri");
        }
        return await mcpClient.readResource({ uri: request.params.uri }, undefined, requestOptions);
      }
      case "resources/list-templates": {
        return await mcpClient.listResourceTemplates();
      }
      case "ide/getNavigationGraph": {
        const args = request.params ?? {};
        return await mcpClient.callTool({ name: "getNavigationGraph", arguments: args }, undefined, requestOptions);
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
