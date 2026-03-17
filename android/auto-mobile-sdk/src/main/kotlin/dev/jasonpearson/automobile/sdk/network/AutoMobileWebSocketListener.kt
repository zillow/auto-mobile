package dev.jasonpearson.automobile.sdk.network

import dev.jasonpearson.automobile.protocol.SdkWebSocketFrameEvent
import dev.jasonpearson.automobile.protocol.WebSocketFrameDirection
import dev.jasonpearson.automobile.protocol.WebSocketFrameType
import dev.jasonpearson.automobile.sdk.events.SdkEventBuffer
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.util.UUID

/**
 * Decorator wrapping an existing [WebSocketListener] to capture WebSocket frame metadata.
 *
 * Records frame direction, type, and size as [SdkWebSocketFrameEvent] without inspecting
 * the actual payload content.
 *
 * @param delegate The original WebSocketListener to delegate all callbacks to
 * @param url The WebSocket URL for identification
 * @param buffer The event buffer to post events to
 * @param applicationId Optional application ID
 * @param connectionId Unique ID for this WebSocket connection (auto-generated)
 */
class AutoMobileWebSocketListener(
  private val delegate: WebSocketListener,
  private val url: String,
  private val buffer: SdkEventBuffer,
  private val applicationId: String? = null,
  private val connectionId: String = UUID.randomUUID().toString().take(8),
) : WebSocketListener() {

  override fun onOpen(webSocket: WebSocket, response: Response) {
    delegate.onOpen(webSocket, response)
  }

  override fun onMessage(webSocket: WebSocket, text: String) {
    recordFrame(WebSocketFrameDirection.RECEIVED, WebSocketFrameType.TEXT, text.length.toLong())
    delegate.onMessage(webSocket, text)
  }

  override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
    recordFrame(WebSocketFrameDirection.RECEIVED, WebSocketFrameType.BINARY, bytes.size.toLong())
    delegate.onMessage(webSocket, bytes)
  }

  override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
    recordFrame(WebSocketFrameDirection.RECEIVED, WebSocketFrameType.CLOSE, reason.length.toLong())
    delegate.onClosing(webSocket, code, reason)
  }

  override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
    delegate.onClosed(webSocket, code, reason)
  }

  override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
    delegate.onFailure(webSocket, t, response)
  }

  private fun recordFrame(direction: WebSocketFrameDirection, type: WebSocketFrameType, size: Long) {
    buffer.add(
      SdkWebSocketFrameEvent(
        timestamp = System.currentTimeMillis(),
        applicationId = applicationId,
        connectionId = connectionId,
        url = url,
        direction = direction,
        frameType = type,
        payloadSize = size,
      )
    )
  }
}
