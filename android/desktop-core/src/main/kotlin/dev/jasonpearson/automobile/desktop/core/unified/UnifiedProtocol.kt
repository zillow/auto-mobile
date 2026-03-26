package dev.jasonpearson.automobile.desktop.core.unified

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Unified socket message types.
 */
object MessageTypes {
    const val REQUEST = "request"
    const val RESPONSE = "response"
    const val SUBSCRIBE = "subscribe"
    const val UNSUBSCRIBE = "unsubscribe"
    const val PUSH = "push"
    const val PING = "ping"
    const val PONG = "pong"
    const val ERROR = "error"
}

/**
 * Unified socket domain names.
 */
object Domains {
    const val FAILURES = "failures"
    const val PERFORMANCE = "performance"
    const val OBSERVATION = "observation"
    const val RECORDING = "recording"
    const val APPEARANCE = "appearance"
    const val DEVICE = "device"
}

/**
 * Error payload for error responses.
 */
@Serializable
data class ErrorPayload(
    val code: String,
    val message: String,
)

/**
 * Unified message format for all socket communication.
 *
 * Different message types use different combinations of fields:
 * - request: id, type, domain, method, params
 * - response: id, type, domain, result | error
 * - subscribe: id, type, domain, event, params
 * - unsubscribe: id, type, domain (subscriptionId in params)
 * - push: type, domain, event, result
 * - ping/pong: type
 * - error: id?, type, domain?, error
 */
@Serializable
data class UnifiedMessage(
    val id: String? = null,
    val type: String,
    val domain: String? = null,
    val method: String? = null,
    val event: String? = null,
    val params: JsonElement? = null,
    val result: JsonElement? = null,
    val error: ErrorPayload? = null,
    val timestamp: Long = System.currentTimeMillis(),
)

/**
 * Subscription result returned when subscribing.
 */
@Serializable
data class SubscriptionResult(
    val subscriptionId: String,
)

/**
 * Connection state for the unified socket client.
 */
sealed class UnifiedConnectionState {
    data object Disconnected : UnifiedConnectionState()
    data object Connecting : UnifiedConnectionState()
    data object Connected : UnifiedConnectionState()
    data class Reconnecting(val attempt: Int, val nextRetryMs: Long) : UnifiedConnectionState()
    data class Error(val message: String) : UnifiedConnectionState()
}

/**
 * Exception thrown when a request times out.
 */
class RequestTimeoutException(message: String) : Exception(message)

/**
 * Exception thrown when a request fails with an error response.
 */
class RequestErrorException(val code: String, message: String) : Exception(message)

/**
 * Exception thrown when the socket is not connected.
 */
class NotConnectedException : Exception("Socket is not connected")
