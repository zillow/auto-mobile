package dev.jasonpearson.automobile.desktop.core.failures

import dev.jasonpearson.automobile.desktop.core.daemon.FailureNotificationEntry
import dev.jasonpearson.automobile.desktop.core.daemon.FailuresGroupsRequest
import dev.jasonpearson.automobile.desktop.core.daemon.FailuresNotificationsRequest
import dev.jasonpearson.automobile.desktop.core.daemon.FailuresStreamClient
import dev.jasonpearson.automobile.desktop.core.daemon.FailuresStreamSocketClient
import dev.jasonpearson.automobile.desktop.core.daemon.FailuresTimelineRequest
import dev.jasonpearson.automobile.desktop.core.daemon.McpConnectionException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * Streaming-enabled data source for failures that uses Unix domain sockets
 * for efficient real-time updates and notifications.
 */
class StreamingFailuresDataSource(
    private val socketClient: FailuresStreamClient = FailuresStreamSocketClient(),
) : FailuresDataSource, StreamingFailuresDataSourceInterface {

    // Cursor state for polling
    private var lastNotificationTimestamp: Long? = null
    private var lastNotificationId: Long? = null

    override suspend fun getFailureGroups(): DataSourceResult<List<FailureGroup>> {
        return try {
            val response = socketClient.pollGroups(FailuresGroupsRequest())
            val groups = response.groups?.map { it.toModel() } ?: emptyList()
            DataSourceResult.Success(groups)
        } catch (e: McpConnectionException) {
            DataSourceResult.Error("Failures stream socket not available: ${e.message}", e)
        } catch (e: Exception) {
            DataSourceResult.Error("Failed to load failures: ${e.message}", e)
        }
    }

    override suspend fun getTimelineData(
        dateRange: DateRange,
        aggregation: TimeAggregation,
    ): DataSourceResult<TimelineData> {
        return try {
            val response = socketClient.pollTimeline(
                FailuresTimelineRequest(
                    dateRange = dateRange.toQueryParam(),
                    aggregation = aggregation.toQueryParam(),
                )
            )

            val dataPoints = response.dataPoints?.map {
                TimelineDataPoint(it.label, it.crashes, it.anrs, it.toolFailures, it.nonfatals)
            } ?: emptyList()

            val previousTotals = response.previousPeriodTotals?.let {
                PeriodTotals(it.crashes, it.anrs, it.toolFailures, it.nonfatals)
            } ?: PeriodTotals(0, 0, 0, 0)

            DataSourceResult.Success(TimelineData(dataPoints, previousTotals))
        } catch (e: McpConnectionException) {
            DataSourceResult.Error("Failures stream socket not available: ${e.message}", e)
        } catch (e: Exception) {
            DataSourceResult.Error("Failed to load timeline: ${e.message}", e)
        }
    }

    /**
     * Get failure groups with optional filters
     */
    suspend fun getFailureGroups(
        dateRange: DateRange? = null,
        type: FailureType? = null,
        severity: FailureSeverity? = null,
    ): DataSourceResult<FailureGroupsWithTotals> {
        return try {
            val response = socketClient.pollGroups(
                FailuresGroupsRequest(
                    dateRange = dateRange?.toQueryParam(),
                    type = type?.toQueryParam(),
                    severity = severity?.toQueryParam(),
                )
            )

            val groups = response.groups?.map { it.toModel() } ?: emptyList()
            val totals = response.totals?.let {
                FailureTotals(it.crashes, it.anrs, it.toolFailures, it.nonfatals)
            } ?: FailureTotals(0, 0, 0, 0)

            DataSourceResult.Success(FailureGroupsWithTotals(groups, totals))
        } catch (e: McpConnectionException) {
            DataSourceResult.Error("Failures stream socket not available: ${e.message}", e)
        } catch (e: Exception) {
            DataSourceResult.Error("Failed to load failures: ${e.message}", e)
        }
    }

    /**
     * Poll for new notifications since the last poll.
     * Returns only new notifications, updating the cursor internally.
     */
    suspend fun pollNewNotifications(
        type: FailureType? = null,
        limit: Int? = null,
    ): DataSourceResult<List<FailureNotification>> {
        return try {
            val response = socketClient.pollNotifications(
                FailuresNotificationsRequest(
                    sinceTimestamp = lastNotificationTimestamp,
                    sinceId = lastNotificationId,
                    type = type?.toQueryParam(),
                    acknowledged = false,
                    limit = limit,
                )
            )

            // Update cursor
            response.lastTimestamp?.let { lastNotificationTimestamp = it }
            response.lastId?.let { lastNotificationId = it }

            val notifications = response.notifications?.map { it.toModel() } ?: emptyList()
            DataSourceResult.Success(notifications)
        } catch (e: McpConnectionException) {
            DataSourceResult.Error("Failures stream socket not available: ${e.message}", e)
        } catch (e: Exception) {
            DataSourceResult.Error("Failed to poll notifications: ${e.message}", e)
        }
    }

    /**
     * Reset the notification cursor to start receiving all notifications
     */
    fun resetNotificationCursor() {
        lastNotificationTimestamp = null
        lastNotificationId = null
    }

    /**
     * Acknowledge notifications by their IDs
     */
    suspend fun acknowledgeNotifications(ids: List<Int>): DataSourceResult<Int> {
        if (ids.isEmpty()) return DataSourceResult.Success(0)

        return try {
            val response = socketClient.acknowledge(ids)
            DataSourceResult.Success(response.acknowledgedCount ?: 0)
        } catch (e: McpConnectionException) {
            DataSourceResult.Error("Failures stream socket not available: ${e.message}", e)
        } catch (e: Exception) {
            DataSourceResult.Error("Failed to acknowledge notifications: ${e.message}", e)
        }
    }

    /**
     * Create a flow that polls for new notifications at regular intervals.
     * Implements [StreamingFailuresDataSourceInterface.notificationsFlow].
     */
    override fun notificationsFlow(): Flow<DataSourceResult<List<FailureNotification>>> =
        notificationsFlowWithParams()

    /**
     * Create a flow that polls for new notifications at regular intervals with custom parameters.
     */
    fun notificationsFlowWithParams(
        pollIntervalMs: Long = 2000,
        type: FailureType? = null,
    ): Flow<DataSourceResult<List<FailureNotification>>> = flow {
        while (true) {
            val result = pollNewNotifications(type = type)
            emit(result)
            delay(pollIntervalMs)
        }
    }

    /**
     * Create a flow that polls for updated failure groups at regular intervals.
     * Implements [StreamingFailuresDataSourceInterface.failureGroupsFlow].
     */
    override fun failureGroupsFlow(): Flow<DataSourceResult<FailureGroupsWithTotals>> =
        failureGroupsFlowWithParams()

    /**
     * Create a flow that polls for updated failure groups at regular intervals with custom parameters.
     */
    fun failureGroupsFlowWithParams(
        pollIntervalMs: Long = 5000,
        dateRange: DateRange? = null,
        type: FailureType? = null,
    ): Flow<DataSourceResult<FailureGroupsWithTotals>> = flow {
        while (true) {
            val result = getFailureGroups(dateRange, type)
            emit(result)
            delay(pollIntervalMs)
        }
    }
}

/**
 * Container for failure groups with totals
 */
data class FailureGroupsWithTotals(
    val groups: List<FailureGroup>,
    val totals: FailureTotals,
)

/**
 * Failure totals by type
 */
data class FailureTotals(
    val crashes: Int,
    val anrs: Int,
    val toolFailures: Int,
    val nonfatals: Int = 0,
) {
    val total: Int get() = crashes + anrs + toolFailures + nonfatals
}

/**
 * Notification about a new failure
 */
data class FailureNotification(
    val id: Int,
    val occurrenceId: String,
    val groupId: String,
    val type: FailureType,
    val severity: FailureSeverity,
    val title: String,
    val timestamp: Long,
    val acknowledged: Boolean,
)

// Extension functions for query params

private fun FailureType.toQueryParam(): String = when (this) {
    FailureType.Crash -> "crash"
    FailureType.ANR -> "anr"
    FailureType.ToolCallFailure -> "tool_failure"
    FailureType.NonFatal -> "nonfatal"
}

private fun FailureSeverity.toQueryParam(): String = when (this) {
    FailureSeverity.Critical -> "critical"
    FailureSeverity.High -> "high"
    FailureSeverity.Medium -> "medium"
    FailureSeverity.Low -> "low"
}

private fun FailureNotificationEntry.toModel(): FailureNotification = FailureNotification(
    id = id,
    occurrenceId = occurrenceId,
    groupId = groupId,
    type = when (type) {
        "crash" -> FailureType.Crash
        "anr" -> FailureType.ANR
        "tool_failure" -> FailureType.ToolCallFailure
        "nonfatal" -> FailureType.NonFatal
        else -> FailureType.Crash
    },
    severity = when (severity) {
        "critical" -> FailureSeverity.Critical
        "high" -> FailureSeverity.High
        "medium" -> FailureSeverity.Medium
        "low" -> FailureSeverity.Low
        else -> FailureSeverity.Medium
    },
    title = title,
    timestamp = timestamp,
    acknowledged = acknowledged,
)
