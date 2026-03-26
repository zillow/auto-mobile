package dev.jasonpearson.automobile.desktop.core.unified

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement

/**
 * Typed client facade for the failures domain.
 *
 * Methods:
 * - pollNotifications: Get new failure notifications since cursor
 * - pollGroups: Get failure groups with optional filters
 * - pollTimeline: Get timeline data with aggregation
 * - acknowledge: Acknowledge notifications
 *
 * Events:
 * - subscribeToFailures: Real-time failure notifications
 */
class FailuresClient(private val client: UnifiedSocketClient) {
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Poll for new failure notifications.
     */
    suspend fun pollNotifications(
        sinceTimestamp: Long? = null,
        sinceId: Int? = null,
        startTime: Long? = null,
        endTime: Long? = null,
        dateRange: String? = null,
        type: String? = null,
        acknowledged: Boolean? = null,
        limit: Int? = null,
    ): PollNotificationsResult {
        val params = buildMap<String, JsonElement> {
            sinceTimestamp?.let { put("sinceTimestamp", json.encodeToJsonElement(it)) }
            sinceId?.let { put("sinceId", json.encodeToJsonElement(it)) }
            startTime?.let { put("startTime", json.encodeToJsonElement(it)) }
            endTime?.let { put("endTime", json.encodeToJsonElement(it)) }
            dateRange?.let { put("dateRange", json.encodeToJsonElement(it)) }
            type?.let { put("type", json.encodeToJsonElement(it)) }
            acknowledged?.let { put("acknowledged", json.encodeToJsonElement(it)) }
            limit?.let { put("limit", json.encodeToJsonElement(it)) }
        }

        val result: JsonElement = client.request(
            domain = Domains.FAILURES,
            method = "poll_notifications",
            params = if (params.isEmpty()) null else json.encodeToJsonElement(params),
        )

        return json.decodeFromJsonElement(result)
    }

    /**
     * Poll for failure groups.
     */
    suspend fun pollGroups(
        startTime: Long? = null,
        endTime: Long? = null,
        dateRange: String? = null,
        type: String? = null,
        severity: String? = null,
    ): PollGroupsResult {
        val params = buildMap<String, JsonElement> {
            startTime?.let { put("startTime", json.encodeToJsonElement(it)) }
            endTime?.let { put("endTime", json.encodeToJsonElement(it)) }
            dateRange?.let { put("dateRange", json.encodeToJsonElement(it)) }
            type?.let { put("type", json.encodeToJsonElement(it)) }
            severity?.let { put("severity", json.encodeToJsonElement(it)) }
        }

        val result: JsonElement = client.request(
            domain = Domains.FAILURES,
            method = "poll_groups",
            params = if (params.isEmpty()) null else json.encodeToJsonElement(params),
        )

        return json.decodeFromJsonElement(result)
    }

    /**
     * Poll for timeline data.
     */
    suspend fun pollTimeline(
        startTime: Long? = null,
        endTime: Long? = null,
        dateRange: String? = null,
        aggregation: String? = null,
    ): PollTimelineResult {
        val params = buildMap<String, JsonElement> {
            startTime?.let { put("startTime", json.encodeToJsonElement(it)) }
            endTime?.let { put("endTime", json.encodeToJsonElement(it)) }
            dateRange?.let { put("dateRange", json.encodeToJsonElement(it)) }
            aggregation?.let { put("aggregation", json.encodeToJsonElement(it)) }
        }

        val result: JsonElement = client.request(
            domain = Domains.FAILURES,
            method = "poll_timeline",
            params = if (params.isEmpty()) null else json.encodeToJsonElement(params),
        )

        return json.decodeFromJsonElement(result)
    }

    /**
     * Acknowledge failure notifications.
     */
    suspend fun acknowledge(notificationIds: List<Int>): AcknowledgeResult {
        val params = mapOf("notificationIds" to json.encodeToJsonElement(notificationIds))

        val result: JsonElement = client.request(
            domain = Domains.FAILURES,
            method = "acknowledge",
            params = json.encodeToJsonElement(params),
        )

        return json.decodeFromJsonElement(result)
    }

    /**
     * Subscribe to real-time failure notifications.
     */
    fun subscribeToFailures(
        type: String? = null,
        severity: String? = null,
    ): Flow<FailureNotificationEvent> {
        val params = buildMap<String, JsonElement> {
            type?.let { put("type", json.encodeToJsonElement(it)) }
            severity?.let { put("severity", json.encodeToJsonElement(it)) }
        }

        return client.subscribe(
            domain = Domains.FAILURES,
            event = "failure_occurred",
            params = if (params.isEmpty()) null else json.encodeToJsonElement(params),
        ).map { message ->
            json.decodeFromJsonElement(message.result ?: throw IllegalStateException("No result in push"))
        }
    }
}

@Serializable
data class FailureNotificationEntry(
    val id: Int,
    val occurrenceId: String,
    val groupId: String,
    val type: String,
    val severity: String,
    val title: String,
    val timestamp: Long,
    val acknowledged: Boolean,
)

@Serializable
data class PollNotificationsResult(
    val notifications: List<FailureNotificationEntry> = emptyList(),
    val lastTimestamp: Long? = null,
    val lastId: Int? = null,
)

@Serializable
data class FailureGroup(
    val groupId: String,
    val type: String,
    val severity: String,
    val title: String,
    val count: Int,
    val lastOccurrence: Long,
    val firstOccurrence: Long,
)

@Serializable
data class FailureTotals(
    val crashes: Int = 0,
    val anrs: Int = 0,
    val toolFailures: Int = 0,
)

@Serializable
data class PollGroupsResult(
    val groups: List<FailureGroup> = emptyList(),
    val totals: FailureTotals = FailureTotals(),
)

@Serializable
data class TimelineDataPoint(
    val timestamp: Long,
    val crashes: Int = 0,
    val anrs: Int = 0,
    val toolFailures: Int = 0,
)

@Serializable
data class PeriodTotals(
    val crashes: Int = 0,
    val anrs: Int = 0,
    val toolFailures: Int = 0,
)

@Serializable
data class PollTimelineResult(
    val dataPoints: List<TimelineDataPoint> = emptyList(),
    val previousPeriodTotals: PeriodTotals? = null,
)

@Serializable
data class AcknowledgeResult(
    val acknowledgedCount: Int = 0,
)

@Serializable
data class FailureNotificationEvent(
    val occurrenceId: String,
    val groupId: String,
    val type: String,
    val severity: String,
    val title: String,
    val message: String,
    val timestamp: Long,
)
