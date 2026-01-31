package dev.jasonpearson.automobile.protocol

/**
 * Interface for handling WebSocket messages from the MCP server.
 *
 * Implementations receive typed request objects and return optional response objects.
 * When a response is returned, the server broadcasts it to connected clients.
 * When null is returned, no response is broadcast (useful for async operations
 * that broadcast their own responses later).
 */
interface WebSocketMessageHandler {
  /**
   * Handle an incoming WebSocket request.
   *
   * @param request The typed request object
   * @return A response to broadcast, or null if the handler will broadcast its own response
   */
  suspend fun handleMessage(request: WebSocketRequest): WebSocketResponse?
}
