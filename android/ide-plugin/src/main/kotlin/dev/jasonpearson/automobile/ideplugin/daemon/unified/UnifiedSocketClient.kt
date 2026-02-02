package dev.jasonpearson.automobile.ideplugin.daemon.unified

import com.intellij.openapi.diagnostic.Logger
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.UnixDomainSocketAddress
import java.nio.channels.Channels
import java.nio.channels.SocketChannel
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.min
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement

/**
 * Interface for the unified socket client.
 */
interface UnifiedSocketClient {
    val connectionState: StateFlow<UnifiedConnectionState>

    suspend fun connect()
    suspend fun disconnect()

    suspend fun <T> request(
        domain: String,
        method: String,
        params: JsonElement? = null,
        timeout: Duration = 30.seconds,
    ): T

    fun subscribe(
        domain: String,
        event: String? = null,
        params: JsonElement? = null,
    ): Flow<UnifiedMessage>

    suspend fun unsubscribe(subscriptionId: String)
}

/**
 * Client for the unified Unix domain socket server.
 * Provides multiplexed access to all domains through a single connection.
 *
 * Features:
 * - Request/response correlation with message IDs
 * - Multiple concurrent subscriptions via SharedFlow per subscription
 * - Reconnection with exponential backoff + jitter (1s initial, 30s max)
 * - Mutex-protected socket writes
 * - Auto-resubscribe on reconnect
 *
 * Socket path: ~/.auto-mobile/api.sock
 * or /tmp/auto-mobile-api.sock (in external mode)
 */
class UnifiedSocketClientImpl : UnifiedSocketClient {
    companion object {
        private fun getSocketPath(): String {
            val isExternalMode = System.getenv("AUTOMOBILE_EMULATOR_EXTERNAL") == "true"
            return if (isExternalMode) {
                "/tmp/auto-mobile-api.sock"
            } else {
                "${System.getProperty("user.home")}/.auto-mobile/api.sock"
            }
        }
    }

    private val log = Logger.getInstance(UnifiedSocketClientImpl::class.java)
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var channel: SocketChannel? = null
    private var reader: BufferedReader? = null
    private var writer: BufferedWriter? = null
    private val writeMutex = Mutex()
    private val connected = AtomicBoolean(false)
    private val shouldReconnect = AtomicBoolean(false)
    private val reconnectAttempt = AtomicInteger(0)
    private var connectionJob: Job? = null
    private var readJob: Job? = null

    // Retry configuration
    private val initialRetryDelayMs = 1000L
    private val maxRetryDelayMs = 30000L

    // Connection state
    private val _connectionState = MutableStateFlow<UnifiedConnectionState>(UnifiedConnectionState.Disconnected)
    override val connectionState: StateFlow<UnifiedConnectionState> = _connectionState.asStateFlow()

    // Pending request correlation
    private val pendingRequests = ConcurrentHashMap<String, CompletableDeferred<UnifiedMessage>>()

    // Active subscriptions for resubscription on reconnect
    private data class ActiveSubscription(
        val domain: String,
        val event: String?,
        val params: JsonElement?,
        val flow: MutableSharedFlow<UnifiedMessage>,
    )
    private val subscriptions = ConcurrentHashMap<String, ActiveSubscription>()

    // Flow for all push messages
    private val _pushMessages = MutableSharedFlow<UnifiedMessage>(
        extraBufferCapacity = 100,
        onBufferOverflow = kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST,
    )

    override suspend fun connect() {
        if (connected.get()) {
            log.info("Already connected to unified socket")
            return
        }

        connectionJob?.cancel()
        shouldReconnect.set(true)
        reconnectAttempt.set(0)

        connectionJob = scope.launch {
            connectWithRetry()
        }
    }

    private suspend fun connectWithRetry() {
        val socketPath = getSocketPath()

        while (shouldReconnect.get()) {
            val attempt = reconnectAttempt.get()

            if (attempt == 0) {
                _connectionState.value = UnifiedConnectionState.Connecting
            }

            log.info("Connecting to unified socket at $socketPath (attempt ${attempt + 1})")

            try {
                val path = Path.of(socketPath)
                if (!Files.exists(path)) {
                    throw SocketNotFoundError("Socket not found at $socketPath")
                }

                val address = UnixDomainSocketAddress.of(socketPath)
                channel = SocketChannel.open(address)
                reader = BufferedReader(
                    InputStreamReader(Channels.newInputStream(channel!!), StandardCharsets.UTF_8)
                )
                writer = BufferedWriter(
                    OutputStreamWriter(Channels.newOutputStream(channel!!), StandardCharsets.UTF_8)
                )

                connected.set(true)
                reconnectAttempt.set(0)
                _connectionState.value = UnifiedConnectionState.Connected
                log.info("Connected to unified socket")

                // Resubscribe to active subscriptions
                resubscribeAll()

                // Start reading messages
                readJob = scope.launch { readMessages() }
                readJob?.join()

                // If we get here, connection was lost
                if (shouldReconnect.get()) {
                    log.info("Connection lost, will attempt to reconnect")
                    reconnectAttempt.incrementAndGet()
                    failAllPendingRequests("Connection lost")
                }

            } catch (e: Exception) {
                cleanupConnection()

                if (!shouldReconnect.get()) {
                    log.info("Reconnection disabled, stopping connection attempts")
                    _connectionState.value = UnifiedConnectionState.Disconnected
                    return
                }

                val currentAttempt = reconnectAttempt.incrementAndGet()
                val delayMs = calculateBackoff(currentAttempt)

                log.warn("Failed to connect to unified socket (attempt $currentAttempt): ${e.message}. Retrying in ${delayMs}ms")
                _connectionState.value = UnifiedConnectionState.Reconnecting(currentAttempt, delayMs)

                delay(delayMs)
            }
        }

        _connectionState.value = UnifiedConnectionState.Disconnected
    }

    private fun calculateBackoff(attempt: Int): Long {
        val exponentialDelay = initialRetryDelayMs * (1L shl min(attempt - 1, 10))
        val cappedDelay = min(exponentialDelay, maxRetryDelayMs)
        val jitter = (cappedDelay * 0.1 * Math.random()).toLong()
        return cappedDelay + jitter
    }

    private class SocketNotFoundError(message: String) : Exception(message)

    override suspend fun disconnect() {
        shouldReconnect.set(false)
        connectionJob?.cancel()
        connectionJob = null
        readJob?.cancel()
        readJob = null

        cleanupConnection()
        subscriptions.clear()
        failAllPendingRequests("Disconnected")

        _connectionState.value = UnifiedConnectionState.Disconnected
    }

    private fun cleanupConnection() {
        connected.set(false)
        try {
            channel?.close()
        } catch (e: Exception) {
            log.warn("Error closing channel: ${e.message}")
        }
        channel = null
        reader = null
        writer = null
    }

    private fun failAllPendingRequests(reason: String) {
        val exception = NotConnectedException()
        for (deferred in pendingRequests.values) {
            deferred.completeExceptionally(exception)
        }
        pendingRequests.clear()
    }

    private suspend fun resubscribeAll() {
        for ((subscriptionId, subscription) in subscriptions) {
            try {
                val newSubId = sendSubscribe(subscription.domain, subscription.event, subscription.params)
                // Update the subscription map with the new ID
                subscriptions.remove(subscriptionId)
                subscriptions[newSubId] = subscription
                log.info("Resubscribed $subscriptionId as $newSubId")
            } catch (e: Exception) {
                log.warn("Failed to resubscribe $subscriptionId: ${e.message}")
            }
        }
    }

    private suspend fun readMessages() {
        val currentReader = reader ?: return

        try {
            while (connected.get()) {
                val line = currentReader.readLine() ?: break
                if (line.isBlank()) continue

                try {
                    handleMessage(line)
                } catch (e: Exception) {
                    log.warn("Failed to parse message: ${e.message}", e)
                }
            }
        } catch (e: Exception) {
            log.warn("Error reading from socket: ${e.message}", e)
        }

        cleanupConnection()
    }

    private suspend fun handleMessage(line: String) {
        val message = json.decodeFromString<UnifiedMessage>(line)

        when (message.type) {
            MessageTypes.RESPONSE -> handleResponse(message)
            MessageTypes.ERROR -> handleError(message)
            MessageTypes.PUSH -> handlePush(message)
            MessageTypes.PING -> sendPong()
            else -> log.warn("Unknown message type: ${message.type}")
        }
    }

    private fun handleResponse(message: UnifiedMessage) {
        val id = message.id ?: return
        val deferred = pendingRequests.remove(id)
        deferred?.complete(message)
    }

    private fun handleError(message: UnifiedMessage) {
        val id = message.id
        if (id != null) {
            val deferred = pendingRequests.remove(id)
            val error = message.error
            deferred?.completeExceptionally(
                RequestErrorException(
                    error?.code ?: "UNKNOWN",
                    error?.message ?: "Unknown error"
                )
            )
        }
    }

    private suspend fun handlePush(message: UnifiedMessage) {
        _pushMessages.emit(message)

        // Route to subscription-specific flows
        for ((subId, subscription) in subscriptions) {
            if (subscription.domain == message.domain) {
                if (subscription.event == null || subscription.event == message.event) {
                    subscription.flow.tryEmit(message)
                }
            }
        }
    }

    private suspend fun sendPong() {
        val pongMessage = UnifiedMessage(
            type = MessageTypes.PONG,
            timestamp = System.currentTimeMillis(),
        )
        sendMessage(pongMessage)
    }

    private suspend fun sendMessage(message: UnifiedMessage): Boolean {
        val currentWriter = writer ?: return false

        return writeMutex.withLock {
            try {
                val jsonString = json.encodeToString(message)
                currentWriter.write(jsonString)
                currentWriter.newLine()
                currentWriter.flush()
                true
            } catch (e: Exception) {
                log.warn("Failed to send message: ${e.message}")
                false
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    override suspend fun <T> request(
        domain: String,
        method: String,
        params: JsonElement?,
        timeout: Duration,
    ): T {
        if (!connected.get()) {
            throw NotConnectedException()
        }

        val id = UUID.randomUUID().toString()
        val deferred = CompletableDeferred<UnifiedMessage>()
        pendingRequests[id] = deferred

        val requestMessage = UnifiedMessage(
            id = id,
            type = MessageTypes.REQUEST,
            domain = domain,
            method = method,
            params = params,
            timestamp = System.currentTimeMillis(),
        )

        if (!sendMessage(requestMessage)) {
            pendingRequests.remove(id)
            throw NotConnectedException()
        }

        val response = withTimeoutOrNull(timeout.inWholeMilliseconds) {
            deferred.await()
        }

        if (response == null) {
            pendingRequests.remove(id)
            throw RequestTimeoutException("Request timed out after $timeout")
        }

        if (response.error != null) {
            throw RequestErrorException(response.error.code, response.error.message)
        }

        return response.result as T
    }

    override fun subscribe(
        domain: String,
        event: String?,
        params: JsonElement?,
    ): Flow<UnifiedMessage> {
        val flow = MutableSharedFlow<UnifiedMessage>(
            replay = 1,
            extraBufferCapacity = 50,
            onBufferOverflow = kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST,
        )

        scope.launch {
            try {
                val subscriptionId = sendSubscribe(domain, event, params)
                subscriptions[subscriptionId] = ActiveSubscription(domain, event, params, flow)
                log.info("Subscribed to $domain${event?.let { "/$it" } ?: ""} with ID $subscriptionId")
            } catch (e: Exception) {
                log.warn("Failed to subscribe: ${e.message}")
            }
        }

        return flow.asSharedFlow()
    }

    private suspend fun sendSubscribe(
        domain: String,
        event: String?,
        params: JsonElement?,
    ): String {
        val id = UUID.randomUUID().toString()
        val deferred = CompletableDeferred<UnifiedMessage>()
        pendingRequests[id] = deferred

        val subscribeMessage = UnifiedMessage(
            id = id,
            type = MessageTypes.SUBSCRIBE,
            domain = domain,
            event = event,
            params = params,
            timestamp = System.currentTimeMillis(),
        )

        if (!sendMessage(subscribeMessage)) {
            pendingRequests.remove(id)
            throw NotConnectedException()
        }

        val response = withTimeoutOrNull(30_000) {
            deferred.await()
        }

        if (response == null) {
            pendingRequests.remove(id)
            throw RequestTimeoutException("Subscribe timed out")
        }

        if (response.error != null) {
            throw RequestErrorException(response.error.code, response.error.message)
        }

        val result = response.result
        return if (result is JsonObject) {
            val subIdElement = result["subscriptionId"]
            if (subIdElement is JsonPrimitive && subIdElement.isString) {
                subIdElement.content
            } else {
                throw RequestErrorException("INVALID_RESPONSE", "Missing subscriptionId in response")
            }
        } else {
            throw RequestErrorException("INVALID_RESPONSE", "Invalid subscription response")
        }
    }

    override suspend fun unsubscribe(subscriptionId: String) {
        val subscription = subscriptions.remove(subscriptionId)

        if (!connected.get()) {
            return
        }

        val id = UUID.randomUUID().toString()
        val params = JsonObject(mapOf("subscriptionId" to JsonPrimitive(subscriptionId)))

        val unsubscribeMessage = UnifiedMessage(
            id = id,
            type = MessageTypes.UNSUBSCRIBE,
            domain = subscription?.domain,
            params = params,
            timestamp = System.currentTimeMillis(),
        )

        sendMessage(unsubscribeMessage)
    }

}
