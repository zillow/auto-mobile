package dev.jasonpearson.automobile.ide.daemon

import com.intellij.openapi.diagnostic.Logger
import dev.jasonpearson.automobile.ide.telemetry.TelemetryDisplayEvent
import dev.jasonpearson.automobile.ide.telemetry.TelemetryEventEnvelope
import dev.jasonpearson.automobile.ide.telemetry.TelemetryPushRequest
import dev.jasonpearson.automobile.ide.telemetry.TelemetryPushResponse
import dev.jasonpearson.automobile.ide.telemetry.parseTelemetryEvent
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
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.min
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

/**
 * Client for the telemetry push Unix socket server.
 * Subscribes to receive real-time telemetry events (network, log, custom, OS)
 * from the MCP server.
 *
 * Socket path: ~/.auto-mobile/telemetry-push.sock
 * or /tmp/auto-mobile-telemetry-push.sock (in external mode)
 */
class TelemetryPushSocketClient : TelemetryPushClient {
    companion object {
        private fun getSocketPath(): String {
            val isExternalMode = System.getenv("AUTOMOBILE_EMULATOR_EXTERNAL") == "true"
            return if (isExternalMode) {
                "/tmp/auto-mobile-telemetry-push.sock"
            } else {
                "${System.getProperty("user.home")}/.auto-mobile/telemetry-push.sock"
            }
        }

        fun socketExists(): Boolean = Files.exists(Path.of(getSocketPath()))
    }

    private val log = Logger.getInstance(TelemetryPushSocketClient::class.java)
    private val json = Json { ignoreUnknownKeys = true }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var channel: SocketChannel? = null
    private var reader: BufferedReader? = null
    private var writer: BufferedWriter? = null
    private val connected = AtomicBoolean(false)
    private val subscribed = AtomicBoolean(false)
    private val shouldReconnect = AtomicBoolean(false)
    private val reconnectAttempt = AtomicInteger(0)
    private var connectionJob: Job? = null

    // Retry configuration
    private val initialRetryDelayMs = 1000L
    private val maxRetryDelayMs = 30000L

    // Flow for live telemetry events
    private val _telemetryEvents = MutableSharedFlow<TelemetryDisplayEvent>(
        replay = 0,
        extraBufferCapacity = 200,
        onBufferOverflow = kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST,
    )
    override val telemetryEvents: SharedFlow<TelemetryDisplayEvent> = _telemetryEvents.asSharedFlow()

    // Flow for connection state
    private val _connectionState = MutableSharedFlow<TelemetryConnectionState>(replay = 1)
    override val connectionState: SharedFlow<TelemetryConnectionState> = _connectionState.asSharedFlow()

    /**
     * Connect to the telemetry push socket and subscribe to all events.
     * Will retry with exponential backoff if the socket is not available.
     */
    override fun connect() {
        if (connected.get()) {
            log.info("Already connected to telemetry push")
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
                _connectionState.emit(TelemetryConnectionState.Connecting)
            }

            log.info("Connecting to telemetry push at $socketPath (attempt ${attempt + 1})")

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
                log.info("Connected to telemetry push")

                // Subscribe to all events (filter client-side)
                subscribe()

                // Read messages (blocks until disconnected)
                readMessages()

                // If we get here, connection was lost
                if (shouldReconnect.get()) {
                    log.info("Telemetry push connection lost, will attempt to reconnect")
                    reconnectAttempt.incrementAndGet()
                }

            } catch (e: Exception) {
                connected.set(false)
                channel?.close()
                channel = null
                reader = null
                writer = null

                if (!shouldReconnect.get()) {
                    log.info("Telemetry push reconnection disabled, stopping")
                    _connectionState.emit(TelemetryConnectionState.Disconnected("Disconnected"))
                    return
                }

                val currentAttempt = reconnectAttempt.incrementAndGet()
                val delayMs = calculateBackoff(currentAttempt)

                log.warn("Failed to connect to telemetry push (attempt $currentAttempt): ${e.message}. Retrying in ${delayMs}ms")
                _connectionState.emit(TelemetryConnectionState.Reconnecting(currentAttempt, delayMs))

                delay(delayMs)
            }
        }

        _connectionState.emit(TelemetryConnectionState.Disconnected("Stopped"))
    }

    private fun calculateBackoff(attempt: Int): Long {
        val exponentialDelay = initialRetryDelayMs * (1L shl min(attempt - 1, 10))
        val cappedDelay = min(exponentialDelay, maxRetryDelayMs)
        val jitter = (cappedDelay * 0.1 * Math.random()).toLong()
        return cappedDelay + jitter
    }

    private class SocketNotFoundError(message: String) : Exception(message)

    override fun disconnect() {
        shouldReconnect.set(false)
        connectionJob?.cancel()
        connectionJob = null

        if (!connected.get()) {
            scope.launch {
                _connectionState.emit(TelemetryConnectionState.Disconnected(null))
            }
            return
        }

        try {
            if (subscribed.get()) {
                val request = TelemetryPushRequest(
                    id = UUID.randomUUID().toString(),
                    command = "unsubscribe",
                )
                sendRequest(request)
            }

            channel?.close()
        } catch (e: Exception) {
            log.warn("Error disconnecting from telemetry push: ${e.message}")
        }

        channel = null
        reader = null
        writer = null
        connected.set(false)
        subscribed.set(false)
        reconnectAttempt.set(0)

        scope.launch {
            _connectionState.emit(TelemetryConnectionState.Disconnected(null))
        }
    }

    override fun isConnected(): Boolean = connected.get()

    /**
     * Disconnect and cancel the internal coroutine scope.
     * After calling dispose(), this client instance should not be reused.
     */
    override fun dispose() {
        disconnect()
        scope.coroutineContext[Job]?.cancel()
    }

    private fun subscribe() {
        val request = TelemetryPushRequest(
            id = UUID.randomUUID().toString(),
            command = "subscribe",
            category = null, // subscribe to all, filter client-side
        )

        if (sendRequest(request)) {
            subscribed.set(true)
            log.info("Subscribed to telemetry push (all categories)")
        }
    }

    private fun sendRequest(request: TelemetryPushRequest): Boolean {
        val currentWriter = writer ?: return false

        return try {
            val message = json.encodeToString(TelemetryPushRequest.serializer(), request)
            currentWriter.write(message)
            currentWriter.newLine()
            currentWriter.flush()
            true
        } catch (e: Exception) {
            log.warn("Failed to send telemetry push request: ${e.message}")
            false
        }
    }

    private suspend fun readMessages() {
        val currentReader = reader ?: return

        try {
            _connectionState.emit(TelemetryConnectionState.Connected)
            log.info("Starting telemetry push message read loop")

            while (connected.get()) {
                val line = currentReader.readLine() ?: break
                if (line.isBlank()) continue

                try {
                    handleMessage(line)
                } catch (e: Exception) {
                    log.warn("Failed to parse telemetry push message: ${e.message}", e)
                }
            }
        } catch (e: Exception) {
            log.warn("Error reading from telemetry push: ${e.message}", e)
        }

        connected.set(false)
        subscribed.set(false)
        channel?.close()
        channel = null
        reader = null
        writer = null
        log.info("Telemetry push read loop ended")
    }

    private suspend fun handleMessage(message: String) {
        val response = json.decodeFromString(TelemetryPushResponse.serializer(), message)

        when (response.type) {
            "subscription_response" -> {
                log.info("Telemetry push subscription response: success=${response.success}")
                if (response.success != true) {
                    log.warn("Telemetry subscription failed: ${response.error}")
                }
            }
            "telemetry_push" -> {
                val envelope = response.data
                if (envelope != null) {
                    val event = parseTelemetryEvent(envelope)
                    if (event != null) {
                        _telemetryEvents.tryEmit(event)
                    }
                }
            }
            "ping" -> {
                log.debug("Received telemetry ping, sending pong")
                sendPong()
            }
            "error" -> {
                log.warn("Telemetry push error: ${response.error}")
            }
            else -> {
                log.warn("Unknown telemetry push message type: ${response.type}")
            }
        }
    }

    private fun sendPong() {
        val request = TelemetryPushRequest(
            id = UUID.randomUUID().toString(),
            command = "pong",
        )
        sendRequest(request)
    }
}

sealed class TelemetryConnectionState {
    data object Connecting : TelemetryConnectionState()
    data object Connected : TelemetryConnectionState()
    data class Reconnecting(val attempt: Int, val nextRetryMs: Long) : TelemetryConnectionState()
    data class Disconnected(val reason: String?) : TelemetryConnectionState()
}
