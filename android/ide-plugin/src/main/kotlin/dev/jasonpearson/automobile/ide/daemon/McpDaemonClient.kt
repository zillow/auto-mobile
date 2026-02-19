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
import kotlinx.serialization.json.JsonNull
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

  private val testRecordingClient = TestRecordingSocketClient()

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

  override fun listTools(): List<McpTool> {
    val response = sendRequest("tools/list")
    ensureSuccess(response)
    val result = json.decodeFromJsonElement(ListToolsResult.serializer(), response.result!!)
    return result.tools
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
    val response = sendRequest("ide/listFeatureFlags")
    ensureSuccess(response)
    val result = json.decodeFromJsonElement(FeatureFlagListResult.serializer(), response.result!!)
    return result.flags
  }

  override fun setFeatureFlag(
      key: String,
      enabled: Boolean,
      config: JsonObject?,
  ): FeatureFlagState {
    val response =
        sendRequest(
            "ide/setFeatureFlag",
            buildJsonObject {
              put("key", JsonPrimitive(key))
              put("enabled", JsonPrimitive(enabled))
              if (config != null) {
                put("config", config)
              }
            },
        )
    ensureSuccess(response)
    return json.decodeFromJsonElement(FeatureFlagState.serializer(), response.result!!)
  }

  override fun listPerformanceAuditResults(
      startTime: String?,
      endTime: String?,
      limit: Int?,
      offset: Int?,
  ): PerformanceAuditHistoryResult {
    val uri = buildPerformanceResultsUri(startTime, endTime, limit, offset)
    val contents = readResource(uri)
    return decodePerformanceAuditResource(json, contents)
  }

  override fun getTestTimings(query: TestTimingQuery): TestTimingSummary {
    val contents = readResource(query.toResourceUri())
    return decodeResourceResponse(json, contents, TestTimingSummary.serializer())
  }

  override fun getTestRuns(query: TestRunQuery): TestRunSummary {
    val contents = readResource(query.toResourceUri())
    return decodeResourceResponse(json, contents, TestRunSummary.serializer())
  }

  override fun startTestRecording(platform: String): TestRecordingStartResult {
    return testRecordingClient.startTestRecording(platform)
  }

  override fun stopTestRecording(
      recordingId: String?,
      planName: String?,
  ): TestRecordingStopResult {
    val resolvedPlanName = planName?.ifBlank { null }
    return testRecordingClient.stopTestRecording(recordingId, resolvedPlanName)
  }

  override fun executePlan(
      planContent: String,
      platform: String,
      startStep: Int?,
      sessionUuid: String?,
  ): ExecutePlanResult {
    val response =
        callTool(
            "executePlan",
            buildJsonObject {
              put("planContent", JsonPrimitive(planContent))
              put("platform", JsonPrimitive(platform))
              if (startStep != null) {
                put("startStep", JsonPrimitive(startStep))
              }
              if (!sessionUuid.isNullOrBlank()) {
                put("sessionUuid", JsonPrimitive(sessionUuid))
              }
            },
        )
    return decodeToolResponse(json, response, ExecutePlanResult.serializer())
  }

  override fun startDevice(name: String, platform: String, deviceId: String?): StartDeviceResult {
    val response =
        callTool(
            "startDevice",
            buildJsonObject {
              put(
                  "device",
                  buildJsonObject {
                    put("name", JsonPrimitive(name))
                    put("platform", JsonPrimitive(platform))
                    if (deviceId != null) {
                      put("deviceId", JsonPrimitive(deviceId))
                    }
                  },
              )
            },
        )
    return try {
      decodeToolResponse(json, response, StartDeviceResult.serializer())
    } catch (e: Exception) {
      StartDeviceResult(success = false, message = e.message ?: "Failed to start device")
    }
  }

  override fun setActiveDevice(deviceId: String, platform: String): SetActiveDeviceResult {
    val response =
        callTool(
            "setActiveDevice",
            buildJsonObject {
              put("deviceId", JsonPrimitive(deviceId))
              put("platform", JsonPrimitive(platform))
            },
        )
    return try {
      decodeToolResponse(json, response, SetActiveDeviceResult.serializer())
    } catch (e: Exception) {
      SetActiveDeviceResult(success = false, message = e.message ?: "Failed to set active device")
    }
  }

  override fun observe(platform: String): ObserveResult {
    val response =
        callTool(
            "observe",
            buildJsonObject {
              put("platform", JsonPrimitive(platform))
            },
        )
    return try {
      decodeToolResponse(json, response, ObserveResult.serializer())
    } catch (e: Exception) {
      ObserveResult()
    }
  }

  override fun killDevice(name: String, deviceId: String, platform: String): KillDeviceResult {
    val response =
        callTool(
            "killDevice",
            buildJsonObject {
              put(
                  "device",
                  buildJsonObject {
                    put("name", JsonPrimitive(name))
                    put("deviceId", JsonPrimitive(deviceId))
                    put("platform", JsonPrimitive(platform))
                  },
              )
            },
        )
    return try {
      decodeToolResponse(json, response, KillDeviceResult.serializer())
    } catch (e: Exception) {
      KillDeviceResult(success = false, message = e.message ?: "Failed to kill device")
    }
  }

  override fun getDaemonStatus(): dev.jasonpearson.automobile.ide.mcp.DaemonStatusResponse {
    val response = sendRequest("ide/status")
    ensureSuccess(response)
    return json.decodeFromJsonElement(
        dev.jasonpearson.automobile.ide.mcp.DaemonStatusResponse.serializer(),
        response.result!!,
    )
  }

  override fun updateService(deviceId: String, platform: String): UpdateServiceResult {
    val response =
        sendRequest(
            "ide/updateService",
            buildJsonObject {
              put("deviceId", JsonPrimitive(deviceId))
              put("platform", JsonPrimitive(platform))
            },
        )
    ensureSuccess(response)
    return json.decodeFromJsonElement(UpdateServiceResult.serializer(), response.result!!)
  }

  override fun setKeyValue(
      deviceId: String,
      appId: String,
      fileName: String,
      key: String,
      value: String?,
      type: String,
  ): SetKeyValueResult {
    val response =
        sendRequest(
            "ide/setKeyValue",
            buildJsonObject {
              put("deviceId", JsonPrimitive(deviceId))
              put("appId", JsonPrimitive(appId))
              put("fileName", JsonPrimitive(fileName))
              put("key", JsonPrimitive(key))
              put("value", if (value != null) JsonPrimitive(value) else JsonNull)
              put("type", JsonPrimitive(type))
            },
        )
    ensureSuccess(response)
    return try {
      json.decodeFromJsonElement(SetKeyValueResult.serializer(), response.result!!)
    } catch (e: Exception) {
      SetKeyValueResult(success = false, message = e.message ?: "Failed to set key value")
    }
  }

  override fun removeKeyValue(
      deviceId: String,
      appId: String,
      fileName: String,
      key: String,
  ): RemoveKeyValueResult {
    val response =
        sendRequest(
            "ide/removeKeyValue",
            buildJsonObject {
              put("deviceId", JsonPrimitive(deviceId))
              put("appId", JsonPrimitive(appId))
              put("fileName", JsonPrimitive(fileName))
              put("key", JsonPrimitive(key))
            },
        )
    ensureSuccess(response)
    return try {
      json.decodeFromJsonElement(RemoveKeyValueResult.serializer(), response.result!!)
    } catch (e: Exception) {
      RemoveKeyValueResult(success = false, message = e.message ?: "Failed to remove key value")
    }
  }

  override fun clearKeyValueFile(
      deviceId: String,
      appId: String,
      fileName: String,
  ): ClearKeyValueResult {
    val response =
        sendRequest(
            "ide/clearKeyValueFile",
            buildJsonObject {
              put("deviceId", JsonPrimitive(deviceId))
              put("appId", JsonPrimitive(appId))
              put("fileName", JsonPrimitive(fileName))
            },
        )
    ensureSuccess(response)
    return try {
      json.decodeFromJsonElement(ClearKeyValueResult.serializer(), response.result!!)
    } catch (e: Exception) {
      ClearKeyValueResult(success = false, message = e.message ?: "Failed to clear key value file")
    }
  }

  override fun callTool(name: String, arguments: JsonObject): JsonElement {
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
