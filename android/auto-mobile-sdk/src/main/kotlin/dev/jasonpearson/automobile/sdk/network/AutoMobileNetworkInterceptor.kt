package dev.jasonpearson.automobile.sdk.network

import dev.jasonpearson.automobile.protocol.SdkNetworkRequestEvent
import dev.jasonpearson.automobile.sdk.events.SdkEventBuffer
import okhttp3.Interceptor
import okhttp3.Response
import okio.Buffer

/**
 * OkHttp Application-level Interceptor that captures HTTP request/response metadata.
 *
 * Records URL, method, status, duration, body sizes, and optionally headers and bodies.
 * Header/body capture is opt-in to avoid leaking auth tokens by default.
 *
 * This class references OkHttp types which must be on the classpath. The SDK declares
 * OkHttp as `compileOnly` so consumers must bring their own OkHttp dependency.
 */
class AutoMobileNetworkInterceptor(
  private val buffer: SdkEventBuffer,
  private val applicationId: String? = null,
  /** Capture request and response headers (may contain auth tokens) */
  private val captureHeaders: Boolean = false,
  /** Capture request and response bodies (truncated to [maxBodyBytes]) */
  private val captureBodies: Boolean = false,
  /** Maximum body size to capture in bytes */
  private val maxBodyBytes: Long = MAX_BODY_BYTES,
) : Interceptor {

  companion object {
    /** Default max body capture size: 32KB */
    const val MAX_BODY_BYTES = 32L * 1024

    private val TEXT_CONTENT_TYPES = setOf(
      "application/json", "text/plain", "text/html", "text/xml",
      "application/xml", "application/x-www-form-urlencoded",
    )

    private fun isTextContentType(contentType: String?): Boolean {
      if (contentType == null) return false
      val base = contentType.substringBefore(';').trim().lowercase()
      return TEXT_CONTENT_TYPES.any { base == it || base.startsWith("text/") }
    }
  }

  override fun intercept(chain: Interceptor.Chain): Response {
    val request = chain.request()
    val startMs = System.currentTimeMillis()

    // Capture request headers — include OkHttp defaults that will be added later
    val reqHeaders = if (captureHeaders) {
      val headers = request.headers.toMap().toMutableMap()
      // OkHttp adds these automatically in the network layer; include them for completeness
      if ("Host" !in headers) headers["Host"] = request.url.host
      if ("User-Agent" !in headers) headers["User-Agent"] = "okhttp/${okhttp3.OkHttp.VERSION}"
      headers
    } else null

    // Capture request body
    val reqBody = if (captureBodies && request.body != null) {
      captureRequestBody(request)
    } else null

    val response: Response
    try {
      response = chain.proceed(request)
    } catch (e: Exception) {
      val durationMs = System.currentTimeMillis() - startMs
      buffer.add(
        SdkNetworkRequestEvent(
          timestamp = startMs,
          applicationId = applicationId,
          url = request.url.toString(),
          method = request.method,
          statusCode = 0,
          durationMs = durationMs,
          requestBodySize = request.body?.contentLength() ?: -1,
          responseBodySize = -1,
          host = request.url.host,
          path = request.url.encodedPath,
          error = e.message,
          requestHeaders = reqHeaders,
          requestBody = reqBody,
        )
      )
      throw e
    }

    val durationMs = System.currentTimeMillis() - startMs
    val responseContentType = response.header("Content-Type")

    // Capture request headers from the response's request (includes OkHttp-added headers
    // like Host, User-Agent, Accept-Encoding that aren't on the original request)
    val finalReqHeaders = if (captureHeaders) {
      response.request.headers.toMap()
    } else reqHeaders

    // Capture response headers
    val respHeaders = if (captureHeaders) {
      response.headers.toMap()
    } else null

    // Capture response body (non-destructive peek)
    val respBody = if (captureBodies && isTextContentType(responseContentType)) {
      try {
        response.peekBody(maxBodyBytes).string()
      } catch (_: Exception) { null }
    } else null

    buffer.add(
      SdkNetworkRequestEvent(
        timestamp = startMs,
        applicationId = applicationId,
        url = request.url.toString(),
        method = request.method,
        statusCode = response.code,
        durationMs = durationMs,
        requestBodySize = request.body?.contentLength() ?: -1,
        responseBodySize = response.body?.contentLength() ?: -1,
        protocol = response.protocol.toString(),
        host = request.url.host,
        path = request.url.encodedPath,
        requestHeaders = finalReqHeaders,
        responseHeaders = respHeaders,
        requestBody = reqBody,
        responseBody = respBody,
        contentType = responseContentType,
      )
    )

    return response
  }

  private fun captureRequestBody(request: okhttp3.Request): String? {
    val body = request.body ?: return null
    val contentType = body.contentType()?.toString()
    if (!isTextContentType(contentType)) return null
    return try {
      val buffer = Buffer()
      body.writeTo(buffer)
      val bytes = minOf(buffer.size, maxBodyBytes)
      buffer.readUtf8(bytes)
    } catch (_: Exception) { null }
  }

  private fun okhttp3.Headers.toMap(): Map<String, String> {
    val map = mutableMapOf<String, String>()
    for (i in 0 until size) {
      val name = name(i)
      val existing = map[name]
      map[name] = if (existing != null) "$existing, ${value(i)}" else value(i)
    }
    return map
  }
}
