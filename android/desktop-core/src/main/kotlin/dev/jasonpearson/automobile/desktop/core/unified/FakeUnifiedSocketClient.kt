package dev.jasonpearson.automobile.desktop.core.unified

import java.util.concurrent.ConcurrentHashMap
import kotlin.time.Duration
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.JsonElement

/**
 * Fake implementation of UnifiedSocketClient for testing.
 *
 * Features:
 * - Configurable responses via setResponse()
 * - Push event emission via emitPush()
 * - Call tracking for verification
 */
class FakeUnifiedSocketClient : UnifiedSocketClient {
    private val _connectionState = MutableStateFlow<UnifiedConnectionState>(UnifiedConnectionState.Disconnected)
    override val connectionState: StateFlow<UnifiedConnectionState> = _connectionState.asStateFlow()

    private val responses = ConcurrentHashMap<String, JsonElement>()
    private val errors = ConcurrentHashMap<String, ErrorPayload>()
    private val requestCalls = mutableListOf<RequestCall>()
    private val subscribeCalls = mutableListOf<SubscribeCall>()

    private val pushFlows = ConcurrentHashMap<String, MutableSharedFlow<UnifiedMessage>>()
    private val _allPushes = MutableSharedFlow<UnifiedMessage>(
        extraBufferCapacity = 100,
        onBufferOverflow = kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST,
    )

    data class RequestCall(
        val domain: String,
        val method: String,
        val params: JsonElement?,
    )

    data class SubscribeCall(
        val domain: String,
        val event: String?,
        val params: JsonElement?,
    )

    /**
     * Set a response for a specific domain/method combination.
     */
    fun setResponse(domain: String, method: String, result: JsonElement) {
        responses["$domain:$method"] = result
    }

    /**
     * Set an error response for a specific domain/method combination.
     */
    fun setError(domain: String, method: String, error: ErrorPayload) {
        errors["$domain:$method"] = error
    }

    /**
     * Emit a push event to subscribers.
     */
    suspend fun emitPush(domain: String, event: String, result: JsonElement) {
        val message = UnifiedMessage(
            type = MessageTypes.PUSH,
            domain = domain,
            event = event,
            result = result,
            timestamp = System.currentTimeMillis(),
        )
        _allPushes.emit(message)

        for ((key, flow) in pushFlows) {
            if (key.startsWith("$domain:")) {
                val eventPart = key.substringAfter(":")
                if (eventPart.isEmpty() || eventPart == event) {
                    flow.tryEmit(message)
                }
            }
        }
    }

    /**
     * Get all request calls made.
     */
    fun getRequestCalls(): List<RequestCall> = requestCalls.toList()

    /**
     * Get all subscribe calls made.
     */
    fun getSubscribeCalls(): List<SubscribeCall> = subscribeCalls.toList()

    /**
     * Clear all recorded calls.
     */
    fun clearCalls() {
        requestCalls.clear()
        subscribeCalls.clear()
    }

    /**
     * Set the connection state.
     */
    fun setConnectionState(state: UnifiedConnectionState) {
        _connectionState.value = state
    }

    override suspend fun connect() {
        _connectionState.value = UnifiedConnectionState.Connected
    }

    override suspend fun disconnect() {
        _connectionState.value = UnifiedConnectionState.Disconnected
    }

    @Suppress("UNCHECKED_CAST")
    override suspend fun <T> request(
        domain: String,
        method: String,
        params: JsonElement?,
        timeout: Duration,
    ): T {
        requestCalls.add(RequestCall(domain, method, params))

        val key = "$domain:$method"
        val error = errors[key]
        if (error != null) {
            throw RequestErrorException(error.code, error.message)
        }

        val response = responses[key]
            ?: throw RequestErrorException("NOT_FOUND", "No response configured for $key")

        return response as T
    }

    override fun subscribe(
        domain: String,
        event: String?,
        params: JsonElement?,
    ): Flow<UnifiedMessage> {
        subscribeCalls.add(SubscribeCall(domain, event, params))

        val key = "$domain:${event ?: ""}"
        val flow = pushFlows.getOrPut(key) {
            MutableSharedFlow(
                replay = 1,
                extraBufferCapacity = 50,
                onBufferOverflow = kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST,
            )
        }

        return flow.asSharedFlow()
    }

    override suspend fun unsubscribe(subscriptionId: String) {
        // No-op for fake
    }
}
