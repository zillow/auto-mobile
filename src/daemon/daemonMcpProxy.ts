import { DaemonClient, DaemonUnavailableError, type DaemonClientLike, type DaemonClientFactory } from "./client";
import { DaemonManager } from "./manager";
import { logger } from "../utils/logger";
import { SOCKET_PATH, DAEMON_STARTUP_TIMEOUT_MS } from "./constants";
import type { DaemonOptions } from "./types";

/**
 * Configuration for the DaemonMcpProxy
 */
export interface DaemonMcpProxyConfig {
  /** Whether to automatically start the daemon if not running */
  autoStartDaemon?: boolean;
  /** Socket path for daemon communication */
  socketPath?: string;
  /** Connection timeout in milliseconds */
  connectionTimeoutMs?: number;
  /** Factory for creating daemon clients (for testing) */
  clientFactory?: DaemonClientFactory;
  /** Custom daemon manager (for testing) */
  daemonManager?: DaemonManager;
  /** Options to pass when auto-starting the daemon */
  daemonOptions?: DaemonOptions;
}

/**
 * Tool definition from daemon
 */
export interface ProxiedToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Resource definition from daemon
 */
export interface ProxiedResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * Resource template definition from daemon
 */
export interface ProxiedResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * DaemonMcpProxy - Proxy layer for MCP server to communicate with daemon
 *
 * This class handles:
 * - Auto-connecting to an existing daemon
 * - Auto-starting a daemon if one isn't running
 * - Forwarding MCP tool calls to the daemon
 * - Forwarding MCP resource requests to the daemon
 * - Caching tool/resource definitions from daemon
 */
export class DaemonMcpProxy {
  private client: DaemonClientLike | null = null;
  private config: DaemonMcpProxyConfig;
  private daemonManager: DaemonManager;
  private clientFactory: DaemonClientFactory;
  private connecting: Promise<void> | null = null;
  private connected: boolean = false;

  // Cached definitions from daemon
  private cachedTools: ProxiedToolDefinition[] | null = null;
  private cachedResources: ProxiedResourceDefinition[] | null = null;
  private cachedResourceTemplates: ProxiedResourceTemplate[] | null = null;

  constructor(config: DaemonMcpProxyConfig = {}) {
    this.config = {
      autoStartDaemon: true,
      socketPath: SOCKET_PATH,
      connectionTimeoutMs: 30000,
      ...config,
    };
    this.daemonManager = config.daemonManager ?? new DaemonManager();
    this.clientFactory = config.clientFactory ?? (() => new DaemonClient(
      this.config.socketPath,
      this.config.connectionTimeoutMs
    ));
  }

  /**
   * Ensure we have a connection to the daemon
   * Will auto-start daemon if configured and daemon is not running
   */
  async ensureConnected(): Promise<void> {
    if (this.connected && this.client) {
      return;
    }

    // Prevent multiple concurrent connection attempts
    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = this.doConnect();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async doConnect(): Promise<void> {
    // Check if daemon is available
    const socketPath = this.config.socketPath ?? SOCKET_PATH;
    const isAvailable = await DaemonClient.isAvailable(socketPath);

    if (!isAvailable) {
      if (this.config.autoStartDaemon) {
        logger.info("[DaemonMcpProxy] Daemon not available, starting daemon...");
        await this.startDaemon();
      } else {
        throw new DaemonUnavailableError(
          "Daemon is not running and auto-start is disabled"
        );
      }
    }

    // Create and connect client
    this.client = this.clientFactory();
    await this.client.connect();
    this.connected = true;
    logger.info("[DaemonMcpProxy] Connected to daemon");
  }

  /**
   * Start the daemon process
   */
  private async startDaemon(): Promise<void> {
    const status = await this.daemonManager.status();

    if (!status.running) {
      logger.info("[DaemonMcpProxy] Starting daemon...");
      // Pass through daemon options (debug flags, video defaults, etc.)
      await this.daemonManager.start(this.config.daemonOptions ?? {});

      // Wait for daemon to be ready
      const ready = await this.daemonManager.waitForReady(DAEMON_STARTUP_TIMEOUT_MS);
      if (!ready) {
        throw new DaemonUnavailableError(
          `Daemon failed to start within ${DAEMON_STARTUP_TIMEOUT_MS}ms`
        );
      }
      logger.info("[DaemonMcpProxy] Daemon started successfully");
    }
  }

  /**
   * Get list of available tools from daemon
   */
  async listTools(): Promise<ProxiedToolDefinition[]> {
    // Return cached tools if available
    if (this.cachedTools) {
      return this.cachedTools;
    }

    await this.ensureConnected();

    try {
      const result = await this.client!.callDaemonMethod("tools/list", {});
      const tools = result?.tools ?? [];
      this.cachedTools = tools;
      return tools;
    } catch (error) {
      logger.error(`[DaemonMcpProxy] Failed to list tools: ${error}`);
      throw error;
    }
  }

  /**
   * Call a tool on the daemon
   */
  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<any> {
    await this.ensureConnected();

    try {
      const result = await this.client!.callTool(name, args);
      return result;
    } catch (error) {
      // Handle connection errors by reconnecting
      if (error instanceof DaemonUnavailableError) {
        this.connected = false;
        this.client = null;
        // Retry once after reconnecting
        await this.ensureConnected();
        return await this.client!.callTool(name, args);
      }
      throw error;
    }
  }

  /**
   * Get list of available resources from daemon
   */
  async listResources(): Promise<ProxiedResourceDefinition[]> {
    // Return cached resources if available
    if (this.cachedResources) {
      return this.cachedResources;
    }

    await this.ensureConnected();

    try {
      const result = await this.client!.callDaemonMethod("resources/list", {});
      const resources = result?.resources ?? [];
      this.cachedResources = resources;
      return resources;
    } catch (error) {
      logger.error(`[DaemonMcpProxy] Failed to list resources: ${error}`);
      throw error;
    }
  }

  /**
   * Get list of resource templates from daemon
   */
  async listResourceTemplates(): Promise<ProxiedResourceTemplate[]> {
    // Return cached templates if available
    if (this.cachedResourceTemplates) {
      return this.cachedResourceTemplates;
    }

    await this.ensureConnected();

    try {
      const result = await this.client!.callDaemonMethod("resources/list-templates", {});
      const templates = result?.resourceTemplates ?? [];
      this.cachedResourceTemplates = templates;
      return templates;
    } catch (error) {
      logger.error(`[DaemonMcpProxy] Failed to list resource templates: ${error}`);
      throw error;
    }
  }

  /**
   * Read a resource from the daemon
   */
  async readResource(uri: string): Promise<any> {
    await this.ensureConnected();

    try {
      const result = await this.client!.readResource(uri);
      return result;
    } catch (error) {
      // Handle connection errors by reconnecting
      if (error instanceof DaemonUnavailableError) {
        this.connected = false;
        this.client = null;
        // Retry once after reconnecting
        await this.ensureConnected();
        return await this.client!.readResource(uri);
      }
      throw error;
    }
  }

  /**
   * Invalidate cached definitions (call when daemon restarts)
   */
  invalidateCache(): void {
    this.cachedTools = null;
    this.cachedResources = null;
    this.cachedResourceTemplates = null;
  }

  /**
   * Check if connected to daemon
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Close the connection to daemon
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    this.connected = false;
    this.invalidateCache();
    logger.info("[DaemonMcpProxy] Disconnected from daemon");
  }
}
