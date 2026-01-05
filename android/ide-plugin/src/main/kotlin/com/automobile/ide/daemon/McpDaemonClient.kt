package com.automobile.ide.daemon

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
import kotlinx.serialization.SerialName
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
) {
  val socketPath: String
    get() = socketPathValue

  fun ping(): DaemonResponse {
    return sendRequest("ide/ping")
  }

  fun listResources(): List<McpResource> {
    val response = sendRequest("resources/list")
    ensureSuccess(response)
    val result = json.decodeFromJsonElement(ListResourcesResult.serializer(), response.result!!)
    return result.resources
  }

  fun listResourceTemplates(): List<McpResourceTemplate> {
    val response = sendRequest("resources/list-templates")
    ensureSuccess(response)
    val result = json.decodeFromJsonElement(ListResourceTemplatesResult.serializer(), response.result!!)
    return result.resourceTemplates
  }

  fun readResource(uri: String): List<McpResourceContent> {
    val response = sendRequest(
        "resources/read",
        buildJsonObject { put("uri", JsonPrimitive(uri)) },
    )
    ensureSuccess(response)
    val result = json.decodeFromJsonElement(ReadResourceResult.serializer(), response.result!!)
    return result.contents
  }

  fun getNavigationGraph(platform: String = "android"): JsonElement {
    val response = sendRequest(
        "ide/getNavigationGraph",
        buildJsonObject { put("platform", JsonPrimitive(platform)) },
    )
    ensureSuccess(response)
    return response.result ?: JsonObject(emptyMap())
  }

  private fun sendRequest(method: String, params: JsonObject = JsonObject(emptyMap())): DaemonResponse {
    ensureSocketExists()

    val address = UnixDomainSocketAddress.of(socketPathValue)
    SocketChannel.open(address).use { channel ->
      val reader = BufferedReader(InputStreamReader(Channels.newInputStream(channel), StandardCharsets.UTF_8))
      val writer = BufferedWriter(OutputStreamWriter(Channels.newOutputStream(channel), StandardCharsets.UTF_8))

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

class DaemonUnavailableException(message: String) : Exception(message)

@Serializable
data class McpResource(
    val uri: String,
    val name: String,
    val description: String? = null,
    val mimeType: String? = null,
)

@Serializable
data class McpResourceTemplate(
    @SerialName("uriTemplate") val uriTemplate: String,
    val name: String,
    val description: String? = null,
    val mimeType: String? = null,
)

@Serializable
data class McpResourceContent(
    val uri: String,
    val mimeType: String? = null,
    val text: String? = null,
    val blob: String? = null,
)

@Serializable
private data class ListResourcesResult(val resources: List<McpResource>)

@Serializable
private data class ListResourceTemplatesResult(val resourceTemplates: List<McpResourceTemplate>)

@Serializable
private data class ReadResourceResult(val contents: List<McpResourceContent>)
