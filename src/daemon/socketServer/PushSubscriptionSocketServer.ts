import { Socket } from "node:net";
import { logger } from "../../utils/logger";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { BaseSocketServer } from "./BaseSocketServer";
import {
  Subscriber,
  SubscriptionCommand,
  KeepaliveConfig,
  DEFAULT_KEEPALIVE_CONFIG,
} from "./SocketServerTypes";

/**
 * Response message for subscription operations.
 */
export interface SubscriptionResponse {
  id?: string;
  type: "subscription_response" | "ping" | "pong" | "error";
  success?: boolean;
  error?: string;
  timestamp?: number;
}

/**
 * Abstract base class for push-based socket servers with subscriptions.
 * Handles subscriber management, keepalive, and push notifications.
 *
 * Subclasses implement:
 * - parseSubscriptionFilter(): Extract filter from subscription request
 * - createPushMessage(): Create push message for subscribers
 */
export abstract class PushSubscriptionSocketServer<TFilter, TPushData> extends BaseSocketServer {
  protected subscribers: Map<string, Subscriber<TFilter>> = new Map();
  private subscriptionCounter = 0;
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  protected readonly keepaliveConfig: KeepaliveConfig;

  constructor(
    socketPath: string,
    timer: Timer = defaultTimer,
    serverName: string = "Push",
    keepaliveConfig: KeepaliveConfig = DEFAULT_KEEPALIVE_CONFIG
  ) {
    super(socketPath, timer, serverName);
    this.keepaliveConfig = keepaliveConfig;
  }

  /**
   * Called when the server starts. Starts keepalive timer.
   */
  protected onServerStarted(): void {
    this.startKeepalive();
  }

  /**
   * Called before the server closes. Stops keepalive and cleans up subscribers.
   */
  protected onServerClosing(): void {
    this.stopKeepalive();

    for (const subscriber of this.subscribers.values()) {
      try {
        subscriber.socket.end();
      } catch {
        // Ignore errors when closing
      }
    }
    this.subscribers.clear();
  }

  /**
   * Start the keepalive timer.
   */
  protected startKeepalive(): void {
    if (this.keepaliveInterval) {
      return;
    }

    this.keepaliveInterval = this.timer.setInterval(() => {
      this.checkKeepalive();
    }, this.keepaliveConfig.intervalMs);
  }

  /**
   * Stop the keepalive timer.
   */
  protected stopKeepalive(): void {
    if (this.keepaliveInterval) {
      this.timer.clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  /**
   * Check keepalive for all subscribers, removing dead ones.
   */
  protected checkKeepalive(): void {
    const now = this.timer.now();
    const deadSubscribers: string[] = [];

    for (const [subscriptionId, subscriber] of this.subscribers) {
      if (subscriber.socket.destroyed) {
        logger.info(`[${this.serverName}] Subscriber ${subscriptionId} socket destroyed, removing`);
        deadSubscribers.push(subscriptionId);
        continue;
      }

      const timeSinceActivity = now - subscriber.lastActivity;
      if (timeSinceActivity > this.keepaliveConfig.timeoutMs) {
        logger.warn(`[${this.serverName}] Subscriber ${subscriptionId} timed out, removing`);
        deadSubscribers.push(subscriptionId);
        try {
          subscriber.socket.destroy();
        } catch {
          // Ignore errors when destroying
        }
        continue;
      }

      // Send ping
      const pingMessage: SubscriptionResponse = {
        type: "ping",
        timestamp: now,
      };
      try {
        this.sendJson(subscriber.socket, pingMessage);
      } catch (error) {
        logger.warn(`[${this.serverName}] Failed to ping ${subscriptionId}: ${error}`);
        deadSubscribers.push(subscriptionId);
      }
    }

    for (const subscriptionId of deadSubscribers) {
      this.subscribers.delete(subscriptionId);
    }
  }

  /**
   * Process a single line of input. Handles subscribe/unsubscribe/pong commands.
   */
  protected async processLine(socket: Socket, line: string): Promise<void> {
    const request = this.parseJson<SubscriptionCommand & Record<string, unknown>>(line);

    if (!request) {
      const errorResponse: SubscriptionResponse = {
        type: "error",
        success: false,
        error: "Invalid JSON",
      };
      this.sendJson(socket, errorResponse);
      return;
    }

    try {
      switch (request.command) {
        case "subscribe":
          await this.handleSubscribe(socket, request);
          break;
        case "unsubscribe":
          await this.handleUnsubscribe(socket, request);
          break;
        case "pong":
          this.handlePong(socket);
          break;
        default:
          throw new Error(`Unknown command: ${request.command}`);
      }
    } catch (error) {
      logger.error(`[${this.serverName}] Command error: ${error}`);
      const errorResponse: SubscriptionResponse = {
        id: request.id,
        type: "error",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      this.sendJson(socket, errorResponse);
    }
  }

  /**
   * Handle a subscribe command.
   */
  private async handleSubscribe(
    socket: Socket,
    request: SubscriptionCommand & Record<string, unknown>
  ): Promise<void> {
    const subscriptionId = `${this.serverName.toLowerCase()}-${++this.subscriptionCounter}`;
    const filter = this.parseSubscriptionFilter(request);

    this.subscribers.set(subscriptionId, {
      socket,
      subscriptionId,
      lastActivity: this.timer.now(),
      filter,
    });

    const response: SubscriptionResponse = {
      id: request.id,
      type: "subscription_response",
      success: true,
    };
    this.sendJson(socket, response);

    logger.info(`[${this.serverName}] New subscriber ${subscriptionId}`);

    this.onSubscribed(subscriptionId, filter, socket);
  }

  /**
   * Called after a new subscriber is added. Override to send backfill data.
   */
  protected onSubscribed(_subscriptionId: string, _filter: F, _socket: Socket): void {
    // Default: no-op
  }

  /**
   * Handle an unsubscribe command.
   */
  private async handleUnsubscribe(
    socket: Socket,
    request: SubscriptionCommand
  ): Promise<void> {
    for (const [subId, subscriber] of this.subscribers) {
      if (subscriber.socket === socket) {
        this.subscribers.delete(subId);
        logger.info(`[${this.serverName}] Unsubscribed ${subId}`);
        break;
      }
    }

    const response: SubscriptionResponse = {
      id: request.id,
      type: "subscription_response",
      success: true,
    };
    this.sendJson(socket, response);
  }

  /**
   * Handle a pong command (keepalive response).
   */
  private handlePong(socket: Socket): void {
    for (const subscriber of this.subscribers.values()) {
      if (subscriber.socket === socket) {
        subscriber.lastActivity = this.timer.now();
        logger.debug(`[${this.serverName}] Received pong from ${subscriber.subscriptionId}`);
        break;
      }
    }
  }

  /**
   * Called when a connection closes. Removes subscriber.
   */
  protected onConnectionClose(socket: Socket): void {
    for (const [subId, subscriber] of this.subscribers) {
      if (subscriber.socket === socket) {
        this.subscribers.delete(subId);
        logger.info(`[${this.serverName}] Subscriber ${subId} disconnected`);
        break;
      }
    }
  }

  /**
   * Called when a connection error occurs. Removes subscriber.
   */
  protected onConnectionError(socket: Socket, _error: Error): void {
    for (const [subId, subscriber] of this.subscribers) {
      if (subscriber.socket === socket) {
        this.subscribers.delete(subId);
        break;
      }
    }
  }

  /**
   * Push data to all matching subscribers.
   */
  protected pushToSubscribers(data: TPushData): number {
    const message = this.createPushMessage(data);
    const json = JSON.stringify(message) + "\n";
    let sentCount = 0;
    const deadSubscribers: string[] = [];

    for (const [subscriptionId, subscriber] of this.subscribers) {
      if (!this.matchesFilter(subscriber.filter, data)) {
        continue;
      }

      if (subscriber.socket.destroyed) {
        deadSubscribers.push(subscriptionId);
        continue;
      }

      try {
        const result = subscriber.socket.write(json);
        if (result) {
          subscriber.lastActivity = this.timer.now();
        }
        sentCount++;
      } catch (error) {
        logger.warn(`[${this.serverName}] Failed to send to ${subscriptionId}: ${error}`);
        deadSubscribers.push(subscriptionId);
      }
    }

    for (const subscriptionId of deadSubscribers) {
      this.subscribers.delete(subscriptionId);
    }

    return sentCount;
  }

  /**
   * Get the current subscriber count.
   */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * Parse subscription filter from request.
   * Subclasses must implement this.
   */
  protected abstract parseSubscriptionFilter(request: Record<string, unknown>): TFilter;

  /**
   * Check if data matches the subscriber's filter.
   * Subclasses must implement this.
   */
  protected abstract matchesFilter(filter: TFilter, data: TPushData): boolean;

  /**
   * Create a push message from data.
   * Subclasses must implement this.
   */
  protected abstract createPushMessage(data: TPushData): unknown;
}
