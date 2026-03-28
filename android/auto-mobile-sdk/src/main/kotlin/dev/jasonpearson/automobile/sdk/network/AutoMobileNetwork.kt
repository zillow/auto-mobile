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
  @Volatile private var ruleStore: NetworkMockRuleStore.RuleMatcher? = null

  /**
   * Initialize the network module with a shared event buffer.
   *
   * @param applicationId The application package name
   * @param buffer The shared SDK event buffer
   * @param ruleStore Optional rule matcher for mock enforcement and error simulation
   */
  fun initialize(
      applicationId: String?,
      buffer: SdkEventBuffer,
      ruleStore: NetworkMockRuleStore.RuleMatcher? = null,
  ) {
    this.applicationId = applicationId
    this.buffer = buffer
    this.ruleStore = ruleStore
  }

  /**
   * Create an OkHttp Application-level Interceptor for HTTP request tracking.
   *
   * When a [ruleStore] has been provided via [initialize], the interceptor also
   * enforces mock rules and error simulation by short-circuiting matching requests.
   *
   * @param captureHeaders Whether to capture request/response headers (default false for privacy)
   * @param captureBodies Whether to capture request/response bodies (default false, truncated to 32KB)
   * @return An [Interceptor] that records network events, or null if not initialized
   */
  fun interceptor(
      captureHeaders: Boolean = false,
      captureBodies: Boolean = false,
  ): Interceptor? {
    val buf = buffer ?: return null
    return AutoMobileNetworkInterceptor(
        buf, applicationId, captureHeaders, captureBodies, ruleStore = ruleStore)
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
