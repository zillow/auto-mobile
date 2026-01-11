package dev.jasonpearson.automobile.ide.daemon

import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonPrimitive

@Serializable
data class PerformanceAuditMetrics(
    val p50Ms: Double? = null,
    val p90Ms: Double? = null,
    val p95Ms: Double? = null,
    val p99Ms: Double? = null,
    val jankCount: Int? = null,
    val missedVsyncCount: Int? = null,
    val slowUiThreadCount: Int? = null,
    val frameDeadlineMissedCount: Int? = null,
    val cpuUsagePercent: Double? = null,
    val touchLatencyMs: Double? = null,
)

@Serializable
data class PerformanceAuditHistoryEntry(
    val id: Long,
    val deviceId: String,
    val sessionId: String,
    val packageName: String,
    val timestamp: String,
    val passed: Boolean,
    val metrics: PerformanceAuditMetrics,
    val diagnostics: String? = null,
)

@Serializable
data class PerformanceAuditHistoryRange(
    val startTime: String,
    val endTime: String,
)

@Serializable
data class PerformanceAuditHistoryResult(
    val results: List<PerformanceAuditHistoryEntry> = emptyList(),
    val toolCalls: List<String> = emptyList(),
    val hasMore: Boolean = false,
    val nextOffset: Int? = null,
    val range: PerformanceAuditHistoryRange? = null,
)

internal const val PERFORMANCE_RESULTS_RESOURCE_URI = "automobile:performance-results"

internal fun buildPerformanceResultsUri(
    startTime: String?,
    endTime: String?,
    limit: Int?,
    offset: Int?,
): String {
  val params = mutableListOf<Pair<String, String>>()
  if (!startTime.isNullOrBlank()) {
    params.add("startTime" to startTime)
  }
  if (!endTime.isNullOrBlank()) {
    params.add("endTime" to endTime)
  }
  if (limit != null) {
    params.add("limit" to limit.toString())
  }
  if (offset != null) {
    params.add("offset" to offset.toString())
  }
  if (params.isEmpty()) {
    return PERFORMANCE_RESULTS_RESOURCE_URI
  }
  val query =
      params.joinToString("&") { (key, value) ->
        "$key=${URLEncoder.encode(value, StandardCharsets.UTF_8)}"
      }
  return "$PERFORMANCE_RESULTS_RESOURCE_URI?$query"
}

internal fun decodePerformanceAuditResource(
    json: Json,
    contents: List<McpResourceContent>,
): PerformanceAuditHistoryResult {
  val payload = contents.firstOrNull()?.text?.trim().orEmpty()
  if (payload.isBlank()) {
    throw McpConnectionException("Performance resource returned no data.")
  }

  val jsonElement = json.parseToJsonElement(payload)
  if (jsonElement is JsonObject) {
    val errorMessage = jsonElement["error"]?.jsonPrimitive?.contentOrNull
    if (!errorMessage.isNullOrBlank()) {
      throw McpConnectionException(errorMessage)
    }
  }

  return json.decodeFromJsonElement(PerformanceAuditHistoryResult.serializer(), jsonElement)
}
