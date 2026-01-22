package dev.jasonpearson.automobile.ide.daemon

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
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

interface PerformanceAuditStreamClient {
  fun poll(request: PerformanceAuditStreamRequest): PerformanceAuditStreamResponse
}

class PerformanceAuditStreamSocketClient(
    private val socketPathValue: String = PerformanceAuditStreamSocketPaths.socketPath(),
    private val json: Json = Json {
      ignoreUnknownKeys = true
      explicitNulls = false
    },
) : PerformanceAuditStreamClient {
  override fun poll(request: PerformanceAuditStreamRequest): PerformanceAuditStreamResponse {
    val response = sendRequest(request)
    if (!response.success) {
      throw McpConnectionException(response.error ?: "Performance stream request failed")
    }
    return response
  }

  private fun sendRequest(request: PerformanceAuditStreamRequest): PerformanceAuditStreamResponse {
    ensureSocketExists()

    val address = UnixDomainSocketAddress.of(socketPathValue)
    SocketChannel.open(address).use { channel ->
      val reader =
          BufferedReader(
              InputStreamReader(Channels.newInputStream(channel), StandardCharsets.UTF_8)
          )
      val writer =
          BufferedWriter(
              OutputStreamWriter(Channels.newOutputStream(channel), StandardCharsets.UTF_8)
          )

      writer.write(json.encodeToString(request))
      writer.newLine()
      writer.flush()

      val line = reader.readLine()
          ?: throw McpConnectionException("Performance stream socket closed")
      return json.decodeFromString(line)
    }
  }

  private fun ensureSocketExists() {
    val path = File(socketPathValue).toPath()
    if (!Files.exists(path)) {
      throw McpConnectionException("Performance stream socket not found at $socketPathValue")
    }
  }
}

object PerformanceAuditStreamSocketPaths {
  fun socketPath(): String {
    val home = System.getProperty("user.home", "").ifBlank { "." }
    return File(home, ".auto-mobile/performance-stream.sock").path
  }
}

@Serializable
data class PerformanceAuditStreamRequest(
    val command: String = "poll",
    val sinceTimestamp: String? = null,
    val sinceId: Long? = null,
    val startTime: String? = null,
    val endTime: String? = null,
    val limit: Int? = null,
    val deviceId: String? = null,
    val sessionId: String? = null,
    val packageName: String? = null,
)

@Serializable
data class PerformanceAuditStreamResponse(
    val success: Boolean,
    val results: List<PerformanceAuditHistoryEntry> = emptyList(),
    val lastTimestamp: String? = null,
    val lastId: Long? = null,
    val error: String? = null,
)
