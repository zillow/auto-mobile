package dev.jasonpearson.automobile.ideplugin.daemon.unified

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement

/**
 * Typed client facade for the performance domain.
 *
 * Methods:
 * - poll: Get performance audit results since cursor
 *
 * Events:
 * - subscribeToMetrics: Real-time performance data
 */
class PerformanceClient(private val client: UnifiedSocketClient) {
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Poll for performance audit results.
     */
    suspend fun poll(
        sinceTimestamp: String? = null,
        sinceId: Int? = null,
        startTime: String? = null,
        endTime: String? = null,
        limit: Int? = null,
        deviceId: String? = null,
        sessionId: String? = null,
        packageName: String? = null,
    ): PollPerformanceResult {
        val params = buildMap<String, JsonElement> {
            sinceTimestamp?.let { put("sinceTimestamp", json.encodeToJsonElement(it)) }
            sinceId?.let { put("sinceId", json.encodeToJsonElement(it)) }
            startTime?.let { put("startTime", json.encodeToJsonElement(it)) }
            endTime?.let { put("endTime", json.encodeToJsonElement(it)) }
            limit?.let { put("limit", json.encodeToJsonElement(it)) }
            deviceId?.let { put("deviceId", json.encodeToJsonElement(it)) }
            sessionId?.let { put("sessionId", json.encodeToJsonElement(it)) }
            packageName?.let { put("packageName", json.encodeToJsonElement(it)) }
        }

        val result: JsonElement = client.request(
            domain = Domains.PERFORMANCE,
            method = "poll",
            params = if (params.isEmpty()) null else json.encodeToJsonElement(params),
        )

        return json.decodeFromJsonElement(result)
    }

    /**
     * Subscribe to real-time performance metrics.
     */
    fun subscribeToMetrics(
        deviceId: String? = null,
        packageName: String? = null,
    ): Flow<LivePerformanceEvent> {
        val params = buildMap<String, JsonElement> {
            deviceId?.let { put("deviceId", json.encodeToJsonElement(it)) }
            packageName?.let { put("packageName", json.encodeToJsonElement(it)) }
        }

        return client.subscribe(
            domain = Domains.PERFORMANCE,
            event = "performance_push",
            params = if (params.isEmpty()) null else json.encodeToJsonElement(params),
        ).map { message ->
            json.decodeFromJsonElement(message.result ?: throw IllegalStateException("No result in push"))
        }
    }
}

@Serializable
data class PerformanceAuditEntry(
    val id: Int,
    val sessionId: String,
    val deviceId: String,
    val packageName: String,
    val timestamp: String,
    val nodeId: Int? = null,
    val screenName: String? = null,
    val fps: Float? = null,
    val frameTimeMs: Float? = null,
    val jankFrames: Int? = null,
    val touchLatencyMs: Float? = null,
    val ttffMs: Float? = null,
    val ttiMs: Float? = null,
)

@Serializable
data class PollPerformanceResult(
    val results: List<PerformanceAuditEntry> = emptyList(),
    val lastTimestamp: String? = null,
    val lastId: Int? = null,
)

@Serializable
data class PerformanceMetrics(
    val fps: Float? = null,
    val frameTimeMs: Float? = null,
    val jankFrames: Int? = null,
    val touchLatencyMs: Float? = null,
    val ttffMs: Float? = null,
    val ttiMs: Float? = null,
    val cpuUsagePercent: Float? = null,
    val memoryUsageMb: Float? = null,
)

@Serializable
data class PerformanceThresholds(
    val fpsWarning: Float = 55f,
    val fpsCritical: Float = 45f,
    val frameTimeWarning: Float = 18f,
    val frameTimeCritical: Float = 33f,
    val jankWarning: Int = 5,
    val jankCritical: Int = 10,
    val touchLatencyWarning: Float = 100f,
    val touchLatencyCritical: Float = 200f,
    val ttffWarning: Float = 500f,
    val ttffCritical: Float = 1000f,
    val ttiWarning: Float = 700f,
    val ttiCritical: Float = 1500f,
)

@Serializable
data class LivePerformanceEvent(
    val deviceId: String,
    val packageName: String,
    val timestamp: Long,
    val nodeId: Int? = null,
    val screenName: String? = null,
    val metrics: PerformanceMetrics,
    val thresholds: PerformanceThresholds,
    val health: String, // "healthy" | "warning" | "critical"
)
