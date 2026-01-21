package dev.jasonpearson.automobile.accessibilityservice

import android.util.Log
import dev.jasonpearson.automobile.accessibilityservice.models.HighlightShape
import dev.jasonpearson.automobile.accessibilityservice.perf.PerfProvider
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
import java.util.concurrent.atomic.AtomicInteger
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/** Incoming WebSocket message format */
@Serializable
data class WebSocketRequest(
    val type: String,
    val requestId: String? = null,
    // Tap coordinates parameters
    val x: Int? = null,
    val y: Int? = null,
    // Highlight parameters
    val id: String? = null,
    val shape: HighlightShape? = null,
    // Swipe parameters
    val x1: Int? = null,
    val y1: Int? = null,
    val x2: Int? = null,
    val y2: Int? = null,
    val duration: Long? = null,
    val offset: Int? = null, // Two-finger swipe offset
    val holdTime: Long? = null,
    val pressDurationMs: Long? = null,
    val dragDurationMs: Long? = null,
    val holdDurationMs: Long? = null,
    // Pinch parameters
    val centerX: Int? = null,
    val centerY: Int? = null,
    val distanceStart: Int? = null,
    val distanceEnd: Int? = null,
    val rotationDegrees: Float? = null,
    // Text input parameters
    val text: String? = null,
    val resourceId: String? = null, // Optional: target specific element by resource-id
    // Certificate parameters
    val certificate: String? = null,
    val alias: String? = null,
    val devicePath: String? = null,
    // Action parameters (IME or node actions)
    val action: String? =
        null, // IME action: done, next, search, send, go, previous; node action: long_click
    // Stale check parameters
    val sinceTimestamp: Long? =
        null, // For request_hierarchy_if_stale: extract only if no events since this timestamp
    val enabled: Boolean? = null,
    // Permission request parameters
    val permission: String? = null,
    val requestPermission: Boolean? = null,
    // Filtering/optimization control
    val disableAllFiltering: Boolean? = null, // If true, disable all filtering and optimizations
)

/**
 * WebSocket server that streams view hierarchy updates to connected clients. Designed to work with
 * adb port forwarding for MCP server communication.
 */
class WebSocketServer(
    private val port: Int = 8765,
    private val scope: CoroutineScope,
    private val perfProvider: PerfProvider = PerfProvider.instance,
    private val onRequestHierarchy: ((disableAllFiltering: Boolean) -> Unit)? = null,
    private val onRequestHierarchyIfStale: ((sinceTimestamp: Long) -> Unit)? = null,
    private val onRequestScreenshot: ((requestId: String?) -> Unit)? = null,
    private val onRequestSwipe:
        ((requestId: String?, x1: Int, y1: Int, x2: Int, y2: Int, duration: Long) -> Unit)? =
        null,
    private val onRequestTapCoordinates:
        ((requestId: String?, x: Int, y: Int, duration: Long) -> Unit)? =
        null,
    private val onRequestTwoFingerSwipe:
        ((
            requestId: String?, x1: Int, y1: Int, x2: Int, y2: Int, duration: Long, offset: Int,
        ) -> Unit)? =
        null,
    private val onRequestDrag:
        ((
            requestId: String?,
            x1: Int,
            y1: Int,
            x2: Int,
            y2: Int,
            pressDurationMs: Long,
            dragDurationMs: Long,
            holdDurationMs: Long,
        ) -> Unit)? =
        null,
    private val onRequestPinch:
        ((
            requestId: String?,
            centerX: Int,
            centerY: Int,
            distanceStart: Int,
            distanceEnd: Int,
            rotationDegrees: Float,
            duration: Long,
        ) -> Unit)? =
        null,
    private val onRequestSetText:
        ((requestId: String?, text: String, resourceId: String?) -> Unit)? =
        null,
    private val onRequestImeAction: ((requestId: String?, action: String) -> Unit)? = null,
    private val onRequestSelectAll: ((requestId: String?) -> Unit)? = null,
    private val onRequestAction:
        ((requestId: String?, action: String, resourceId: String?) -> Unit)? =
        null,
    private val onRequestClipboard: ((requestId: String?, action: String, text: String?) -> Unit)? =
        null,
    private val onRequestInstallCaCert: ((requestId: String?, certificate: String) -> Unit)? = null,
    private val onRequestRemoveCaCert:
        ((requestId: String?, alias: String?, certificate: String?) -> Unit)? =
        null,
    private val onRequestInstallCaCertFromPath:
        ((requestId: String?, devicePath: String) -> Unit)? =
        null,
    private val onGetDeviceOwnerStatus: ((requestId: String?) -> Unit)? = null,
    private val onGetPermission:
        ((requestId: String?, permission: String?, requestPermission: Boolean?) -> Unit)? =
        null,
    private val onSetRecompositionTracking: ((enabled: Boolean) -> Unit)? = null,
    private val onGetCurrentFocus: ((requestId: String?) -> Unit)? = null,
    private val onGetTraversalOrder: ((requestId: String?) -> Unit)? = null,
    private val onAddHighlight:
        ((requestId: String?, highlightId: String?, shape: HighlightShape?) -> Unit)? =
        null,
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

  /** Start the WebSocket server */
  fun start() {
    if (server != null) {
      Log.w(TAG, "Server already running")
      return
    }

    try {
      server =
          embeddedServer(CIO, port = port) {
                install(WebSockets) {
                  pingPeriod = 15.seconds
                  timeout = 60.seconds
                  maxFrameSize = Long.MAX_VALUE
                  masking = false
                }

                install(ContentNegotiation) { json(json) }

                routing {
                  webSocket("/ws") {
                    val connectionId = connectionCount.incrementAndGet()
                    Log.d(TAG, "Client #$connectionId connected")

                    synchronized(connections) { connections.add(this) }

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
                      synchronized(connections) { connections.remove(this) }
                      Log.d(
                          TAG,
                          "Client #$connectionId disconnected. Active connections: ${connections.size}",
                      )
                    }
                  }

                  // Health check endpoint
                  get("/health") { call.respond(HttpStatusCode.OK, "OK") }
                }
              }
              .start(wait = false)

      // Launch coroutine to handle message broadcasting
      scope.launch {
        _messageFlow.asSharedFlow().collect { message -> broadcastToClients(message) }
      }

      Log.i(TAG, "WebSocket server started on port $port")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to start WebSocket server", e)
      server = null
    }
  }

  /** Stop the WebSocket server */
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

  /** Broadcast a message to all connected clients */
  suspend fun broadcast(message: String) {
    _messageFlow.emit(message)
  }

  /**
   * Broadcast a message with perf timing data included. Flushes accumulated perf data and injects
   * it into the message.
   *
   * @param messageBuilder Function that takes optional perfTiming JsonElement and returns the
   *   complete message
   */
  suspend fun broadcastWithPerf(messageBuilder: (perfTiming: JsonElement?) -> String) {
    val perfTiming = perfProvider.flush()
    val message = messageBuilder(perfTiming)
    _messageFlow.emit(message)
  }

  /**
   * Broadcast a message synchronously (waits for delivery to all clients). Use this when message
   * ordering is critical (e.g., hierarchy update before set_text_result).
   *
   * @param messageBuilder Function that takes optional perfTiming JsonElement and returns the
   *   complete message
   */
  suspend fun broadcastWithPerfSync(messageBuilder: (perfTiming: JsonElement?) -> String) {
    val perfTiming = perfProvider.flush()
    val message = messageBuilder(perfTiming)
    broadcastToClients(message)
  }

  /** Internal method to send message to all connected clients */
  private suspend fun broadcastToClients(message: String) {
    val deadConnections = mutableListOf<DefaultWebSocketSession>()

    synchronized(connections) { connections.toList() }
        .forEach { connection ->
          try {
            connection.send(Frame.Text(message))
          } catch (e: Exception) {
            Log.w(TAG, "Failed to send to connection, marking as dead", e)
            deadConnections.add(connection)
          }
        }

    // Remove dead connections
    if (deadConnections.isNotEmpty()) {
      synchronized(connections) { connections.removeAll(deadConnections.toSet()) }
      Log.d(TAG, "Removed ${deadConnections.size} dead connections. Active: ${connections.size}")
    }
  }

  /** Get the number of active connections */
  fun getConnectionCount(): Int {
    return synchronized(connections) { connections.size }
  }

  /** Check if server is running */
  fun isRunning(): Boolean = server != null

  /**
   * Get the actual port the server is listening on. Useful when port 0 is specified to let the OS
   * assign an available port. Returns null if server is not running.
   */
  @Suppress("UNCHECKED_CAST")
  fun getActualPort(): Int? {
    val srv = server ?: return null
    return try {
      val engine = (srv as EmbeddedServer<CIOApplicationEngine, *>).engine
      runBlocking { engine.resolvedConnectors().firstOrNull()?.port ?: port }
    } catch (e: Exception) {
      Log.w(TAG, "Could not get actual port, returning configured port", e)
      port
    }
  }

  /** Handle incoming client message */
  private fun handleClientMessage(message: String) {
    try {
      val request = json.decodeFromString<WebSocketRequest>(message)
      when (request.type) {
        "request_hierarchy" -> {
          val disableAllFiltering = request.disableAllFiltering ?: false
          Log.d(
              TAG,
              "Received hierarchy request (requestId: ${request.requestId}, disableAllFiltering: $disableAllFiltering)",
          )
          onRequestHierarchy?.invoke(disableAllFiltering)
        }
        "request_hierarchy_if_stale" -> {
          val sinceTimestamp = request.sinceTimestamp
          if (sinceTimestamp != null) {
            Log.d(
                TAG,
                "Received hierarchy_if_stale request (requestId: ${request.requestId}, sinceTimestamp: $sinceTimestamp)",
            )
            onRequestHierarchyIfStale?.invoke(sinceTimestamp)
          } else {
            Log.w(
                TAG,
                "request_hierarchy_if_stale missing sinceTimestamp, treating as regular request",
            )
            val disableAllFiltering = request.disableAllFiltering ?: false
            onRequestHierarchy?.invoke(disableAllFiltering)
          }
        }
        "request_screenshot" -> {
          Log.d(TAG, "Received screenshot request (requestId: ${request.requestId})")
          onRequestScreenshot?.invoke(request.requestId)
        }
        "request_swipe" -> {
          Log.d(TAG, "Received swipe request (requestId: ${request.requestId})")
          val x1 = request.x1
          val y1 = request.y1
          val x2 = request.x2
          val y2 = request.y2
          val duration = request.duration ?: 300L
          if (x1 != null && y1 != null && x2 != null && y2 != null) {
            onRequestSwipe?.invoke(request.requestId, x1, y1, x2, y2, duration)
          } else {
            Log.w(TAG, "Swipe request missing required coordinates")
          }
        }
        "request_tap_coordinates" -> {
          Log.d(TAG, "Received tap coordinates request (requestId: ${request.requestId})")
          val x = request.x
          val y = request.y
          val duration = request.duration ?: 10L
          if (x != null && y != null) {
            onRequestTapCoordinates?.invoke(request.requestId, x, y, duration)
          } else {
            Log.w(TAG, "Tap coordinates request missing required x/y")
          }
        }
        "request_two_finger_swipe" -> {
          Log.d(TAG, "Received two-finger swipe request (requestId: ${request.requestId})")
          val x1 = request.x1
          val y1 = request.y1
          val x2 = request.x2
          val y2 = request.y2
          val duration = request.duration ?: 300L
          val offset = request.offset ?: 100
          if (x1 != null && y1 != null && x2 != null && y2 != null) {
            onRequestTwoFingerSwipe?.invoke(request.requestId, x1, y1, x2, y2, duration, offset)
          } else {
            Log.w(TAG, "Two-finger swipe request missing required coordinates")
          }
        }
        "request_drag" -> {
          Log.d(TAG, "Received drag request (requestId: ${request.requestId})")
          val x1 = request.x1
          val y1 = request.y1
          val x2 = request.x2
          val y2 = request.y2
          val pressDurationMs = request.pressDurationMs ?: request.holdTime ?: 600L
          val dragDurationMs = request.dragDurationMs ?: request.duration ?: 300L
          val holdDurationMs = request.holdDurationMs ?: 100L
          if (x1 != null && y1 != null && x2 != null && y2 != null) {
            onRequestDrag?.invoke(
                request.requestId,
                x1,
                y1,
                x2,
                y2,
                pressDurationMs,
                dragDurationMs,
                holdDurationMs,
            )
          } else {
            Log.w(TAG, "Drag request missing required coordinates")
          }
        }
        "request_pinch" -> {
          Log.d(TAG, "Received pinch request (requestId: ${request.requestId})")
          val centerX = request.centerX
          val centerY = request.centerY
          val distanceStart = request.distanceStart
          val distanceEnd = request.distanceEnd
          val rotationDegrees = request.rotationDegrees ?: 0f
          val duration = request.duration ?: 300L
          if (centerX != null && centerY != null && distanceStart != null && distanceEnd != null) {
            onRequestPinch?.invoke(
                request.requestId,
                centerX,
                centerY,
                distanceStart,
                distanceEnd,
                rotationDegrees,
                duration,
            )
          } else {
            Log.w(TAG, "Pinch request missing required parameters")
          }
        }
        "request_set_text" -> {
          Log.d(TAG, "Received set_text request (requestId: ${request.requestId})")
          val text = request.text
          if (text != null) {
            onRequestSetText?.invoke(request.requestId, text, request.resourceId)
          } else {
            Log.w(TAG, "Set text request missing required text")
          }
        }
        "request_ime_action" -> {
          Log.d(TAG, "Received ime_action request (requestId: ${request.requestId})")
          val action = request.action
          if (action != null) {
            onRequestImeAction?.invoke(request.requestId, action)
          } else {
            Log.w(TAG, "IME action request missing required action")
          }
        }
        "request_select_all" -> {
          Log.d(TAG, "Received select_all request (requestId: ${request.requestId})")
          onRequestSelectAll?.invoke(request.requestId)
        }
        "request_action" -> {
          Log.d(TAG, "Received action request (requestId: ${request.requestId})")
          val action = request.action
          if (action != null) {
            onRequestAction?.invoke(request.requestId, action, request.resourceId)
          } else {
            Log.w(TAG, "Action request missing required action")
          }
        }
        "request_clipboard" -> {
          Log.d(TAG, "Received clipboard request (requestId: ${request.requestId})")
          val action = request.action
          if (action != null) {
            onRequestClipboard?.invoke(request.requestId, action, request.text)
          } else {
            Log.w(TAG, "Clipboard request missing required action")
          }
        }
        "install_ca_cert" -> {
          Log.d(TAG, "Received install_ca_cert request (requestId: ${request.requestId})")
          val certificate = request.certificate
          if (!certificate.isNullOrBlank()) {
            onRequestInstallCaCert?.invoke(request.requestId, certificate)
          } else {
            Log.w(TAG, "install_ca_cert request missing certificate")
          }
        }
        "install_ca_cert_from_path" -> {
          Log.d(TAG, "Received install_ca_cert_from_path request (requestId: ${request.requestId})")
          val devicePath = request.devicePath
          if (!devicePath.isNullOrBlank()) {
            onRequestInstallCaCertFromPath?.invoke(request.requestId, devicePath)
          } else {
            Log.w(TAG, "install_ca_cert_from_path request missing devicePath")
          }
        }
        "remove_ca_cert" -> {
          Log.d(TAG, "Received remove_ca_cert request (requestId: ${request.requestId})")
          val alias = request.alias
          val certificate = request.certificate
          if (!alias.isNullOrBlank() || !certificate.isNullOrBlank()) {
            onRequestRemoveCaCert?.invoke(request.requestId, alias, certificate)
          } else {
            Log.w(TAG, "remove_ca_cert request missing alias and certificate")
          }
        }
        "get_device_owner_status" -> {
          Log.d(TAG, "Received get_device_owner_status request (requestId: ${request.requestId})")
          onGetDeviceOwnerStatus?.invoke(request.requestId)
        }
        "get_permission" -> {
          Log.d(
              TAG,
              "Received get_permission request (requestId: ${request.requestId}, permission: ${request.permission}, requestPermission: ${request.requestPermission})",
          )
          onGetPermission?.invoke(request.requestId, request.permission, request.requestPermission)
        }
        "set_recomposition_tracking" -> {
          val enabled = request.enabled
          if (enabled != null) {
            Log.d(TAG, "Received recomposition tracking toggle: $enabled")
            onSetRecompositionTracking?.invoke(enabled)
          } else {
            Log.w(TAG, "set_recomposition_tracking missing enabled flag")
          }
        }
        "get_current_focus" -> {
          Log.d(TAG, "Received get_current_focus request (requestId: ${request.requestId})")
          onGetCurrentFocus?.invoke(request.requestId)
        }
        "get_traversal_order" -> {
          Log.d(TAG, "Received get_traversal_order request (requestId: ${request.requestId})")
          onGetTraversalOrder?.invoke(request.requestId)
        }
        "add_highlight" -> {
          Log.d(TAG, "Received add_highlight request (requestId: ${request.requestId})")
          onAddHighlight?.invoke(request.requestId, request.id, request.shape)
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
