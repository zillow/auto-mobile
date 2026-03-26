package dev.jasonpearson.automobile.desktop.core.telemetry

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/**
 * Interface for executing network requests. Enables testing with fakes.
 */
interface NetworkRequestExecutor {
    fun run(
        url: String,
        method: String,
        requestHeaders: Map<String, String>?,
        requestBody: String?,
    ): NetworkReplayResult
}

/**
 * Result of replaying a network request from the IDE.
 */
data class NetworkReplayResult(
    val statusCode: Int,
    val durationMs: Long,
    val responseHeaders: Map<String, String>,
    val responseBody: String?,
    val error: String?,
)

/**
 * Replays a network request using the JVM HttpClient.
 */
object NetworkRequestRunner : NetworkRequestExecutor {

    private val client = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NORMAL)
        .connectTimeout(Duration.ofSeconds(30))
        .build()

    override fun run(
        url: String,
        method: String,
        requestHeaders: Map<String, String>?,
        requestBody: String?,
    ): NetworkReplayResult {
        val startMs = System.currentTimeMillis()
        return try {
            val builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(30))

            // Add headers (skip Host which is set automatically)
            requestHeaders?.forEach { (key, value) ->
                if (!key.equals("Host", ignoreCase = true) &&
                    !key.equals("Content-Length", ignoreCase = true)) {
                    builder.header(key, value)
                }
            }

            // Set method and body
            val bodyPublisher = if (requestBody != null) {
                HttpRequest.BodyPublishers.ofString(requestBody)
            } else {
                HttpRequest.BodyPublishers.noBody()
            }

            when (method.uppercase()) {
                "GET" -> builder.GET()
                "DELETE" -> builder.DELETE()
                "POST" -> builder.method("POST", bodyPublisher)
                "PUT" -> builder.method("PUT", bodyPublisher)
                "PATCH" -> builder.method("PATCH", bodyPublisher)
                "HEAD" -> builder.method("HEAD", HttpRequest.BodyPublishers.noBody())
                "OPTIONS" -> builder.method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                else -> builder.method(method, bodyPublisher)
            }

            val response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString())
            val durationMs = System.currentTimeMillis() - startMs

            val respHeaders = mutableMapOf<String, String>()
            response.headers().map().forEach { (key, values) ->
                if (key != null) {
                    respHeaders[key] = values.joinToString(", ")
                }
            }

            NetworkReplayResult(
                statusCode = response.statusCode(),
                durationMs = durationMs,
                responseHeaders = respHeaders,
                responseBody = response.body(),
                error = null,
            )
        } catch (e: Exception) {
            val durationMs = System.currentTimeMillis() - startMs
            NetworkReplayResult(
                statusCode = 0,
                durationMs = durationMs,
                responseHeaders = emptyMap(),
                responseBody = null,
                error = e.message ?: e.javaClass.simpleName,
            )
        }
    }
}
