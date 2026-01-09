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
import java.util.UUID
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement

class McpDaemonClient(
    private val socketPathValue: String = DaemonSocketPaths.socketPath(),
    private val json: Json = Json { ignoreUnknownKeys = true },
) : AutoMobileClient {
  val socketPath: String
    get() = socketPathValue

  override val transportName: String = "Unix Socket"
  override val connectionDescription: String
    get() = socketPathValue

  override fun ping() {
    val response = sendRequest("ide/ping")
    ensureSuccess(response)
  }

  override fun listResources(): List<McpResource> {
    val response = sendRequest("resources/list")
    ensureSuccess(response)
    val result = json.decodeFromJsonElement(ListResourcesResult.serializer(), response.result!!)
    return result.resources
  }

  override fun listResourceTemplates(): List<McpResourceTemplate> {
    val response = sendRequest("resources/list-templates")
    ensureSuccess(response)
    val result =
        json.decodeFromJsonElement(ListResourceTemplatesResult.serializer(), response.result!!)
    return result.resourceTemplates
  }

  override fun readResource(uri: String): List<McpResourceContent> {
    val response =
        sendRequest(
            "resources/read",
            buildJsonObject { put("uri", JsonPrimitive(uri)) },
        )
    ensureSuccess(response)
    val result = json.decodeFromJsonElement(ReadResourceResult.serializer(), response.result!!)
    return result.contents
  }

  override fun getNavigationGraph(platform: String): JsonElement {
    val response =
        sendRequest(
            "ide/getNavigationGraph",
            buildJsonObject { put("platform", JsonPrimitive(platform)) },
        )
    ensureSuccess(response)
    return response.result ?: JsonObject(emptyMap())
  }

  override fun listFeatureFlags(): List<FeatureFlagState> {
    val response = callTool("listFeatureFlags", JsonObject(emptyMap()))
    val result = decodeToolResponse(json, response, FeatureFlagListResult.serializer())
    return result.flags
  }

  override fun setFeatureFlag(key: String, enabled: Boolean, config: JsonObject?): FeatureFlagState {
    val response =
        callTool(
            "setFeatureFlag",
            buildJsonObject {
              put("key", JsonPrimitive(key))
              put("enabled", JsonPrimitive(enabled))
              if (config != null) {
                put("config", config)
              }
            },
        )
    return decodeToolResponse(json, response, FeatureFlagState.serializer())
  }

  override fun listPerformanceAuditResults(
      startTime: String?,
      endTime: String?,
      limit: Int?,
      offset: Int?,
  ): PerformanceAuditHistoryResult {
    val response =
        callTool(
            "listPerformanceAuditResults",
            buildJsonObject {
              if (startTime != null) {
                put("startTime", JsonPrimitive(startTime))
              }
              if (endTime != null) {
                put("endTime", JsonPrimitive(endTime))
              }
              if (limit != null) {
                put("limit", JsonPrimitive(limit))
              }
              if (offset != null) {
                put("offset", JsonPrimitive(offset))
              }
            },
    )
    return decodeToolResponse(json, response, PerformanceAuditHistoryResult.serializer())
  }

  override fun getTestTimings(query: TestTimingQuery): TestTimingSummary {
    val response = callTool("getTestTimings", query.toJsonObject())
    return decodeToolResponse(json, response, TestTimingSummary.serializer())
  }

  private fun callTool(name: String, arguments: JsonObject): JsonElement {
    val response =
        sendRequest(
            "tools/call",
            buildJsonObject {
              put("name", JsonPrimitive(name))
              put("arguments", arguments)
            },
        )
    ensureSuccess(response)
    return response.result ?: JsonObject(emptyMap())
  }

  private fun sendRequest(
      method: String,
      params: JsonObject = JsonObject(emptyMap()),
  ): DaemonResponse {
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

      val request =
          DaemonRequest(
              id = UUID.randomUUID().toString(),
              type = "mcp_request",
              method = method,
              params = params,
          )

      writer.write(json.encodeToString(request))
      writer.newLine()
      writer.flush()

      val line = reader.readLine() ?: throw DaemonUnavailableException("Daemon closed the socket")
      return json.decodeFromString(line)
    }
  }

  private fun ensureSocketExists() {
    val path = File(socketPathValue).toPath()
    if (!Files.exists(path)) {
      throw DaemonUnavailableException("Daemon socket not found at $socketPathValue")
    }
  }

  private fun ensureSuccess(response: DaemonResponse) {
    if (!response.success) {
      throw DaemonUnavailableException(response.error ?: "Daemon request failed")
    }
    if (response.result == null) {
      throw DaemonUnavailableException("Daemon response missing result")
    }
  }
}

object DaemonSocketPaths {
  fun socketPath(): String {
    val userId = getUserId()
    return "/tmp/auto-mobile-daemon-$userId.sock"
  }

  private fun getUserId(): String {
    val userName = System.getProperty("user.name", "default").ifBlank { "default" }
    val osName = System.getProperty("os.name", "").lowercase()
    if (osName.contains("win")) {
      return userName
    }

    return try {
      val process = ProcessBuilder("id", "-u").start()
      val completed = process.waitFor(2, java.util.concurrent.TimeUnit.SECONDS)
      if (!completed) {
        process.destroy()
        return userName
      }
      val uid = process.inputStream.bufferedReader().readText().trim()
      if (uid.isNotEmpty()) uid else userName
    } catch (e: Exception) {
      userName
    }
  }
}

@Serializable
private data class DaemonRequest(
    val id: String,
    val type: String,
    val method: String,
    val params: JsonObject,
)

@Serializable
data class DaemonResponse(
    val id: String,
    val type: String,
    val success: Boolean,
    val result: JsonElement? = null,
    val error: String? = null,
)

class DaemonUnavailableException(message: String) : McpConnectionException(message)
