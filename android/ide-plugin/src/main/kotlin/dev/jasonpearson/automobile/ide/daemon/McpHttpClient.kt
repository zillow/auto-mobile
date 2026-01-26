package dev.jasonpearson.automobile.ide.daemon

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.UUID
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

class McpHttpClient(
    private val endpoint: String,
    private val json: Json = Json { ignoreUnknownKeys = true },
) : AutoMobileClient {
  override val transportName: String = "MCP HTTP"
  override val connectionDescription: String = endpoint
  private val testRecordingClient = TestRecordingSocketClient()

  private val httpClient = HttpClient.newBuilder().build()
  private var sessionId: String? = null
  private var protocolVersion: String? = null
  private var initialized = false

  override fun ping() {
    ensureInitialized()
  }

  override fun listResources(): List<McpResource> {
    ensureInitialized()
    val response = sendRequest("resources/list")
    val result = json.decodeFromJsonElement(ListResourcesResult.serializer(), response.result!!)
    return result.resources
  }

  override fun listResourceTemplates(): List<McpResourceTemplate> {
    ensureInitialized()
    val response = sendRequest("resources/list-templates")
    val result =
        json.decodeFromJsonElement(ListResourceTemplatesResult.serializer(), response.result!!)
    return result.resourceTemplates
  }

  override fun listTools(): List<McpTool> {
    ensureInitialized()
    val response = sendRequest("tools/list")
    val result = json.decodeFromJsonElement(ListToolsResult.serializer(), response.result!!)
    return result.tools
  }

  override fun readResource(uri: String): List<McpResourceContent> {
    ensureInitialized()
    val response =
        sendRequest(
            "resources/read",
            buildJsonObject { put("uri", JsonPrimitive(uri)) },
        )
    val result = json.decodeFromJsonElement(ReadResourceResult.serializer(), response.result!!)
    return result.contents
  }

  override fun getNavigationGraph(platform: String): JsonElement {
    val response =
        callTool(
            "getNavigationGraph",
            buildJsonObject { put("platform", JsonPrimitive(platform)) },
        )
    return response
  }

  override fun listFeatureFlags(): List<FeatureFlagState> {
    val response = callTool("listFeatureFlags", JsonObject(emptyMap()))
    val result = decodeToolResponse(json, response, FeatureFlagListResult.serializer())
    return result.flags
  }

  override fun setFeatureFlag(
      key: String,
      enabled: Boolean,
      config: JsonObject?,
  ): FeatureFlagState {
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

  private fun callTool(name: String, arguments: JsonObject): JsonElement {
    ensureInitialized()
    val response =
        sendRequest(
            "tools/call",
            buildJsonObject {
              put("name", JsonPrimitive(name))
              put("arguments", arguments)
            },
        )
    return response.result ?: JsonObject(emptyMap())
  }

  private fun ensureInitialized() {
    if (initialized) {
      return
    }

    val response =
        sendRequest(
            "initialize",
            buildJsonObject {
              put("protocolVersion", JsonPrimitive(LATEST_MCP_PROTOCOL_VERSION))
              put("capabilities", JsonObject(emptyMap()))
              put(
                  "clientInfo",
                  buildJsonObject {
                    put("name", JsonPrimitive("auto-mobile-ide-plugin"))
                    put("version", JsonPrimitive("0.1.0"))
                  },
              )
            },
            includeSession = false,
        )

    val result =
        response.result?.jsonObject
            ?: throw McpConnectionException("Initialize response missing result")
    protocolVersion =
        result["protocolVersion"]?.jsonPrimitive?.content ?: LATEST_MCP_PROTOCOL_VERSION
    initialized = true

    sendNotification("notifications/initialized")
  }

  private fun sendNotification(method: String, params: JsonElement? = null) {
    val request =
        JsonRpcRequest(
            id = null,
            method = method,
            params = params,
        )
    sendRequest(request, includeSession = true, expectResponse = false)
  }

  private fun sendRequest(
      method: String,
      params: JsonElement? = null,
      includeSession: Boolean = true,
  ): JsonRpcResponse {
    val requestId = JsonPrimitive(UUID.randomUUID().toString())
    val request =
        JsonRpcRequest(
            id = requestId,
            method = method,
            params = params,
        )
    return sendRequest(request, includeSession = includeSession, expectResponse = true)
  }

  private fun sendRequest(
      request: JsonRpcRequest,
      includeSession: Boolean,
      expectResponse: Boolean,
  ): JsonRpcResponse {
    val requestBody = json.encodeToString(JsonRpcRequest.serializer(), request)
    val builder =
        HttpRequest.newBuilder(URI.create(endpoint)).header("Content-Type", "application/json")

    if (includeSession && sessionId != null) {
      builder.header("mcp-session-id", sessionId!!)
    }
    if (protocolVersion != null) {
      builder.header("mcp-protocol-version", protocolVersion!!)
    }

    val response =
        httpClient.send(
            builder.POST(HttpRequest.BodyPublishers.ofString(requestBody)).build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    response.headers().firstValue("mcp-session-id").ifPresent { header ->
      if (header.isNotBlank()) {
        sessionId = header
      }
    }

    if (!expectResponse) {
      return JsonRpcResponse(jsonrpc = "2.0")
    }

    val body = response.body().trim()
    if (body.isEmpty()) {
      throw McpConnectionException("MCP HTTP response was empty")
    }

    val rpcResponse = json.decodeFromString(JsonRpcResponse.serializer(), body)
    if (rpcResponse.error != null) {
      throw McpConnectionException(
          "MCP HTTP error ${rpcResponse.error.code}: ${rpcResponse.error.message}"
      )
    }
    if (rpcResponse.result == null) {
      throw McpConnectionException("MCP HTTP response missing result")
    }
    return rpcResponse
  }
}
