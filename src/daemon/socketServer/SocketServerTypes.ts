import { Socket } from "node:net";

/**
 * Base request interface for socket servers.
 * The id field is optional for servers that don't need request correlation.
 */
export interface SocketRequest {
  id?: string;
}

/**
 * Base response interface for socket servers.
 * The id field is optional for servers that don't need request correlation.
 */
export interface SocketResponse {
  id?: string;
  success: boolean;
  error?: string;
}

/**
 * Configuration for socket server paths.
 */
export interface SocketServerConfig {
  /** Default socket path when not in external mode */
  defaultPath: string;
  /** Socket path when in external mode (Docker) */
  externalPath: string;
}

/**
 * Subscriber info for push-based socket servers.
 */
export interface Subscriber<TFilter = unknown> {
  socket: Socket;
  subscriptionId: string;
  lastActivity: number;
  filter: TFilter;
}

/**
 * Subscription command for push servers.
 */
export interface SubscriptionCommand {
  id: string;
  command: "subscribe" | "unsubscribe" | "pong";
}

/**
 * Keepalive configuration for push servers.
 */
export interface KeepaliveConfig {
  /** Interval between keepalive pings in milliseconds */
  intervalMs: number;
  /** Time without activity before considering subscriber dead */
  timeoutMs: number;
}

/**
 * Default keepalive configuration.
 */
export const DEFAULT_KEEPALIVE_CONFIG: KeepaliveConfig = {
  intervalMs: 10_000,
  timeoutMs: 30_000,
};

/**
 * Get the socket path based on environment mode.
 */
export function getSocketPath(config: SocketServerConfig): string {
  const isExternalMode = process.env.AUTOMOBILE_EMULATOR_EXTERNAL === "true";
  return isExternalMode ? config.externalPath : config.defaultPath;
}
