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
 * Client for the performance push Unix socket server.
 * Subscribes to receive real-time performance metrics from the MCP server.
 *
 * Socket path: ~/.auto-mobile/performance-push.sock
 * or /tmp/auto-mobile-performance-push.sock (in external mode)
 */
class PerformancePushSocketClient {
    companion object {
        private fun getSocketPath(): String {
            val isExternalMode = System.getenv("AUTOMOBILE_EMULATOR_EXTERNAL") == "true"
            return if (isExternalMode) {
                "/tmp/auto-mobile-performance-push.sock"
            } else {
                "${System.getProperty("user.home")}/.auto-mobile/performance-push.sock"
            }
        }
    }

    private val log = Logger.getInstance(PerformancePushSocketClient::class.java)
    private val json = Json { ignoreUnknownKeys = true }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var channel: SocketChannel? = null
    private var reader: BufferedReader? = null
    private var writer: BufferedWriter? = null
    private val connected = AtomicBoolean(false)
    private val subscribed = AtomicBoolean(false)

    // Flow for live performance data
    private val _performanceData = MutableSharedFlow<LivePerformanceData>(
        replay = 1,
        extraBufferCapacity = 10,
        onBufferOverflow = kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST,
    )
    val performanceData: SharedFlow<LivePerformanceData> = _performanceData.asSharedFlow()

    // Flow for connection state
    private val _connectionState = MutableSharedFlow<PushConnectionState>(replay = 1)
    val connectionState: SharedFlow<PushConnectionState> = _connectionState.asSharedFlow()

    /**
     * Connect to the performance push socket and subscribe to updates.
     * @param deviceId Optional device ID to subscribe to. If null, subscribes to all devices.
     * @param packageName Optional package name to subscribe to. If null, subscribes to all packages.
     */
    fun connect(deviceId: String? = null, packageName: String? = null) {
        if (connected.get()) {
            log.info("Already connected to performance push")
            return
        }

        val socketPath = getSocketPath()
        log.info("Connecting to performance push at $socketPath")

        scope.launch {
            _connectionState.emit(PushConnectionState.Connecting)
        }

        try {
            val path = Path.of(socketPath)
            if (!Files.exists(path)) {
                log.warn("Performance push socket not found at $socketPath")
                scope.launch {
                    _connectionState.emit(PushConnectionState.Disconnected("Socket not found"))
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
            log.info("Connected to performance push")

            // Send subscribe request
            subscribe(deviceId, packageName)

            // Start reading messages
            scope.launch {
                readMessages()
            }

        } catch (e: Exception) {
            log.warn("Failed to connect to performance push: ${e.message}")
            scope.launch {
                _connectionState.emit(PushConnectionState.Disconnected(e.message))
            }
        }
    }

    fun disconnect() {
        if (!connected.get()) return

        try {
            if (subscribed.get()) {
                val request = PushRequest(
                    id = UUID.randomUUID().toString(),
                    command = "unsubscribe",
                )
                sendRequest(request)
            }

            channel?.close()
        } catch (e: Exception) {
            log.warn("Error disconnecting from performance push: ${e.message}")
        }

        channel = null
        reader = null
        writer = null
        connected.set(false)
        subscribed.set(false)

        scope.launch {
            _connectionState.emit(PushConnectionState.Disconnected(null))
        }
    }

    fun isConnected(): Boolean = connected.get()

    private fun subscribe(deviceId: String?, packageName: String?) {
        val request = PushRequest(
            id = UUID.randomUUID().toString(),
            command = "subscribe",
            deviceId = deviceId,
            packageName = packageName,
        )

        if (sendRequest(request)) {
            subscribed.set(true)
            log.info("Subscribed to performance push (device: ${deviceId ?: "all"}, package: ${packageName ?: "all"})")
        }
    }

    private fun sendRequest(request: PushRequest): Boolean {
        val currentWriter = writer ?: return false

        return try {
            val message = json.encodeToString(PushRequest.serializer(), request)
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
            _connectionState.emit(PushConnectionState.Connected)
            log.info("Starting performance push message read loop")

            while (connected.get()) {
                val line = currentReader.readLine() ?: break
                if (line.isBlank()) continue

                try {
                    handleMessage(line)
                } catch (e: Exception) {
                    log.warn("Failed to parse performance push message: ${e.message}", e)
                }
            }
        } catch (e: Exception) {
            log.warn("Error reading from performance push: ${e.message}", e)
        }

        connected.set(false)
        subscribed.set(false)
        _connectionState.emit(PushConnectionState.Disconnected("Stream ended"))
        log.info("Performance push disconnected")
    }

    private suspend fun handleMessage(message: String) {
        val response = json.decodeFromString(PushResponse.serializer(), message)

        when (response.type) {
            "subscription_response" -> {
                log.info("Performance push subscription response: success=${response.success}")
                if (response.success != true) {
                    log.warn("Subscription failed: ${response.error}")
                }
            }
            "performance_push" -> {
                val data = response.data
                if (data != null) {
                    log.debug("Performance push received - device=${data.deviceId}, fps=${data.metrics.fps}")
                    _performanceData.tryEmit(data)
                }
            }
            "ping" -> {
                log.debug("Received ping, sending pong")
                sendPong()
            }
            "error" -> {
                log.warn("Performance push error: ${response.error}")
            }
            else -> {
                log.warn("Unknown message type: ${response.type}")
            }
        }
    }

    private fun sendPong() {
        val request = PushRequest(
            id = UUID.randomUUID().toString(),
            command = "pong",
        )
        sendRequest(request)
    }
}

@Serializable
data class PushRequest(
    val id: String,
    val command: String,
    val deviceId: String? = null,
    val packageName: String? = null,
)

@Serializable
data class PushResponse(
    val id: String? = null,
    val type: String,
    val success: Boolean? = null,
    val error: String? = null,
    val timestamp: Long? = null,
    val data: LivePerformanceData? = null,
)

@Serializable
data class LivePerformanceData(
    val deviceId: String,
    val packageName: String,
    val timestamp: Long,
    val nodeId: Int? = null,
    val screenName: String? = null,
    val metrics: LivePerformanceMetrics,
    val thresholds: PerformanceThresholds,
    val health: String,  // "healthy" | "warning" | "critical"
)

@Serializable
data class LivePerformanceMetrics(
    val fps: Float? = null,
    val frameTimeMs: Float? = null,
    val jankFrames: Int? = null,
    val touchLatencyMs: Float? = null,
    val ttffMs: Float? = null,
    val ttiMs: Float? = null,
    val cpuUsagePercent: Float? = null,
    val memoryUsageMb: Float? = null,
)

@Serializable
data class PerformanceThresholds(
    val fpsWarning: Float,
    val fpsCritical: Float,
    val frameTimeWarning: Float,
    val frameTimeCritical: Float,
    val jankWarning: Int,
    val jankCritical: Int,
    val touchLatencyWarning: Float,
    val touchLatencyCritical: Float,
    val ttffWarning: Float,
    val ttffCritical: Float,
    val ttiWarning: Float,
    val ttiCritical: Float,
)

sealed class PushConnectionState {
    data object Connecting : PushConnectionState()
    data object Connected : PushConnectionState()
    data class Disconnected(val reason: String?) : PushConnectionState()
}
