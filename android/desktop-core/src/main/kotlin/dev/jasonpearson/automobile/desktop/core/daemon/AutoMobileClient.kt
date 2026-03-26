package dev.jasonpearson.automobile.desktop.core.daemon

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonPrimitive

interface AutoMobileClient {
  val transportName: String
  val connectionDescription: String

  fun ping()

  fun listResources(): List<McpResource>

  fun listResourceTemplates(): List<McpResourceTemplate>

  fun listTools(): List<McpTool>

  fun readResource(uri: String): List<McpResourceContent>

  fun getNavigationGraph(platform: String = "android"): JsonElement

  fun listFeatureFlags(): List<FeatureFlagState>

  fun setFeatureFlag(key: String, enabled: Boolean, config: JsonObject? = null): FeatureFlagState

  fun listPerformanceAuditResults(
      startTime: String? = null,
      endTime: String? = null,
      limit: Int? = null,
      offset: Int? = null,
  ): PerformanceAuditHistoryResult

  fun getTestTimings(query: TestTimingQuery = TestTimingQuery()): TestTimingSummary

  fun getTestRuns(query: TestRunQuery = TestRunQuery()): TestRunSummary

  fun startTestRecording(platform: String = "android"): TestRecordingStartResult

  fun stopTestRecording(
      recordingId: String? = null,
      planName: String? = null,
  ): TestRecordingStopResult

  fun executePlan(
      planContent: String,
      platform: String = "android",
      startStep: Int? = null,
      sessionUuid: String? = null,
  ): ExecutePlanResult

  fun startDevice(
      name: String,
      platform: String,
      deviceId: String? = null,
  ): StartDeviceResult

  fun setActiveDevice(deviceId: String, platform: String): SetActiveDeviceResult

  fun observe(platform: String = "android"): ObserveResult

  fun killDevice(name: String, deviceId: String, platform: String): KillDeviceResult

  fun getDaemonStatus(): dev.jasonpearson.automobile.desktop.core.mcp.DaemonStatusResponse

  fun updateService(deviceId: String, platform: String): UpdateServiceResult

  fun setKeyValue(
      deviceId: String,
      appId: String,
      fileName: String,
      key: String,
      value: String?,
      type: String,
  ): SetKeyValueResult

  fun removeKeyValue(
      deviceId: String,
      appId: String,
      fileName: String,
      key: String,
  ): RemoveKeyValueResult

  fun clearKeyValueFile(
      deviceId: String,
      appId: String,
      fileName: String,
  ): ClearKeyValueResult

  fun callTool(name: String, arguments: JsonObject): JsonElement

  fun close() {}
}

@Serializable
data class KillDeviceResult(
    val success: Boolean = true,
    val message: String? = null,
)

@Serializable
data class UpdateServiceResult(
    val success: Boolean = true,
    val message: String? = null,
)

@Serializable
data class SetKeyValueResult(
    val success: Boolean = true,
    val message: String? = null,
)

@Serializable
data class RemoveKeyValueResult(
    val success: Boolean = true,
    val message: String? = null,
)

@Serializable
data class ClearKeyValueResult(
    val success: Boolean = true,
    val message: String? = null,
)

@Serializable
data class StartDeviceResult(
    val success: Boolean = true,
    val deviceId: String? = null,
    val message: String? = null,
)

@Serializable
data class SetActiveDeviceResult(
    val success: Boolean = true,
    val message: String? = null,
)

@Serializable
data class ObserveResult(
    val updatedAt: Long? = null,
    val screenSize: ObserveScreenSize? = null,
    val viewHierarchy: JsonElement? = null,
    /** Display rotation: 0=portrait, 1=landscape 90deg, 2=reverse portrait, 3=reverse landscape */
    val rotation: Int? = null,
)

@Serializable
data class ObserveScreenSize(
    val width: Int? = null,
    val height: Int? = null,
)

open class McpConnectionException(message: String, cause: Throwable? = null) :
    Exception(message, cause)

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
data class McpTool(
    val name: String,
    val description: String? = null,
    val inputSchema: JsonObject? = null,
)

@Serializable
data class McpResourceContent(
    val uri: String,
    val mimeType: String? = null,
    val text: String? = null,
    val blob: String? = null,
)

@Serializable
data class McpToolContent(
    val type: String,
    val text: String? = null,
)

@Serializable
data class McpToolResponse(
    val content: List<McpToolContent>,
)

@Serializable
data class FeatureFlagState(
    val key: String,
    val label: String,
    val description: String? = null,
    val enabled: Boolean,
    val config: JsonObject? = null,
)

@Serializable
data class FeatureFlagListResult(
    val flags: List<FeatureFlagState>,
)

@Serializable
data class JsonRpcRequest(
    val jsonrpc: String = "2.0",
    val id: JsonElement? = null,
    val method: String,
    val params: JsonElement? = null,
)

@Serializable
data class JsonRpcResponse(
    val jsonrpc: String,
    val id: JsonElement? = null,
    val result: JsonElement? = null,
    val error: JsonRpcError? = null,
)

@Serializable
data class JsonRpcError(
    val code: Int,
    val message: String,
)

@Serializable internal data class ListResourcesResult(val resources: List<McpResource>)

@Serializable
internal data class ListResourceTemplatesResult(val resourceTemplates: List<McpResourceTemplate>)

@Serializable internal data class ListToolsResult(val tools: List<McpTool>)

@Serializable internal data class ReadResourceResult(val contents: List<McpResourceContent>)

internal const val LATEST_MCP_PROTOCOL_VERSION = "2025-11-25"

internal fun <T> decodeToolResponse(
    json: Json,
    element: JsonElement,
    serializer: KSerializer<T>,
): T {
  val response = json.decodeFromJsonElement(McpToolResponse.serializer(), element)
  val text =
      response.content.firstOrNull { it.type == "text" }?.text
          ?: throw McpConnectionException("Tool response missing text content")
  return json.decodeFromString(serializer, text)
}

internal fun <T> decodeResourceResponse(
    json: Json,
    contents: List<McpResourceContent>,
    serializer: KSerializer<T>,
): T {
  val text =
      contents.firstOrNull { !it.text.isNullOrBlank() }?.text
          ?: throw McpConnectionException("Resource response missing text content")
  val element = json.decodeFromString(JsonElement.serializer(), text)
  val error = (element as? JsonObject)?.get("error")?.jsonPrimitive?.content
  if (!error.isNullOrBlank()) {
    throw McpConnectionException(error)
  }
  return json.decodeFromJsonElement(serializer, element)
}
