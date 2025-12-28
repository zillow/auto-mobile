package dev.jasonpearson.automobile.accessibilityservice

import android.util.Log
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.cio.*
import io.ktor.server.engine.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.concurrent.atomic.AtomicInteger
import kotlin.time.Duration.Companion.seconds

/**
 * Incoming WebSocket message format
 */
@Serializable
data class WebSocketRequest(
    val type: String,
    val requestId: String? = null
)

/**
 * WebSocket server that streams view hierarchy updates to connected clients.
 * Designed to work with adb port forwarding for MCP server communication.
 */
class WebSocketServer(
    private val port: Int = 8765,
    private val scope: CoroutineScope,
    private val onRequestHierarchy: (() -> Unit)? = null
) {
    companion object {
        private const val TAG = "WebSocketServer"
    }

    private var server: EmbeddedServer<*, *>? = null
    private val connections = mutableSetOf<DefaultWebSocketSession>()
    private val connectionCount = AtomicInteger(0)

    // Flow to broadcast messages to all connected clients
    private val _messageFlow = MutableSharedFlow<String>(replay = 0, extraBufferCapacity = 10)

    private val json = Json {
        prettyPrint = false
        ignoreUnknownKeys = true
    }

    /**
     * Start the WebSocket server
     */
    fun start() {
        if (server != null) {
            Log.w(TAG, "Server already running")
            return
        }

        try {
            server = embeddedServer(CIO, port = port) {
                install(WebSockets) {
                    pingPeriod = 15.seconds
                    timeout = 60.seconds
                    maxFrameSize = Long.MAX_VALUE
                    masking = false
                }

                install(ContentNegotiation) {
                    json(json)
                }

                routing {
                    webSocket("/ws") {
                        val connectionId = connectionCount.incrementAndGet()
                        Log.d(TAG, "Client #$connectionId connected")

                        synchronized(connections) {
                            connections.add(this)
                        }

                        try {
                            // Send initial connection message
                            send(Frame.Text("""{"type":"connected","id":$connectionId}"""))

                            // Listen for incoming messages
                            for (frame in incoming) {
                                when (frame) {
                                    is Frame.Text -> {
                                        val text = frame.readText()
                                        Log.d(TAG, "Received from client #$connectionId: $text")
                                        handleClientMessage(text)
                                    }
                                    is Frame.Close -> {
                                        Log.d(TAG, "Client #$connectionId closed connection")
                                    }
                                    else -> {
                                        Log.d(TAG, "Received frame type: ${frame.frameType}")
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Error in WebSocket connection #$connectionId", e)
                        } finally {
                            synchronized(connections) {
                                connections.remove(this)
                            }
                            Log.d(TAG, "Client #$connectionId disconnected. Active connections: ${connections.size}")
                        }
                    }

                    // Health check endpoint
                    get("/health") {
                        call.respond(HttpStatusCode.OK, "OK")
                    }
                }
            }.start(wait = false)

            // Launch coroutine to handle message broadcasting
            scope.launch {
                _messageFlow.asSharedFlow().collect { message ->
                    broadcastToClients(message)
                }
            }

            Log.i(TAG, "WebSocket server started on port $port")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start WebSocket server", e)
            server = null
        }
    }

    /**
     * Stop the WebSocket server
     */
    fun stop() {
        try {
            synchronized(connections) {
                connections.forEach { connection ->
                    scope.launch {
                        try {
                            connection.close(CloseReason(CloseReason.Codes.GOING_AWAY, "Server shutting down"))
                        } catch (e: Exception) {
                            Log.e(TAG, "Error closing connection", e)
                        }
                    }
                }
                connections.clear()
            }

            server?.stop(1000, 2000)
            server = null
            Log.i(TAG, "WebSocket server stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping WebSocket server", e)
        }
    }

    /**
     * Broadcast a message to all connected clients
     */
    suspend fun broadcast(message: String) {
        _messageFlow.emit(message)
    }

    /**
     * Internal method to send message to all connected clients
     */
    private suspend fun broadcastToClients(message: String) {
        val deadConnections = mutableListOf<DefaultWebSocketSession>()

        synchronized(connections) {
            connections.toList()
        }.forEach { connection ->
            try {
                connection.send(Frame.Text(message))
            } catch (e: Exception) {
                Log.w(TAG, "Failed to send to connection, marking as dead", e)
                deadConnections.add(connection)
            }
        }

        // Remove dead connections
        if (deadConnections.isNotEmpty()) {
            synchronized(connections) {
                connections.removeAll(deadConnections.toSet())
            }
            Log.d(TAG, "Removed ${deadConnections.size} dead connections. Active: ${connections.size}")
        }
    }

    /**
     * Get the number of active connections
     */
    fun getConnectionCount(): Int {
        return synchronized(connections) {
            connections.size
        }
    }

    /**
     * Check if server is running
     */
    fun isRunning(): Boolean = server != null

    /**
     * Handle incoming client message
     */
    private fun handleClientMessage(message: String) {
        try {
            val request = json.decodeFromString<WebSocketRequest>(message)
            when (request.type) {
                "request_hierarchy" -> {
                    Log.d(TAG, "Received hierarchy request (requestId: ${request.requestId})")
                    onRequestHierarchy?.invoke()
                }
                else -> {
                    Log.d(TAG, "Unknown message type: ${request.type}")
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse client message: $message", e)
        }
    }
}
