package dev.jasonpearson.automobile.sdk.network

import dev.jasonpearson.automobile.sdk.events.SdkEventBuffer
import okhttp3.Interceptor
import okhttp3.WebSocketListener

/**
 * Public API for network interception.
 *
 * Provides an OkHttp [Interceptor] for HTTP request/response tracking and a
 * wrapper for [WebSocketListener] to track WebSocket frames.
 *
 * OkHttp is a `compileOnly` dependency — consumers must include OkHttp themselves.
 */
object AutoMobileNetwork {

  @Volatile private var buffer: SdkEventBuffer? = null
  @Volatile private var applicationId: String? = null

  /**
   * Initialize the network module with a shared event buffer.
   *
   * @param applicationId The application package name
   * @param buffer The shared SDK event buffer
   */
  fun initialize(applicationId: String?, buffer: SdkEventBuffer) {
    this.applicationId = applicationId
    this.buffer = buffer
  }

  /**
   * Create an OkHttp Application-level Interceptor for HTTP request tracking.
   *
   * @return An [Interceptor] that records network events, or null if not initialized
   */
  fun interceptor(): Interceptor? {
    val buf = buffer ?: return null
    return AutoMobileNetworkInterceptor(buf, applicationId)
  }

  /**
   * Wrap a [WebSocketListener] to capture WebSocket frame metadata.
   *
   * @param delegate The original WebSocketListener
   * @param url The WebSocket URL for identification
   * @return A wrapping listener that records frame events
   */
  fun wrapWebSocketListener(delegate: WebSocketListener, url: String): WebSocketListener {
    val buf = buffer ?: return delegate
    return AutoMobileWebSocketListener(delegate, url, buf, applicationId)
  }
}
