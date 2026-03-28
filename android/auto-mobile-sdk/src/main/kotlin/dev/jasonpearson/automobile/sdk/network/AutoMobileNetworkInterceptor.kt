package dev.jasonpearson.automobile.sdk.network

import dev.jasonpearson.automobile.protocol.SdkNetworkRequestEvent
import dev.jasonpearson.automobile.sdk.events.SdkEventBuffer
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer

/**
 * OkHttp Application-level Interceptor that captures HTTP request/response metadata
 * and enforces network mock rules and error simulation.
 *
 * Records URL, method, status, duration, body sizes, and optionally headers and bodies.
 * Header/body capture is opt-in to avoid leaking auth tokens by default.
 *
 * When a [ruleStore] is provided, the interceptor checks for matching mock rules
 * and active error simulations before making real HTTP calls. Matching requests are
 * short-circuited with synthetic responses.
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
    /** Optional rule store for mock enforcement and error simulation */
    private val ruleStore: NetworkMockRuleStore.RuleMatcher? = null,
) : Interceptor {

  companion object {
    /** Default max body capture size: 32KB */
    const val MAX_BODY_BYTES = 32L * 1024

    private val TEXT_CONTENT_TYPES =
        setOf(
            "application/json",
            "text/plain",
            "text/html",
            "text/xml",
            "application/xml",
            "application/x-www-form-urlencoded",
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
    val reqHeaders =
        if (captureHeaders) {
          val headers = request.headers.toMap().toMutableMap()
          if ("Host" !in headers) headers["Host"] = request.url.host
          if ("User-Agent" !in headers) headers["User-Agent"] = "okhttp/${okhttp3.OkHttp.VERSION}"
          headers
        } else null

    // Capture request body
    val reqBody =
        if (captureBodies && request.body != null) {
          captureRequestBody(request)
        } else null

    // --- Mock rule enforcement ---
    val mockRule =
        ruleStore?.findMatchingRule(request.url.host, request.url.encodedPath, request.method)
    if (mockRule != null) {
      val durationMs = System.currentTimeMillis() - startMs
      buffer.add(
          SdkNetworkRequestEvent(
              timestamp = startMs,
              applicationId = applicationId,
              url = request.url.toString(),
              method = request.method,
              statusCode = mockRule.statusCode,
              durationMs = durationMs,
              requestBodySize = request.body?.contentLength() ?: -1,
              responseBodySize = mockRule.responseBody.length.toLong(),
              host = request.url.host,
              path = request.url.encodedPath,
              error = "mocked:${mockRule.mockId}",
              requestHeaders = reqHeaders,
              requestBody = reqBody,
              responseBody = mockRule.responseBody,
              contentType = mockRule.contentType,
          ))
      return buildMockResponse(request, mockRule)
    }

    // --- Error simulation enforcement ---
    val errorSim = ruleStore?.getErrorSimulation()
    if (errorSim != null) {
      val durationMs = System.currentTimeMillis() - startMs
      return handleErrorSimulation(request, errorSim, startMs, durationMs, reqHeaders, reqBody)
    }

    // --- Normal request flow ---
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
          ))
      throw e
    }

    val durationMs = System.currentTimeMillis() - startMs
    val responseContentType = response.header("Content-Type")

    val finalReqHeaders =
        if (captureHeaders) {
          response.request.headers.toMap()
        } else reqHeaders

    val respHeaders =
        if (captureHeaders) {
          response.headers.toMap()
        } else null

    val respBody =
        if (captureBodies && isTextContentType(responseContentType)) {
          try {
            response.peekBody(maxBodyBytes).string()
          } catch (_: Exception) {
            null
          }
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
        ))

    return response
  }

  private fun buildMockResponse(
      request: okhttp3.Request,
      rule: NetworkMockRuleStore.MatchedMockRule
  ): Response {
    val statusCode = rule.statusCode.coerceIn(100, 599)
    val mediaType = try {
      rule.contentType.toMediaType()
    } catch (_: IllegalArgumentException) {
      "application/octet-stream".toMediaType()
    }
    val builder =
        Response.Builder()
            .request(request)
            .protocol(Protocol.HTTP_1_1)
            .code(statusCode)
            .message("Mocked by AutoMobile (${rule.mockId})")
            .body(rule.responseBody.toResponseBody(mediaType))
    for ((name, value) in rule.responseHeaders) {
      builder.addHeader(name, value)
    }
    return builder.build()
  }

  private fun handleErrorSimulation(
      request: okhttp3.Request,
      sim: NetworkMockRuleStore.ErrorSimulationConfig,
      startMs: Long,
      durationMs: Long,
      reqHeaders: Map<String, String>?,
      reqBody: String?,
  ): Response {
    val errorMsg = "simulated:${sim.errorType}"
    when (sim.errorType) {
      "http500" -> {
        buffer.add(
            SdkNetworkRequestEvent(
                timestamp = startMs,
                applicationId = applicationId,
                url = request.url.toString(),
                method = request.method,
                statusCode = 500,
                durationMs = durationMs,
                requestBodySize = request.body?.contentLength() ?: -1,
                responseBodySize = 0,
                host = request.url.host,
                path = request.url.encodedPath,
                error = errorMsg,
                requestHeaders = reqHeaders,
                requestBody = reqBody,
            ))
        return Response.Builder()
            .request(request)
            .protocol(Protocol.HTTP_1_1)
            .code(500)
            .message("Simulated Error (AutoMobile)")
            .body("".toResponseBody("text/plain".toMediaType()))
            .build()
      }
      else -> {
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
                error = errorMsg,
                requestHeaders = reqHeaders,
                requestBody = reqBody,
            ))
        throw when (sim.errorType) {
          "timeout" -> SocketTimeoutException("Simulated timeout (AutoMobile)")
          "connectionRefused" -> ConnectException("Simulated connection refused (AutoMobile)")
          "dnsFailure" -> UnknownHostException("Simulated DNS failure (AutoMobile)")
          "tlsFailure" -> SSLException("Simulated TLS failure (AutoMobile)")
          else -> ConnectException("Simulated error: ${sim.errorType} (AutoMobile)")
        }
      }
    }
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
    } catch (_: Exception) {
      null
    }
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
