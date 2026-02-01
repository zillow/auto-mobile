package dev.jasonpearson.automobile.ide.daemon

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
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Client for the failures push Unix socket server.
 * Subscribes to receive real-time failure notifications from the MCP server.
 *
 * Socket path: ~/.auto-mobile/failures-push.sock
 * or /tmp/auto-mobile-failures-push.sock (in external mode)
 */
class FailuresPushSocketClient {
    companion object {
        private fun getSocketPath(): String {
            val isExternalMode = System.getenv("AUTOMOBILE_EMULATOR_EXTERNAL") == "true"
            return if (isExternalMode) {
                "/tmp/auto-mobile-failures-push.sock"
            } else {
                "${System.getProperty("user.home")}/.auto-mobile/failures-push.sock"
            }
        }
    }

    private val log = Logger.getInstance(FailuresPushSocketClient::class.java)
    private val json = Json { ignoreUnknownKeys = true }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var channel: SocketChannel? = null
    private var reader: BufferedReader? = null
    private var writer: BufferedWriter? = null
    private val connected = AtomicBoolean(false)
    private val subscribed = AtomicBoolean(false)

    // Flow for live failure notifications
    private val _failureNotifications = MutableSharedFlow<FailureNotification>(
        replay = 1,
        extraBufferCapacity = 50,
        onBufferOverflow = kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST,
    )
    val failureNotifications: SharedFlow<FailureNotification> = _failureNotifications.asSharedFlow()

    // Flow for connection state
    private val _connectionState = MutableSharedFlow<FailuresPushConnectionState>(replay = 1)
    val connectionState: SharedFlow<FailuresPushConnectionState> = _connectionState.asSharedFlow()

    /**
     * Connect to the failures push socket and subscribe to updates.
     * @param type Optional failure type to filter by (crash, anr, tool_failure, nonfatal). Null = all types.
     * @param severity Optional severity to filter by (low, medium, high, critical). Null = all severities.
     */
    fun connect(type: String? = null, severity: String? = null) {
        if (connected.get()) {
            log.info("Already connected to failures push")
            return
        }

        val socketPath = getSocketPath()
        log.info("Connecting to failures push at $socketPath")

        scope.launch {
            _connectionState.emit(FailuresPushConnectionState.Connecting)
        }

        try {
            val path = Path.of(socketPath)
            if (!Files.exists(path)) {
                log.warn("Failures push socket not found at $socketPath")
                scope.launch {
                    _connectionState.emit(FailuresPushConnectionState.Disconnected("Socket not found"))
                }
                return
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
            log.info("Connected to failures push")

            // Send subscribe request
            subscribe(type, severity)

            // Start reading messages
            scope.launch {
                readMessages()
            }

        } catch (e: Exception) {
            log.warn("Failed to connect to failures push: ${e.message}")
            scope.launch {
                _connectionState.emit(FailuresPushConnectionState.Disconnected(e.message))
            }
        }
    }

    fun disconnect() {
        if (!connected.get()) return

        try {
            if (subscribed.get()) {
                val request = FailuresPushRequest(
                    id = UUID.randomUUID().toString(),
                    command = "unsubscribe",
                )
                sendRequest(request)
            }

            channel?.close()
        } catch (e: Exception) {
            log.warn("Error disconnecting from failures push: ${e.message}")
        }

        channel = null
        reader = null
        writer = null
        connected.set(false)
        subscribed.set(false)

        scope.launch {
            _connectionState.emit(FailuresPushConnectionState.Disconnected(null))
        }
    }

    fun isConnected(): Boolean = connected.get()

    private fun subscribe(type: String?, severity: String?) {
        val request = FailuresPushRequest(
            id = UUID.randomUUID().toString(),
            command = "subscribe",
            type = type,
            severity = severity,
        )

        if (sendRequest(request)) {
            subscribed.set(true)
            log.info("Subscribed to failures push (type: ${type ?: "all"}, severity: ${severity ?: "all"})")
        }
    }

    private fun sendRequest(request: FailuresPushRequest): Boolean {
        val currentWriter = writer ?: return false

        return try {
            val message = json.encodeToString(FailuresPushRequest.serializer(), request)
            currentWriter.write(message)
            currentWriter.newLine()
            currentWriter.flush()
            true
        } catch (e: Exception) {
            log.warn("Failed to send request: ${e.message}")
            false
        }
    }

    private suspend fun readMessages() {
        val currentReader = reader ?: return

        try {
            _connectionState.emit(FailuresPushConnectionState.Connected)
            log.info("Starting failures push message read loop")

            while (connected.get()) {
                val line = currentReader.readLine() ?: break
                if (line.isBlank()) continue

                try {
                    handleMessage(line)
                } catch (e: Exception) {
                    log.warn("Failed to parse failures push message: ${e.message}", e)
                }
            }
        } catch (e: Exception) {
            log.warn("Error reading from failures push: ${e.message}", e)
        }

        connected.set(false)
        subscribed.set(false)
        _connectionState.emit(FailuresPushConnectionState.Disconnected("Stream ended"))
        log.info("Failures push disconnected")
    }

    private suspend fun handleMessage(message: String) {
        val response = json.decodeFromString(FailuresPushResponse.serializer(), message)

        when (response.type) {
            "subscription_response" -> {
                log.info("Failures push subscription response: success=${response.success}")
                if (response.success != true) {
                    log.warn("Subscription failed: ${response.error}")
                }
            }
            "failure_push" -> {
                val data = response.data
                if (data != null) {
                    log.info("Failure push received - type=${data.type}, title=${data.title}")
                    _failureNotifications.tryEmit(data)
                }
            }
            "ping" -> {
                log.debug("Received ping, sending pong")
                sendPong()
            }
            "error" -> {
                log.warn("Failures push error: ${response.error}")
            }
            else -> {
                log.warn("Unknown message type: ${response.type}")
            }
        }
    }

    private fun sendPong() {
        val request = FailuresPushRequest(
            id = UUID.randomUUID().toString(),
            command = "pong",
        )
        sendRequest(request)
    }
}

@Serializable
data class FailuresPushRequest(
    val id: String,
    val command: String,
    val type: String? = null,
    val severity: String? = null,
)

@Serializable
data class FailuresPushResponse(
    val id: String? = null,
    val type: String,
    val success: Boolean? = null,
    val error: String? = null,
    val timestamp: Long? = null,
    val data: FailureNotification? = null,
)

@Serializable
data class FailureNotification(
    val occurrenceId: String,
    val groupId: String,
    val type: String,  // "crash" | "anr" | "tool_failure" | "nonfatal"
    val severity: String,  // "low" | "medium" | "high" | "critical"
    val title: String,
    val message: String,
    val timestamp: Long,
)

sealed class FailuresPushConnectionState {
    data object Connecting : FailuresPushConnectionState()
    data object Connected : FailuresPushConnectionState()
    data class Disconnected(val reason: String?) : FailuresPushConnectionState()
}
