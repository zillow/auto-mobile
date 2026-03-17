package dev.jasonpearson.automobile.sdk.network

import dev.jasonpearson.automobile.protocol.SdkNetworkRequestEvent
import dev.jasonpearson.automobile.sdk.events.SdkEventBuffer
import okhttp3.Interceptor
import okhttp3.Response

/**
 * OkHttp Application-level Interceptor that captures HTTP request/response metadata.
 *
 * Records URL, method, status, duration, and body sizes without reading/buffering
 * the response body. Headers are not captured by default to avoid leaking auth tokens.
 *
 * This class references OkHttp types which must be on the classpath. The SDK declares
 * OkHttp as `compileOnly` so consumers must bring their own OkHttp dependency.
 */
class AutoMobileNetworkInterceptor(
  private val buffer: SdkEventBuffer,
  private val applicationId: String? = null,
) : Interceptor {

  override fun intercept(chain: Interceptor.Chain): Response {
    val request = chain.request()
    val startMs = System.currentTimeMillis()

    val response: Response
    try {
      response = chain.proceed(request)
    } catch (e: Exception) {
      // Record failed request
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
        )
      )
      throw e
    }

    val durationMs = System.currentTimeMillis() - startMs

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
      )
    )

    return response
  }
}
