package dev.jasonpearson.automobile.ide.daemon

import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.util.UUID
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

class McpStdioClient(
    private val command: String,
    private val json: Json = Json { ignoreUnknownKeys = true },
) : AutoMobileClient {
  override val transportName: String = "MCP STDIO"
  override val connectionDescription: String = command
  private val testRecordingClient = TestRecordingSocketClient()

  private var process: Process? = null
  private var reader: BufferedReader? = null
  private var writer: BufferedWriter? = null
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
    val response = callTool(
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

  override fun setFeatureFlag(key: String, enabled: Boolean, config: JsonObject?): FeatureFlagState {
    val response = callTool(
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
    val response = callTool(
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

  override fun close() {
    try {
      writer?.flush()
    } catch (_: Exception) {}
    process?.destroy()
    process = null
    reader = null
    writer = null
  }

  private fun ensureInitialized() {
    if (initialized) {
      return
    }
    ensureProcessStarted()

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
        )
    if (response.result == null) {
      throw McpConnectionException("Initialize response missing result")
    }
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
    sendRequest(request, expectResponse = false)
  }

  private fun sendRequest(method: String, params: JsonElement? = null): JsonRpcResponse {
    val requestId = JsonPrimitive(UUID.randomUUID().toString())
    val request =
        JsonRpcRequest(
            id = requestId,
            method = method,
            params = params,
        )
    return sendRequest(request, expectResponse = true)
  }

  private fun sendRequest(request: JsonRpcRequest, expectResponse: Boolean): JsonRpcResponse {
    ensureProcessStarted()
    val currentWriter = writer ?: throw McpConnectionException("MCP stdio writer unavailable")
    val currentReader = reader ?: throw McpConnectionException("MCP stdio reader unavailable")

    val requestBody = json.encodeToString(JsonRpcRequest.serializer(), request)
    currentWriter.write(requestBody)
    currentWriter.newLine()
    currentWriter.flush()

    if (!expectResponse) {
      return JsonRpcResponse(jsonrpc = "2.0")
    }

    val expectedId = request.id?.jsonPrimitive?.content
    while (true) {
      val line = currentReader.readLine() ?: throw McpConnectionException("MCP stdio closed")
      if (line.isBlank()) {
        continue
      }
      val response = json.decodeFromString(JsonRpcResponse.serializer(), line)
      val responseId = response.id?.jsonPrimitive?.content
      if (expectedId != null && responseId != expectedId) {
        continue
      }
      if (response.error != null) {
        throw McpConnectionException(
            "MCP stdio error ${response.error.code}: ${response.error.message}"
        )
      }
      if (response.result == null) {
        throw McpConnectionException("MCP stdio response missing result")
      }
      return response
    }
  }

  private fun ensureProcessStarted() {
    if (process != null) {
      return
    }

    val commandParts = parseCommand(command)
    if (commandParts.isEmpty()) {
      throw McpConnectionException("MCP stdio command is empty")
    }

    val newProcess =
        ProcessBuilder(commandParts).redirectError(ProcessBuilder.Redirect.INHERIT).start()
    process = newProcess
    reader = BufferedReader(InputStreamReader(newProcess.inputStream))
    writer = BufferedWriter(OutputStreamWriter(newProcess.outputStream))
  }

  private fun parseCommand(command: String): List<String> {
    val parts = mutableListOf<String>()
    val current = StringBuilder()
    var inSingle = false
    var inDouble = false
    var escapeNext = false

    fun flushCurrent() {
      if (current.isNotEmpty()) {
        parts.add(current.toString())
        current.clear()
      }
    }

    for (char in command) {
      if (escapeNext) {
        current.append(char)
        escapeNext = false
        continue
      }

      when (char) {
        '\\' -> {
          if (inDouble) {
            escapeNext = true
          } else {
            current.append(char)
          }
        }
        '\'' -> {
          if (!inDouble) {
            inSingle = !inSingle
          } else {
            current.append(char)
          }
        }
        '"' -> {
          if (!inSingle) {
            inDouble = !inDouble
          } else {
            current.append(char)
          }
        }
        ' ',
        '\t',
        '\n' -> {
          if (inSingle || inDouble) {
            current.append(char)
          } else {
            flushCurrent()
          }
        }
        else -> current.append(char)
      }
    }

    flushCurrent()
    return parts
  }
}
