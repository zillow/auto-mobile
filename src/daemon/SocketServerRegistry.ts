import { logger } from "../utils/logger";
import { BaseSocketServer } from "./socketServer/BaseSocketServer";

/**
 * Factory function type for creating socket servers.
 */
export type SocketServerFactory<T extends BaseSocketServer = BaseSocketServer> = () => T;

/**
 * Configuration for registering a socket server.
 */
export interface SocketServerConfig<T extends BaseSocketServer = BaseSocketServer> {
  /** Factory function to create the server instance */
  factory: SocketServerFactory<T>;
  /** Whether this server should be started during startAll() */
  autoStart?: boolean;
}

/**
 * Registry for managing socket server lifecycle.
 *
 * Provides centralized management of all socket servers:
 * - Registration of server factories
 * - Start/stop all servers at once
 * - Get individual server instances
 *
 * This replaces the pattern of having start/stop functions
 * exported from each socket server module.
 */
export class SocketServerRegistry {
  private servers: Map<string, BaseSocketServer> = new Map();
  private factories: Map<string, SocketServerConfig> = new Map();

  /**
   * Register a socket server factory.
   * The server will be lazily created when start() is called.
   *
   * @param name - Unique identifier for the server
   * @param config - Server configuration including factory
   */
  register<T extends BaseSocketServer>(
    name: string,
    config: SocketServerConfig<T>
  ): void {
    if (this.factories.has(name)) {
      logger.warn(`[SocketServerRegistry] Overwriting existing registration for '${name}'`);
    }
    this.factories.set(name, config as SocketServerConfig);
  }

  /**
   * Start a specific socket server by name.
   * Creates the server instance if not already created.
   *
   * @param name - Server identifier
   * @returns The started server instance
   */
  async start<T extends BaseSocketServer = BaseSocketServer>(name: string): Promise<T> {
    const config = this.factories.get(name);
    if (!config) {
      throw new Error(`[SocketServerRegistry] Unknown server: ${name}`);
    }

    let server = this.servers.get(name) as T | undefined;
    if (!server) {
      server = config.factory() as T;
      this.servers.set(name, server);
    }

    if (!server.isListening()) {
      await server.start();
      logger.info(`[SocketServerRegistry] Started '${name}'`);
    }

    return server;
  }

  /**
   * Stop a specific socket server by name.
   *
   * @param name - Server identifier
   */
  async stop(name: string): Promise<void> {
    const server = this.servers.get(name);
    if (!server) {
      return;
    }

    await server.close();
    this.servers.delete(name);
    logger.info(`[SocketServerRegistry] Stopped '${name}'`);
  }

  /**
   * Start all registered servers with autoStart=true (default).
   */
  async startAll(): Promise<void> {
    const startPromises: Promise<void>[] = [];

    for (const [name, config] of this.factories) {
      // Default autoStart to true if not specified
      if (config.autoStart !== false) {
        startPromises.push(
          this.start(name).catch(error => {
            logger.error(`[SocketServerRegistry] Failed to start '${name}': ${error}`);
          })
        );
      }
    }

    await Promise.all(startPromises);
  }

  /**
   * Stop all running servers.
   */
  async stopAll(): Promise<void> {
    const stopPromises: Promise<void>[] = [];

    for (const name of this.servers.keys()) {
      stopPromises.push(
        this.stop(name).catch(error => {
          logger.warn(`[SocketServerRegistry] Failed to stop '${name}': ${error}`);
        })
      );
    }

    await Promise.all(stopPromises);
  }

  /**
   * Get a server instance by name.
   * Returns null if the server hasn't been started.
   *
   * @param name - Server identifier
   * @returns Server instance or null
   */
  get<T extends BaseSocketServer = BaseSocketServer>(name: string): T | null {
    return (this.servers.get(name) as T) ?? null;
  }

  /**
   * Check if a server is currently running.
   *
   * @param name - Server identifier
   * @returns true if the server exists and is listening
   */
  isRunning(name: string): boolean {
    const server = this.servers.get(name);
    return server?.isListening() ?? false;
  }

  /**
   * Get the names of all registered servers.
   */
  getRegisteredNames(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Get the names of all running servers.
   */
  getRunningNames(): string[] {
    return Array.from(this.servers.keys()).filter(name =>
      this.servers.get(name)?.isListening()
    );
  }

  /**
   * Clear all registrations and servers.
   * Useful for testing.
   */
  clear(): void {
    this.servers.clear();
    this.factories.clear();
  }
}

// Default singleton instance
let defaultRegistry: SocketServerRegistry | null = null;

/**
 * Get the default socket server registry instance.
 */
export function getSocketServerRegistry(): SocketServerRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new SocketServerRegistry();
  }
  return defaultRegistry;
}

/**
 * Reset the default registry (for testing).
 */
export function resetSocketServerRegistry(): void {
  if (defaultRegistry) {
    defaultRegistry.clear();
  }
  defaultRegistry = null;
}
