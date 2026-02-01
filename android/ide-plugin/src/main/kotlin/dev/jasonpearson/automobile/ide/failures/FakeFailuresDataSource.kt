package dev.jasonpearson.automobile.ide.failures

import dev.jasonpearson.automobile.ide.time.Clock
import dev.jasonpearson.automobile.ide.time.SystemClock
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlin.random.Random

/**
 * Fake failures data source for UI development and testing.
 * Supports manually triggering new failures via [triggerNewFailure].
 */
class FakeFailuresDataSource(
    private val clock: Clock = SystemClock,
) : FailuresDataSource, StreamingFailuresDataSourceInterface {

    private val mockDataSource = MockFailuresDataSource(clock)
    private var notificationIdCounter = 1
    private val random = Random(System.currentTimeMillis())

    private val _notificationsFlow = MutableSharedFlow<DataSourceResult<List<FailureNotification>>>(replay = 0)
    private val _failureGroupsFlow = MutableSharedFlow<DataSourceResult<FailureGroupsWithTotals>>(replay = 1)

    // Track triggered failures for totals
    private var triggeredCrashes = 0
    private var triggeredAnrs = 0
    private var triggeredToolFailures = 0

    override suspend fun getFailureGroups(): DataSourceResult<List<FailureGroup>> {
        return mockDataSource.getFailureGroups()
    }

    override suspend fun getTimelineData(
        dateRange: DateRange,
        aggregation: TimeAggregation,
    ): DataSourceResult<TimelineData> {
        return mockDataSource.getTimelineData(dateRange, aggregation)
    }

    /**
     * Flow of new failure notifications (emitted when [triggerNewFailure] is called)
     */
    override fun notificationsFlow(): Flow<DataSourceResult<List<FailureNotification>>> {
        return _notificationsFlow.asSharedFlow()
    }

    /**
     * Flow of updated failure groups (emitted when [triggerNewFailure] is called)
     */
    override fun failureGroupsFlow(): Flow<DataSourceResult<FailureGroupsWithTotals>> {
        return _failureGroupsFlow.asSharedFlow()
    }

    /**
     * Manually trigger a new failure for testing.
     * This emits a notification and updates the failure groups flow.
     */
    suspend fun triggerNewFailure(type: FailureType? = null) {
        val failureType = type ?: FailureType.entries[random.nextInt(FailureType.entries.size)]
        val severity = FailureSeverity.entries[random.nextInt(FailureSeverity.entries.size)]
        val now = clock.nowMs()

        // Update counters
        when (failureType) {
            FailureType.Crash -> triggeredCrashes++
            FailureType.ANR -> triggeredAnrs++
            FailureType.ToolCallFailure -> triggeredToolFailures++
        }

        val notification = FailureNotification(
            id = notificationIdCounter++,
            occurrenceId = "fake-occ-${notificationIdCounter}",
            groupId = "fake-group-${failureType.name.lowercase()}",
            type = failureType,
            severity = severity,
            title = generateFakeTitle(failureType),
            timestamp = now,
            acknowledged = false,
        )

        // Emit the notification
        _notificationsFlow.emit(DataSourceResult.Success(listOf(notification)))

        // Emit updated groups with totals
        val groupsResult = getFailureGroups()
        if (groupsResult is DataSourceResult.Success) {
            val totals = FailureTotals(
                crashes = groupsResult.data.count { it.type == FailureType.Crash } + triggeredCrashes,
                anrs = groupsResult.data.count { it.type == FailureType.ANR } + triggeredAnrs,
                toolFailures = groupsResult.data.count { it.type == FailureType.ToolCallFailure } + triggeredToolFailures,
            )
            _failureGroupsFlow.emit(DataSourceResult.Success(FailureGroupsWithTotals(groupsResult.data, totals)))
        }
    }

    private fun generateFakeTitle(type: FailureType): String {
        return when (type) {
            FailureType.Crash -> listOf(
                "NullPointerException in UserViewModel",
                "ArrayIndexOutOfBoundsException in ListAdapter",
                "IllegalStateException in FragmentManager",
                "OutOfMemoryError in ImageLoader",
            ).random(random)
            FailureType.ANR -> listOf(
                "ANR: Main thread blocked in DatabaseQuery",
                "ANR: UI frozen during network call",
                "ANR: Deadlock in SyncManager",
            ).random(random)
            FailureType.ToolCallFailure -> listOf(
                "tapOn: Element not found - Submit button",
                "inputText: Keyboard not visible",
                "swipeOn: Gesture timeout exceeded",
            ).random(random)
        }
    }
}

/**
 * Interface for streaming failures data sources.
 * Used by both [FakeFailuresDataSource] and [StreamingFailuresDataSource].
 */
interface StreamingFailuresDataSourceInterface {
    fun notificationsFlow(): Flow<DataSourceResult<List<FailureNotification>>>
    fun failureGroupsFlow(): Flow<DataSourceResult<FailureGroupsWithTotals>>
}
