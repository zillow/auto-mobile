package com.automobile.ide.daemon

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement

interface AutoMobileClient {
  val transportName: String
  val connectionDescription: String

  fun ping()

  fun listResources(): List<McpResource>

  fun listResourceTemplates(): List<McpResourceTemplate>

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
  fun close() {}
}

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

@Serializable internal data class ReadResourceResult(val contents: List<McpResourceContent>)

internal const val LATEST_MCP_PROTOCOL_VERSION = "2025-11-25"

internal fun <T> decodeToolResponse(
    json: Json,
    element: JsonElement,
    serializer: KSerializer<T>,
): T {
  val response = json.decodeFromJsonElement(McpToolResponse.serializer(), element)
  val text = response.content.firstOrNull { it.type == "text" }?.text
      ?: throw McpConnectionException("Tool response missing text content")
  return json.decodeFromString(serializer, text)
}
