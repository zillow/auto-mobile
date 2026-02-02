import { Socket } from "node:net";
import { logger } from "../../utils/logger";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { BaseSocketServer } from "../socketServer/BaseSocketServer";
import { KeepaliveConfig, DEFAULT_KEEPALIVE_CONFIG } from "../socketServer/SocketServerTypes";
import type { DomainHandler } from "./DomainHandler";
import {
  Domain,
  UnifiedMessage,
  SubscriptionFilter,
  ErrorCodes,
  createError,
  createResponse,
  createErrorResponse,
  createPush,
  createPing,
  isRequest,
  isSubscribe,
  isUnsubscribe,
  isPong,
} from "./UnifiedSocketTypes";

/**
 * Active subscription state.
 */
interface ActiveSubscription {
  subscriptionId: string;
  domain: Domain;
  event: string | null;
  filter: SubscriptionFilter;
}

/**
 * Per-socket state.
 */
interface SocketState {
  socketId: string;
  lastActivity: number;
  subscriptions: Map<string, ActiveSubscription>;
}

/**
 * Unified socket server that multiplexes multiple domains over a single socket.
 *
 * Features:
 * - Request/response with correlation via message IDs
 * - Multiple concurrent subscriptions per socket
 * - Domain-based message routing
 * - Keepalive with ping/pong (10s ping, 30s timeout)
 * - Timer injection for testing
 */
export class UnifiedSocketServer extends BaseSocketServer {
  private handlers: Map<Domain, DomainHandler> = new Map();
  private sockets: Map<Socket, SocketState> = new Map();
  private subscriptionCounter = 0;
  private socketCounter = 0;
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  private readonly keepaliveConfig: KeepaliveConfig;

  constructor(
    socketPath: string,
    timer: Timer = defaultTimer,
    keepaliveConfig: KeepaliveConfig = DEFAULT_KEEPALIVE_CONFIG
  ) {
    super(socketPath, timer, "UnifiedSocket");
    this.keepaliveConfig = keepaliveConfig;
  }

  /**
   * Register a domain handler.
   */
  registerHandler(handler: DomainHandler): void {
    this.handlers.set(handler.domain, handler);
  }

  /**
   * Get a registered handler by domain.
   */
  getHandler(domain: Domain): DomainHandler | undefined {
    return this.handlers.get(domain);
  }

  /**
   * Get all registered handlers.
   */
  getHandlers(): ReadonlyMap<Domain, DomainHandler> {
    return this.handlers;
  }

  /**
   * Get the number of connected sockets.
   */
  getSocketCount(): number {
    return this.sockets.size;
  }

  /**
   * Get the total number of active subscriptions across all sockets.
   */
  getSubscriptionCount(): number {
    let count = 0;
    for (const state of this.sockets.values()) {
      count += state.subscriptions.size;
    }
    return count;
  }

  /**
   * Called when the server starts. Initializes handlers and starts keepalive.
   */
  protected onServerStarted(): void {
    // Initialize all handlers with push callback
    for (const handler of this.handlers.values()) {
      handler.initialize((event, data, filter) => {
        this.pushToSubscribers(handler.domain, event, data, filter);
      });
    }

    this.startKeepalive();
  }

  /**
   * Called before the server closes. Disposes handlers and cleans up.
   */
  protected onServerClosing(): void {
    this.stopKeepalive();

    // Dispose all handlers
    for (const handler of this.handlers.values()) {
      handler.dispose();
    }

    // Close all sockets
    for (const [socket, state] of this.sockets) {
      try {
        socket.end();
      } catch {
        // Ignore errors when closing
      }
      state.subscriptions.clear();
    }
    this.sockets.clear();
  }

  /**
   * Called when a connection is established.
   */
  protected onConnectionEstablished(socket: Socket): void {
    const socketId = `unified-${++this.socketCounter}`;
    this.sockets.set(socket, {
      socketId,
      lastActivity: this.timer.now(),
      subscriptions: new Map(),
    });
    logger.info(`[UnifiedSocket] Client connected: ${socketId}`);
  }

  /**
   * Called when a connection closes.
   */
  protected onConnectionClose(socket: Socket): void {
    const state = this.sockets.get(socket);
    if (state) {
      logger.info(`[UnifiedSocket] Client disconnected: ${state.socketId}`);
      state.subscriptions.clear();
      this.sockets.delete(socket);
    }
  }

  /**
   * Called when a connection error occurs.
   */
  protected onConnectionError(socket: Socket, _error: Error): void {
    const state = this.sockets.get(socket);
    if (state) {
      state.subscriptions.clear();
      this.sockets.delete(socket);
    }
  }

  /**
   * Process a single line of input.
   */
  protected async processLine(socket: Socket, line: string): Promise<void> {
    const state = this.sockets.get(socket);
    if (!state) {
      return;
    }

    // Update activity timestamp
    state.lastActivity = this.timer.now();

    // Parse message
    const message = this.parseJson<UnifiedMessage>(line);
    if (!message) {
      const errorResponse = createErrorResponse(
        undefined,
        undefined,
        createError(ErrorCodes.INVALID_JSON, "Invalid JSON"),
        this.timer.now()
      );
      this.sendJson(socket, errorResponse);
      return;
    }

    try {
      await this.handleMessage(socket, state, message);
    } catch (error) {
      logger.error(`[UnifiedSocket] Message handling error: ${error}`);
      const errorResponse = createErrorResponse(
        message.id,
        message.domain,
        createError(
          ErrorCodes.HANDLER_ERROR,
          error instanceof Error ? error.message : String(error)
        ),
        this.timer.now()
      );
      this.sendJson(socket, errorResponse);
    }
  }

  /**
   * Handle a parsed message.
   */
  private async handleMessage(
    socket: Socket,
    state: SocketState,
    message: UnifiedMessage
  ): Promise<void> {
    // Handle pong (keepalive response)
    if (isPong(message)) {
      state.lastActivity = this.timer.now();
      return;
    }

    // Handle request
    if (isRequest(message)) {
      await this.handleRequest(socket, message);
      return;
    }

    // Handle subscribe
    if (isSubscribe(message)) {
      this.handleSubscribe(socket, state, message);
      return;
    }

    // Handle unsubscribe
    if (isUnsubscribe(message)) {
      this.handleUnsubscribe(socket, state, message);
      return;
    }

    // Unknown message type
    const errorResponse = createErrorResponse(
      message.id,
      message.domain,
      createError(ErrorCodes.INVALID_MESSAGE, `Unknown message type: ${message.type}`),
      this.timer.now()
    );
    this.sendJson(socket, errorResponse);
  }

  /**
   * Handle a request message.
   */
  private async handleRequest(socket: Socket, message: UnifiedMessage): Promise<void> {
    const { id, domain, method, params } = message;

    if (!domain || !method) {
      const errorResponse = createErrorResponse(
        id,
        domain,
        createError(ErrorCodes.INVALID_MESSAGE, "Request requires domain and method"),
        this.timer.now()
      );
      this.sendJson(socket, errorResponse);
      return;
    }

    const handler = this.handlers.get(domain);
    if (!handler) {
      const errorResponse = createErrorResponse(
        id,
        domain,
        createError(ErrorCodes.UNKNOWN_DOMAIN, `Unknown domain: ${domain}`),
        this.timer.now()
      );
      this.sendJson(socket, errorResponse);
      return;
    }

    const result = await handler.handleRequest(method, params);

    if (result.error) {
      const errorResponse = createErrorResponse(id, domain, result.error, this.timer.now());
      this.sendJson(socket, errorResponse);
    } else {
      const response = createResponse(id!, domain, result.result, this.timer.now());
      this.sendJson(socket, response);
    }
  }

  /**
   * Handle a subscribe message.
   */
  private handleSubscribe(
    socket: Socket,
    state: SocketState,
    message: UnifiedMessage
  ): void {
    const { id, domain, event, params } = message;

    if (!domain) {
      const errorResponse = createErrorResponse(
        id,
        undefined,
        createError(ErrorCodes.INVALID_MESSAGE, "Subscribe requires domain"),
        this.timer.now()
      );
      this.sendJson(socket, errorResponse);
      return;
    }

    const handler = this.handlers.get(domain);
    if (!handler) {
      const errorResponse = createErrorResponse(
        id,
        domain,
        createError(ErrorCodes.UNKNOWN_DOMAIN, `Unknown domain: ${domain}`),
        this.timer.now()
      );
      this.sendJson(socket, errorResponse);
      return;
    }

    const subscriptionId = `sub-${++this.subscriptionCounter}`;
    const filter = handler.parseSubscriptionFilter(params);

    state.subscriptions.set(subscriptionId, {
      subscriptionId,
      domain,
      event: event ?? null,
      filter,
    });

    const response = createResponse(id!, domain, { subscriptionId }, this.timer.now());
    this.sendJson(socket, response);

    logger.info(`[UnifiedSocket] New subscription ${subscriptionId} for ${domain}${event ? `/${event}` : ""}`);
  }

  /**
   * Handle an unsubscribe message.
   */
  private handleUnsubscribe(
    socket: Socket,
    state: SocketState,
    message: UnifiedMessage
  ): void {
    const { id, domain, params } = message;
    const subscriptionId = params?.subscriptionId as string | undefined;

    if (!subscriptionId) {
      const errorResponse = createErrorResponse(
        id,
        domain,
        createError(ErrorCodes.INVALID_MESSAGE, "Unsubscribe requires subscriptionId in params"),
        this.timer.now()
      );
      this.sendJson(socket, errorResponse);
      return;
    }

    const subscription = state.subscriptions.get(subscriptionId);
    if (!subscription) {
      const errorResponse = createErrorResponse(
        id,
        domain,
        createError(ErrorCodes.SUBSCRIPTION_NOT_FOUND, `Subscription not found: ${subscriptionId}`),
        this.timer.now()
      );
      this.sendJson(socket, errorResponse);
      return;
    }

    state.subscriptions.delete(subscriptionId);

    const response = createResponse(id!, domain ?? subscription.domain, { success: true }, this.timer.now());
    this.sendJson(socket, response);

    logger.info(`[UnifiedSocket] Unsubscribed ${subscriptionId}`);
  }

  /**
   * Push an event to all matching subscribers.
   */
  private pushToSubscribers(
    domain: Domain,
    event: string,
    data: unknown,
    filter?: SubscriptionFilter
  ): number {
    const handler = this.handlers.get(domain);
    if (!handler) {
      return 0;
    }

    const pushMessage = createPush(domain, event, data, this.timer.now());
    const json = JSON.stringify(pushMessage) + "\n";
    let sentCount = 0;
    const deadSockets: Socket[] = [];

    for (const [socket, state] of this.sockets) {
      if (socket.destroyed) {
        deadSockets.push(socket);
        continue;
      }

      // Check each subscription on this socket
      for (const subscription of state.subscriptions.values()) {
        // Must match domain
        if (subscription.domain !== domain) {
          continue;
        }

        // If subscription specifies an event, it must match
        if (subscription.event !== null && subscription.event !== event) {
          continue;
        }

        // If handler provides filter matching, use it
        if (!handler.matchesFilter(subscription.filter, { event, data })) {
          continue;
        }

        // If push has a target filter, check it matches the subscription filter
        if (filter && !this.filtersMatch(subscription.filter, filter)) {
          continue;
        }

        try {
          socket.write(json);
          state.lastActivity = this.timer.now();
          sentCount++;
          // Only send once per socket even if multiple subscriptions match
          break;
        } catch (error) {
          logger.warn(`[UnifiedSocket] Failed to push to ${state.socketId}: ${error}`);
          deadSockets.push(socket);
          break;
        }
      }
    }

    // Clean up dead sockets
    for (const socket of deadSockets) {
      const state = this.sockets.get(socket);
      if (state) {
        state.subscriptions.clear();
        this.sockets.delete(socket);
      }
    }

    return sentCount;
  }

  /**
   * Check if a subscription filter matches a target filter.
   * The subscription filter is considered to match if it either:
   * 1. Has no filter properties (subscribes to all)
   * 2. Has matching values for the filter properties it does specify
   */
  private filtersMatch(subscriptionFilter: SubscriptionFilter, targetFilter: SubscriptionFilter): boolean {
    for (const [key, value] of Object.entries(targetFilter)) {
      const subValue = subscriptionFilter[key];
      // If subscription has a value for this key, it must match
      if (subValue !== undefined && subValue !== null && subValue !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Start the keepalive timer.
   */
  private startKeepalive(): void {
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
  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      this.timer.clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  /**
   * Check keepalive for all sockets, removing dead ones.
   */
  private checkKeepalive(): void {
    const now = this.timer.now();
    const deadSockets: Socket[] = [];

    for (const [socket, state] of this.sockets) {
      if (socket.destroyed) {
        logger.info(`[UnifiedSocket] Socket ${state.socketId} destroyed, removing`);
        deadSockets.push(socket);
        continue;
      }

      const timeSinceActivity = now - state.lastActivity;
      if (timeSinceActivity > this.keepaliveConfig.timeoutMs) {
        logger.warn(`[UnifiedSocket] Socket ${state.socketId} timed out, removing`);
        deadSockets.push(socket);
        try {
          socket.destroy();
        } catch {
          // Ignore errors when destroying
        }
        continue;
      }

      // Send ping
      const pingMessage = createPing(now);
      try {
        this.sendJson(socket, pingMessage);
      } catch (error) {
        logger.warn(`[UnifiedSocket] Failed to ping ${state.socketId}: ${error}`);
        deadSockets.push(socket);
      }
    }

    for (const socket of deadSockets) {
      const state = this.sockets.get(socket);
      if (state) {
        state.subscriptions.clear();
        this.sockets.delete(socket);
      }
    }
  }

  /**
   * Expose checkKeepalive for testing.
   */
  triggerKeepalive(): void {
    this.checkKeepalive();
  }

  /**
   * Simulate a subscription for testing.
   * Returns the subscription ID.
   */
  simulateSubscription(
    socket: Socket,
    domain: Domain,
    event: string | null = null,
    filter: SubscriptionFilter = {}
  ): string {
    const state = this.sockets.get(socket);
    if (!state) {
      throw new Error("Socket not registered");
    }

    const subscriptionId = `sub-${++this.subscriptionCounter}`;
    state.subscriptions.set(subscriptionId, {
      subscriptionId,
      domain,
      event,
      filter,
    });

    return subscriptionId;
  }

  /**
   * Simulate a pong from a socket for testing.
   */
  simulatePong(socket: Socket): void {
    const state = this.sockets.get(socket);
    if (state) {
      state.lastActivity = this.timer.now();
    }
  }

  /**
   * Register a socket for testing (bypasses connection flow).
   */
  registerTestSocket(socket: Socket): string {
    const socketId = `unified-${++this.socketCounter}`;
    this.sockets.set(socket, {
      socketId,
      lastActivity: this.timer.now(),
      subscriptions: new Map(),
    });
    return socketId;
  }

  /**
   * Push data directly for testing.
   */
  pushForTest(domain: Domain, event: string, data: unknown, filter?: SubscriptionFilter): number {
    return this.pushToSubscribers(domain, event, data, filter);
  }
}
