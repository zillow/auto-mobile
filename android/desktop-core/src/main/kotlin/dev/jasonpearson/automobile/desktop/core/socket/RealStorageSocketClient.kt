package dev.jasonpearson.automobile.desktop.core.socket

import dev.jasonpearson.automobile.desktop.core.daemon.McpConnectionException
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.File
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.UnixDomainSocketAddress
import java.nio.channels.Channels
import java.nio.channels.SocketChannel
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive

/**
 * Real implementation of StorageSocketClient using Unix domain sockets.
 * Connects to the MCP server's storage change stream.
 */
class RealStorageSocketClient(
    private val socketPathValue: String = StorageSocketPaths.socketPath(),
    private val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    },
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.IO),
) : StorageSocketClient {

    private val listeners = CopyOnWriteArrayList<StorageChangeListener>()
    private val _isConnected = MutableStateFlow(false)
    override val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private var connectionJob: Job? = null
    private val shouldReconnect = AtomicBoolean(false)

    override fun subscribe(listener: StorageChangeListener) {
        listeners.add(listener)
    }

    override fun unsubscribe(listener: StorageChangeListener) {
        listeners.remove(listener)
    }

    override fun connect() {
        if (connectionJob?.isActive == true) return

        shouldReconnect.set(true)
        connectionJob = scope.launch {
            while (shouldReconnect.get() && isActive) {
                try {
                    connectAndListen()
                } catch (e: Exception) {
                    _isConnected.value = false
                    // Retry after delay if should still reconnect
                    if (shouldReconnect.get()) {
                        delay(RECONNECT_DELAY_MS)
                    }
                }
            }
        }
    }

    override fun disconnect() {
        shouldReconnect.set(false)
        connectionJob?.cancel()
        connectionJob = null
        _isConnected.value = false
    }

    private suspend fun connectAndListen() {
        ensureSocketExists()

        val address = UnixDomainSocketAddress.of(socketPathValue)
        SocketChannel.open(address).use { channel ->
            val reader = BufferedReader(
                InputStreamReader(Channels.newInputStream(channel), StandardCharsets.UTF_8)
            )
            val writer = BufferedWriter(
                OutputStreamWriter(Channels.newOutputStream(channel), StandardCharsets.UTF_8)
            )

            // Send subscribe request
            val subscribeRequest = StorageStreamRequest(command = "subscribe")
            writer.write(json.encodeToString(subscribeRequest))
            writer.newLine()
            writer.flush()

            // Read initial response
            val initialLine = reader.readLine()
                ?: throw McpConnectionException("Storage socket closed during handshake")
            val initialResponse = json.decodeFromString<StorageStreamResponse>(initialLine)
            if (!initialResponse.success) {
                throw McpConnectionException(
                    initialResponse.error ?: "Failed to subscribe to storage changes"
                )
            }

            _isConnected.value = true

            // Listen for events
            while (shouldReconnect.get()) {
                val line = reader.readLine() ?: break
                try {
                    val response = json.decodeFromString<StorageStreamResponse>(line)
                    response.event?.let { event ->
                        val changedEvent = StorageChangedEvent(
                            packageName = event.packageName,
                            fileName = event.fileName,
                            key = event.key,
                            oldValue = null, // Not available in current protocol
                            newValue = parseValue(event.value, event.valueType),
                            valueType = event.valueType,
                            timestamp = event.timestamp,
                            sequenceNumber = event.sequenceNumber,
                        )
                        notifyListeners(changedEvent)
                    }
                } catch (e: Exception) {
                    // Skip malformed messages
                }
            }
        }

        _isConnected.value = false
    }

    private fun ensureSocketExists() {
        val path = File(socketPathValue).toPath()
        if (!Files.exists(path)) {
            throw McpConnectionException("Storage socket not found at $socketPathValue")
        }
    }

    private fun parseValue(jsonValue: String?, type: String): Any? {
        if (jsonValue == null) return null

        return try {
            when (type.uppercase()) {
                "STRING" -> jsonValue
                "INT" -> jsonValue.toIntOrNull() ?: jsonValue
                "LONG" -> jsonValue.toLongOrNull() ?: jsonValue
                "FLOAT" -> jsonValue.toFloatOrNull() ?: jsonValue
                "BOOLEAN" -> jsonValue.toBooleanStrictOrNull() ?: jsonValue
                "STRING_SET" -> {
                    // Parse JSON array of strings to Set<String>
                    val element = json.parseToJsonElement(jsonValue)
                    element.jsonArray.map { it.jsonPrimitive.content }.toSet()
                }
                else -> jsonValue
            }
        } catch (e: Exception) {
            jsonValue
        }
    }

    private fun notifyListeners(event: StorageChangedEvent) {
        listeners.forEach { listener ->
            try {
                listener.onStorageChanged(event)
            } catch (e: Exception) {
                // Don't let one listener failure affect others
            }
        }
    }

    companion object {
        private const val RECONNECT_DELAY_MS = 5000L
    }
}

/**
 * Socket paths for storage change stream.
 */
object StorageSocketPaths {
    fun socketPath(): String {
        val home = System.getProperty("user.home", "").ifBlank { "." }
        return File(home, ".auto-mobile/storage-stream.sock").path
    }
}

// Protocol models

@Serializable
private data class StorageStreamRequest(
    val command: String,
    val packageName: String? = null,
    val fileName: String? = null,
)

@Serializable
private data class StorageStreamResponse(
    val success: Boolean,
    val error: String? = null,
    val event: StorageEventPayload? = null,
)

@Serializable
private data class StorageEventPayload(
    val packageName: String,
    val fileName: String,
    val key: String?,
    val value: String?,
    val valueType: String,
    val timestamp: Long,
    val sequenceNumber: Long = 0,
)
