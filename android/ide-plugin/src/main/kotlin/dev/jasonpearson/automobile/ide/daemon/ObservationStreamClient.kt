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
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Client for the observation stream Unix socket server.
 * Subscribes to receive real-time hierarchy and screenshot updates from the MCP server.
 *
 * Socket path: ~/.auto-mobile/observation-stream.sock
 * or /tmp/auto-mobile-observation-stream.sock (in external mode)
 */
class ObservationStreamClient {
    companion object {
        internal fun getSocketPath(): String {
            // Check for external mode (matches the server's logic)
            val isExternalMode = System.getenv("AUTOMOBILE_EMULATOR_EXTERNAL") == "true"
            return if (isExternalMode) {
                "/tmp/auto-mobile-observation-stream.sock"
            } else {
                "${System.getProperty("user.home")}/.auto-mobile/observation-stream.sock"
            }
        }

        fun socketExists(): Boolean = Files.exists(Path.of(getSocketPath()))
    }

    private val log = Logger.getInstance(ObservationStreamClient::class.java)
    private val json = Json { ignoreUnknownKeys = true }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var channel: SocketChannel? = null
    private var reader: BufferedReader? = null
    private var writer: BufferedWriter? = null
    private val connected = AtomicBoolean(false)
    private val subscribed = AtomicBoolean(false)

    // Flow for hierarchy updates
    private val _hierarchyUpdates = MutableSharedFlow<HierarchyStreamUpdate>(replay = 1)
    val hierarchyUpdates: SharedFlow<HierarchyStreamUpdate> = _hierarchyUpdates.asSharedFlow()

    // Flow for screenshot updates
    private val _screenshotUpdates = MutableSharedFlow<ScreenshotStreamUpdate>(replay = 1)
    val screenshotUpdates: SharedFlow<ScreenshotStreamUpdate> = _screenshotUpdates.asSharedFlow()

    // Flow for navigation graph updates
    private val _navigationUpdates = MutableSharedFlow<NavigationGraphStreamUpdate>(replay = 1)
    val navigationUpdates: SharedFlow<NavigationGraphStreamUpdate> = _navigationUpdates.asSharedFlow()

    // Flow for performance metrics updates (use extraBufferCapacity + DROP_OLDEST to avoid blocking)
    private val _performanceUpdates = MutableSharedFlow<PerformanceStreamUpdate>(
        replay = 1,
        extraBufferCapacity = 10,
        onBufferOverflow = kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST,
    )
    val performanceUpdates: SharedFlow<PerformanceStreamUpdate> = _performanceUpdates.asSharedFlow()

    // Flow for connection state
    private val _connectionState = MutableSharedFlow<StreamConnectionState>(replay = 1)
    val connectionState: SharedFlow<StreamConnectionState> = _connectionState.asSharedFlow()

    /**
     * Connect to the observation stream socket and subscribe to updates.
     * @param deviceId Optional device ID to subscribe to. If null, subscribes to all devices.
     */
    fun connect(deviceId: String? = null) {
        if (connected.get()) {
            log.info("Already connected to observation stream")
            return
        }

        val socketPath = getSocketPath()
        log.info("Connecting to observation stream at $socketPath")

        scope.launch {
            _connectionState.emit(StreamConnectionState.Connecting)
        }

        try {
            val path = Path.of(socketPath)
            if (!Files.exists(path)) {
                log.warn("Observation stream socket not found at $socketPath")
                scope.launch {
                    _connectionState.emit(StreamConnectionState.Disconnected("Socket not found"))
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
            log.info("Connected to observation stream")

            // Send subscribe request
            subscribe(deviceId)

            // Start reading messages
            scope.launch {
                readMessages()
            }

        } catch (e: Exception) {
            log.warn("Failed to connect to observation stream: ${e.message}")
            scope.launch {
                _connectionState.emit(StreamConnectionState.Disconnected(e.message))
            }
        }
    }

    fun disconnect() {
        if (!connected.get()) return

        try {
            // Send unsubscribe request
            if (subscribed.get()) {
                val request = StreamRequest(
                    id = UUID.randomUUID().toString(),
                    command = "unsubscribe",
                )
                sendRequest(request)
            }

            channel?.close()
        } catch (e: Exception) {
            log.warn("Error disconnecting from observation stream: ${e.message}")
        }

        channel = null
        reader = null
        writer = null
        connected.set(false)
        subscribed.set(false)

        scope.launch {
            _connectionState.emit(StreamConnectionState.Disconnected(null))
        }
    }

    fun isConnected(): Boolean = connected.get()

    /**
     * Disconnect and cancel the internal coroutine scope.
     * After calling dispose(), this client instance should not be reused.
     */
    fun dispose() {
        disconnect()
        scope.coroutineContext[Job]?.cancel()
    }

    private fun subscribe(deviceId: String?) {
        val request = StreamRequest(
            id = UUID.randomUUID().toString(),
            command = "subscribe",
            deviceId = deviceId,
        )

        if (sendRequest(request)) {
            subscribed.set(true)
            log.info("Subscribed to observation stream (device: ${deviceId ?: "all"})")
        }
    }

    private fun sendRequest(request: StreamRequest): Boolean {
        val currentWriter = writer ?: return false

        return try {
            val message = json.encodeToString(StreamRequest.serializer(), request)
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
            _connectionState.emit(StreamConnectionState.Connected)
            log.info("Starting message read loop")

            while (connected.get()) {
                val line = currentReader.readLine() ?: break
                if (line.isBlank()) continue

                log.info("Received message (${line.length} chars): ${line.take(200)}...")

                try {
                    handleMessage(line)
                } catch (e: Exception) {
                    log.warn("Failed to parse observation stream message: ${e.message}", e)
                }
            }
            log.info("Read loop ended - connected=${connected.get()}")
        } catch (e: Exception) {
            log.warn("Error reading from observation stream: ${e.message}", e)
        }

        connected.set(false)
        subscribed.set(false)
        _connectionState.emit(StreamConnectionState.Disconnected("Stream ended"))
        log.info("Observation stream disconnected")
    }

    private suspend fun handleMessage(message: String) {
        val response = json.decodeFromString(StreamResponse.serializer(), message)
        log.info("Handling message type: ${response.type}")

        when (response.type) {
            "subscription_response" -> {
                log.info("Subscription response: success=${response.success}")
                if (response.success != true) {
                    log.warn("Subscription failed: ${response.error}")
                }
            }
            "hierarchy_update" -> {
                // Extract packageName from the data if present
                val packageName = extractPackageName(response.data)
                log.info("Hierarchy update received - deviceId=${response.deviceId}, timestamp=${response.timestamp}, packageName=$packageName, dataPresent=${response.data != null}")
                val update = HierarchyStreamUpdate(
                    deviceId = response.deviceId,
                    timestamp = response.timestamp ?: System.currentTimeMillis(),
                    data = response.data,
                    packageName = packageName,
                )
                _hierarchyUpdates.emit(update)
                log.info("Emitted hierarchy update to flow")
            }
            "screenshot_update" -> {
                log.info("Screenshot update received - deviceId=${response.deviceId}, hasScreenshot=${response.screenshotBase64 != null}")
                val update = ScreenshotStreamUpdate(
                    deviceId = response.deviceId,
                    timestamp = response.timestamp ?: System.currentTimeMillis(),
                    screenshotBase64 = response.screenshotBase64,
                    screenWidth = response.screenWidth ?: 1080,
                    screenHeight = response.screenHeight ?: 2340,
                )
                _screenshotUpdates.emit(update)
                log.info("Emitted screenshot update to flow")
            }
            "navigation_update" -> {
                val navGraph = response.navigationGraph
                log.info("Navigation update received - appId=${navGraph?.appId}, nodes=${navGraph?.nodes?.size}, edges=${navGraph?.edges?.size}")
                if (navGraph != null) {
                    val update = NavigationGraphStreamUpdate(
                        timestamp = response.timestamp ?: System.currentTimeMillis(),
                        appId = navGraph.appId,
                        nodes = navGraph.nodes,
                        edges = navGraph.edges,
                        currentScreen = navGraph.currentScreen,
                    )
                    _navigationUpdates.emit(update)
                    log.info("Emitted navigation update to flow")
                }
            }
            "performance_update" -> {
                val perfData = response.performanceData
                log.info("Performance update received - deviceId=${response.deviceId}, fps=${perfData?.fps}, jankFrames=${perfData?.jankFrames}, touchLatencyMs=${perfData?.touchLatencyMs}, ttiMs=${perfData?.timeToInteractiveMs}")
                if (perfData != null) {
                    // When jank is 0 and FPS is below 60, the device is idle (no frames
                    // being rendered). The reported FPS gets stuck at a stale value.
                    // Assume 60 FPS / 16.67ms frame time since nothing is janking.
                    val isIdle = perfData.jankFrames == 0 && perfData.fps < 60f
                    val fps = if (isIdle) 60f else perfData.fps
                    val frameTimeMs = if (isIdle) 16.67f else perfData.frameTimeMs
                    val update = PerformanceStreamUpdate(
                        deviceId = response.deviceId,
                        timestamp = response.timestamp ?: System.currentTimeMillis(),
                        fps = fps,
                        frameTimeMs = frameTimeMs,
                        jankFrames = perfData.jankFrames,
                        droppedFrames = perfData.droppedFrames,
                        memoryUsageMb = perfData.memoryUsageMb,
                        cpuUsagePercent = perfData.cpuUsagePercent,
                        touchLatencyMs = perfData.touchLatencyMs,
                        timeToInteractiveMs = perfData.timeToInteractiveMs,
                        screenName = perfData.screenName,
                        isResponsive = perfData.isResponsive,
                    )
                    _performanceUpdates.tryEmit(update)
                    log.info("Emitted performance update to flow")
                }
            }
            "ping" -> {
                log.info("Received ping, sending pong")
                sendPong()
            }
            "error" -> {
                log.warn("Observation stream error: ${response.error}")
            }
            else -> {
                log.warn("Unknown message type: ${response.type}")
            }
        }
    }

    /**
     * Request the current navigation graph from the server.
     * The response arrives through the existing navigation_update flow.
     *
     * @param appId Optional app ID to request the graph for a specific app.
     *              If null, the server returns the graph for the current foreground app.
     */
    fun requestNavigationGraph(appId: String? = null) {
        if (!connected.get()) return

        val request = StreamRequest(
            id = UUID.randomUUID().toString(),
            command = "request_navigation_graph",
            appId = appId,
        )
        sendRequest(request)
    }

    private fun sendPong() {
        val request = StreamRequest(
            id = UUID.randomUUID().toString(),
            command = "pong",
        )
        sendRequest(request)
    }

    /**
     * Extract packageName from the hierarchy data.
     * The data structure is: { "hierarchy": {...}, "packageName": "com.example.app", ... }
     */
    private fun extractPackageName(data: JsonElement?): String? {
        if (data == null) return null
        return try {
            val obj = data as? JsonObject ?: return null
            val packageNameElement = obj["packageName"] as? JsonPrimitive
            packageNameElement?.contentOrNull?.takeIf { it.isNotEmpty() }
        } catch (e: Exception) {
            log.warn("Failed to extract packageName: ${e.message}")
            null
        }
    }
}

@Serializable
data class StreamRequest(
    val id: String,
    val command: String,
    val deviceId: String? = null,
    val appId: String? = null,
)

@Serializable
data class StreamResponse(
    val id: String? = null,
    val type: String,
    val success: Boolean? = null,
    val error: String? = null,
    val deviceId: String? = null,
    val timestamp: Long? = null,
    val data: JsonElement? = null,
    val screenshotBase64: String? = null,
    val screenWidth: Int? = null,
    val screenHeight: Int? = null,
    val navigationGraph: NavigationGraphStreamData? = null,
    val performanceData: PerformanceStreamData? = null,
)

@Serializable
data class NavigationGraphStreamData(
    val appId: String?,
    val nodes: List<NavigationNodeData>,
    val edges: List<NavigationEdgeData>,
    val currentScreen: String?,
)

@Serializable
data class NavigationNodeData(
    val id: Int,
    val screenName: String,
    val visitCount: Int,
    val screenshotPath: String? = null,
)

@Serializable
data class NavigationEdgeData(
    val id: Int,
    val from: String,
    val to: String,
    val toolName: String? = null,
    val traversalCount: Int = 1,
)

data class HierarchyStreamUpdate(
    val deviceId: String?,
    val timestamp: Long,
    val data: JsonElement?,
    val packageName: String? = null,
)

data class ScreenshotStreamUpdate(
    val deviceId: String?,
    val timestamp: Long,
    val screenshotBase64: String?,
    val screenWidth: Int,
    val screenHeight: Int,
)

data class NavigationGraphStreamUpdate(
    val timestamp: Long,
    val appId: String?,
    val nodes: List<NavigationNodeData>,
    val edges: List<NavigationEdgeData>,
    val currentScreen: String?,
)

@Serializable
data class PerformanceStreamData(
    val fps: Float,
    val frameTimeMs: Float,
    val jankFrames: Int,
    val droppedFrames: Int,
    val memoryUsageMb: Float,
    val cpuUsagePercent: Float,
    val touchLatencyMs: Float? = null,
    val timeToInteractiveMs: Float? = null,
    val screenName: String? = null,
    val isResponsive: Boolean = true,
)

data class PerformanceStreamUpdate(
    val deviceId: String?,
    val timestamp: Long,
    val fps: Float,
    val frameTimeMs: Float,
    val jankFrames: Int,
    val droppedFrames: Int,
    val memoryUsageMb: Float,
    val cpuUsagePercent: Float,
    val touchLatencyMs: Float?,
    val timeToInteractiveMs: Float?,
    val screenName: String?,
    val isResponsive: Boolean,
)

sealed class StreamConnectionState {
    data object Connecting : StreamConnectionState()
    data object Connected : StreamConnectionState()
    data class Disconnected(val reason: String?) : StreamConnectionState()
}
