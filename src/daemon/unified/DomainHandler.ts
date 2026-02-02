import type {
  Domain,
  RequestResult,
  SubscriptionFilter,
  PushEvent,
  PushCallback,
} from "./UnifiedSocketTypes";

/**
 * Interface for domain-specific message handlers.
 *
 * Each domain (failures, performance, observation, etc.) implements this interface
 * to handle requests and manage subscriptions within the unified socket server.
 *
 * Domain handlers are responsible for:
 * 1. Processing request/response interactions (handleRequest)
 * 2. Parsing subscription filters from client messages (parseSubscriptionFilter)
 * 3. Determining which events match which subscription filters (matchesFilter)
 * 4. Registering with data sources and emitting push events (initialize/dispose)
 */
export interface DomainHandler {
  /**
   * The domain this handler manages.
   */
  readonly domain: Domain;

  /**
   * Handle a request and return a result.
   *
   * @param method - The method name (e.g., "poll_notifications", "poll_groups")
   * @param params - Request parameters
   * @returns The request result (success with result, or error)
   */
  handleRequest(
    method: string,
    params: Record<string, unknown> | undefined
  ): Promise<RequestResult>;

  /**
   * Parse subscription filter from subscription parameters.
   *
   * @param params - Subscription parameters from the client
   * @returns A filter object used for matching push events
   */
  parseSubscriptionFilter(params: Record<string, unknown> | undefined): SubscriptionFilter;

  /**
   * Check if a push event matches a subscription filter.
   *
   * @param filter - The subscription filter
   * @param event - The push event to check
   * @returns True if the event should be sent to this subscriber
   */
  matchesFilter(filter: SubscriptionFilter, event: PushEvent): boolean;

  /**
   * Initialize the handler with a push callback.
   *
   * Called when the unified socket server starts. The handler should:
   * 1. Store the pushCallback for later use
   * 2. Register event listeners with data sources (repositories, managers)
   * 3. Start any background processes needed for push events
   *
   * @param pushCallback - Callback to invoke when pushing events to subscribers
   */
  initialize(pushCallback: PushCallback): void;

  /**
   * Clean up resources when the handler is disposed.
   *
   * Called when the unified socket server stops. The handler should:
   * 1. Unregister event listeners
   * 2. Stop background processes
   * 3. Clear any cached state
   */
  dispose(): void;
}

/**
 * Abstract base class for domain handlers with common functionality.
 */
export abstract class BaseDomainHandler implements DomainHandler {
  abstract readonly domain: Domain;
  protected pushCallback: PushCallback | null = null;

  abstract handleRequest(
    method: string,
    params: Record<string, unknown> | undefined
  ): Promise<RequestResult>;

  /**
   * Default implementation: no filtering (accept all events).
   * Override in subclasses to implement domain-specific filtering.
   */
  parseSubscriptionFilter(_params: Record<string, unknown> | undefined): SubscriptionFilter {
    return {};
  }

  /**
   * Default implementation: match all events.
   * Override in subclasses to implement domain-specific filtering.
   */
  matchesFilter(_filter: SubscriptionFilter, _event: PushEvent): boolean {
    return true;
  }

  /**
   * Store the push callback for later use.
   * Override in subclasses to set up event listeners.
   */
  initialize(pushCallback: PushCallback): void {
    this.pushCallback = pushCallback;
  }

  /**
   * Clear the push callback.
   * Override in subclasses to clean up event listeners.
   */
  dispose(): void {
    this.pushCallback = null;
  }

  /**
   * Helper to emit a push event to subscribers.
   */
  protected push(event: string, data: unknown, filter?: SubscriptionFilter): void {
    this.pushCallback?.(event, data, filter);
  }
}
