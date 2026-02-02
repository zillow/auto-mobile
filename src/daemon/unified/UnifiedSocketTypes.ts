/**
 * Unified Socket API type definitions.
 *
 * This module defines the message protocol for the unified socket server,
 * which consolidates multiple domain-specific sockets into a single multiplexed endpoint.
 */

/**
 * Supported domains in the unified socket API.
 */
export type Domain =
  | "failures"
  | "performance"
  | "observation"
  | "recording"
  | "appearance"
  | "device";

/**
 * Message types in the unified socket protocol.
 */
export type MessageType =
  | "request"
  | "response"
  | "subscribe"
  | "unsubscribe"
  | "push"
  | "ping"
  | "pong"
  | "error";

/**
 * Error payload for error responses.
 */
export interface ErrorPayload {
  code: string;
  message: string;
}

/**
 * Unified message format for all socket communication.
 *
 * This is the wire format used for all messages in the unified socket protocol.
 * Different message types use different combinations of fields:
 *
 * - request: id, type, domain, method, params
 * - response: id, type, domain, result | error
 * - subscribe: id, type, domain, event, params
 * - unsubscribe: id, type, domain (subscriptionId in params)
 * - push: type, domain, event, result
 * - ping/pong: type
 * - error: id?, type, domain?, error
 */
export interface UnifiedMessage {
  /** Message correlation ID. Required for request/response, subscribe/unsubscribe. */
  id?: string;
  /** Message type. */
  type: MessageType;
  /** Target domain for the message. */
  domain?: Domain;
  /** Method name for request messages. */
  method?: string;
  /** Event name for subscribe/push messages. */
  event?: string;
  /** Parameters for requests or subscription filters. */
  params?: Record<string, unknown>;
  /** Result payload for responses and push messages. */
  result?: unknown;
  /** Error payload for error responses. */
  error?: ErrorPayload;
  /** Message timestamp (epoch ms). */
  timestamp: number;
}

/**
 * Typed request message.
 */
export interface UnifiedRequest extends UnifiedMessage {
  id: string;
  type: "request";
  domain: Domain;
  method: string;
}

/**
 * Typed response message.
 */
export interface UnifiedResponse extends UnifiedMessage {
  id: string;
  type: "response";
  domain: Domain;
}

/**
 * Typed subscribe message.
 */
export interface UnifiedSubscribe extends UnifiedMessage {
  id: string;
  type: "subscribe";
  domain: Domain;
  event?: string;
}

/**
 * Typed unsubscribe message.
 */
export interface UnifiedUnsubscribe extends UnifiedMessage {
  id: string;
  type: "unsubscribe";
  domain: Domain;
}

/**
 * Typed push message.
 */
export interface UnifiedPush extends UnifiedMessage {
  type: "push";
  domain: Domain;
  event: string;
}

/**
 * Result of a request handler.
 */
export interface RequestResult {
  result?: unknown;
  error?: ErrorPayload;
}

/**
 * Generic subscription filter type.
 * Each domain defines its own filter structure.
 */
export type SubscriptionFilter = Record<string, unknown>;

/**
 * Push event data from a domain handler.
 */
export interface PushEvent {
  event: string;
  data: unknown;
}

/**
 * Callback for pushing events to subscribers.
 */
export type PushCallback = (event: string, data: unknown, filter?: SubscriptionFilter) => void;

/**
 * Error codes for unified socket errors.
 */
export const ErrorCodes = {
  INVALID_JSON: "INVALID_JSON",
  INVALID_MESSAGE: "INVALID_MESSAGE",
  UNKNOWN_DOMAIN: "UNKNOWN_DOMAIN",
  UNKNOWN_METHOD: "UNKNOWN_METHOD",
  UNKNOWN_EVENT: "UNKNOWN_EVENT",
  SUBSCRIPTION_NOT_FOUND: "SUBSCRIPTION_NOT_FOUND",
  HANDLER_ERROR: "HANDLER_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Create an error payload.
 */
export function createError(code: ErrorCode, message: string): ErrorPayload {
  return { code, message };
}

/**
 * Create a response message.
 */
export function createResponse(
  id: string,
  domain: Domain,
  result: unknown,
  timestamp: number
): UnifiedResponse {
  return {
    id,
    type: "response",
    domain,
    result,
    timestamp,
  };
}

/**
 * Create an error response message.
 */
export function createErrorResponse(
  id: string | undefined,
  domain: Domain | undefined,
  error: ErrorPayload,
  timestamp: number
): UnifiedMessage {
  return {
    id,
    type: "error",
    domain,
    error,
    timestamp,
  };
}

/**
 * Create a push message.
 */
export function createPush(
  domain: Domain,
  event: string,
  data: unknown,
  timestamp: number
): UnifiedPush {
  return {
    type: "push",
    domain,
    event,
    result: data,
    timestamp,
  };
}

/**
 * Create a ping message.
 */
export function createPing(timestamp: number): UnifiedMessage {
  return {
    type: "ping",
    timestamp,
  };
}

/**
 * Create a pong message.
 */
export function createPong(timestamp: number): UnifiedMessage {
  return {
    type: "pong",
    timestamp,
  };
}

/**
 * Type guard for request messages.
 */
export function isRequest(message: UnifiedMessage): message is UnifiedRequest {
  return message.type === "request" && !!message.id && !!message.domain && !!message.method;
}

/**
 * Type guard for subscribe messages.
 */
export function isSubscribe(message: UnifiedMessage): message is UnifiedSubscribe {
  return message.type === "subscribe" && !!message.id && !!message.domain;
}

/**
 * Type guard for unsubscribe messages.
 */
export function isUnsubscribe(message: UnifiedMessage): message is UnifiedUnsubscribe {
  return message.type === "unsubscribe" && !!message.id && !!message.domain;
}

/**
 * Type guard for pong messages.
 */
export function isPong(message: UnifiedMessage): boolean {
  return message.type === "pong";
}
