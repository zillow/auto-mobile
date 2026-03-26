package dev.jasonpearson.automobile.desktop.core.failures

import dev.jasonpearson.automobile.desktop.core.daemon.AutoMobileClient
import dev.jasonpearson.automobile.desktop.core.daemon.McpConnectionException
import dev.jasonpearson.automobile.desktop.core.daemon.decodeResourceResponse
import dev.jasonpearson.automobile.desktop.core.time.Clock
import dev.jasonpearson.automobile.desktop.core.time.SystemClock
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Data returned from timeline queries
 */
data class TimelineData(
    val dataPoints: List<TimelineDataPoint>,
    val previousPeriodTotals: PeriodTotals,
)

/**
 * Data point for timeline chart
 */
data class TimelineDataPoint(
    val label: String,
    val crashes: Int,
    val anrs: Int,
    val toolFailures: Int,
    val nonfatals: Int = 0,
) {
    val total: Int get() = crashes + anrs + toolFailures + nonfatals
}

/**
 * Totals for a period (used for previous period comparison)
 */
data class PeriodTotals(
    val crashes: Int,
    val anrs: Int,
    val toolFailures: Int,
    val nonfatals: Int = 0,
)

/**
 * Date range options for the timeline
 */
enum class DateRange(val label: String, val durationMs: Long) {
    OneHour("1h", 60 * 60 * 1000L),
    TwentyFourHours("24h", 24 * 60 * 60 * 1000L),
    ThreeDays("3d", 3 * 24 * 60 * 60 * 1000L),
    SevenDays("7d", 7 * 24 * 60 * 60 * 1000L),
    ThirtyDays("30d", 30 * 24 * 60 * 60 * 1000L),
    ;

    fun toQueryParam(): String = label
}

/**
 * Time aggregation options for the timeline
 */
enum class TimeAggregation(val label: String, val durationMs: Long) {
    Minute("Min", 60 * 1000L),
    Hour("Hour", 60 * 60 * 1000L),
    Day("Day", 24 * 60 * 60 * 1000L),
    Week("Week", 7 * 24 * 60 * 60 * 1000L),
    ;

    fun toQueryParam(): String = name.lowercase()
}

// DataSourceMode has been moved to dev.jasonpearson.automobile.desktop.core.datasource package

/**
 * Result of a data source operation
 */
sealed class DataSourceResult<out T> {
    data class Success<T>(val data: T) : DataSourceResult<T>()
    data class Error(val message: String, val exception: Exception? = null) : DataSourceResult<Nothing>()
}

/**
 * Interface for accessing failures data
 */
interface FailuresDataSource {
    suspend fun getFailureGroups(): DataSourceResult<List<FailureGroup>>

    suspend fun getTimelineData(
        dateRange: DateRange,
        aggregation: TimeAggregation,
    ): DataSourceResult<TimelineData>
}

/**
 * Mock data source that uses local mock data
 */
class MockFailuresDataSource(
    private val clock: Clock = SystemClock,
) : FailuresDataSource {
    override suspend fun getFailureGroups(): DataSourceResult<List<FailureGroup>> {
        return DataSourceResult.Success(createMockFailureGroups(clock))
    }

    override suspend fun getTimelineData(
        dateRange: DateRange,
        aggregation: TimeAggregation,
    ): DataSourceResult<TimelineData> {
        return DataSourceResult.Success(
            TimelineData(
                dataPoints = generateMockTimelineData(dateRange, aggregation, clock),
                previousPeriodTotals = generateMockPreviousPeriodTotals(dateRange),
            )
        )
    }
}

/**
 * Empty data source that returns empty results (for Real mode when MCP not available)
 */
class EmptyFailuresDataSource : FailuresDataSource {
    override suspend fun getFailureGroups(): DataSourceResult<List<FailureGroup>> {
        return DataSourceResult.Success(emptyList())
    }

    override suspend fun getTimelineData(
        dateRange: DateRange,
        aggregation: TimeAggregation,
    ): DataSourceResult<TimelineData> {
        return DataSourceResult.Success(
            TimelineData(
                dataPoints = emptyList(),
                previousPeriodTotals = PeriodTotals(0, 0, 0),
            )
        )
    }
}

/**
 * MCP data source that reads from the MCP server
 */
class McpFailuresDataSource(
    private val clientProvider: () -> AutoMobileClient,
) : FailuresDataSource {
    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun getFailureGroups(): DataSourceResult<List<FailureGroup>> {
        return try {
            val client = clientProvider()
            val contents = client.readResource("automobile:failures")
            val response = decodeResourceResponse(json, contents, FailuresResponse.serializer())
            DataSourceResult.Success(response.groups.map { it.toModel() })
        } catch (e: McpConnectionException) {
            DataSourceResult.Error("MCP server not available: ${e.message}", e)
        } catch (e: Exception) {
            DataSourceResult.Error("Failed to load failures: ${e.message}", e)
        }
    }

    override suspend fun getTimelineData(
        dateRange: DateRange,
        aggregation: TimeAggregation,
    ): DataSourceResult<TimelineData> {
        return try {
            val client = clientProvider()
            val uri = "automobile:failures/timeline?dateRange=${dateRange.toQueryParam()}&aggregation=${aggregation.toQueryParam()}"
            val contents = client.readResource(uri)
            val response = decodeResourceResponse(json, contents, TimelineResponse.serializer())
            DataSourceResult.Success(
                TimelineData(
                    dataPoints = response.dataPoints.map {
                        TimelineDataPoint(it.label, it.crashes, it.anrs, it.toolFailures, it.nonfatals)
                    },
                    previousPeriodTotals = PeriodTotals(
                        response.previousPeriodTotals.crashes,
                        response.previousPeriodTotals.anrs,
                        response.previousPeriodTotals.toolFailures,
                        response.previousPeriodTotals.nonfatals,
                    ),
                )
            )
        } catch (e: McpConnectionException) {
            DataSourceResult.Error("MCP server not available: ${e.message}", e)
        } catch (e: Exception) {
            DataSourceResult.Error("Failed to load timeline: ${e.message}", e)
        }
    }
}

// Serializable response models for MCP resources

@Serializable
private data class FailuresResponse(
    val groups: List<FailureGroupDto>,
    val generatedAt: String,
)

@Serializable
private data class FailureGroupDto(
    val id: String,
    val type: String,
    val signature: String,
    val title: String,
    val message: String,
    val firstOccurrence: Long,
    val lastOccurrence: Long,
    val totalCount: Int,
    val uniqueSessions: Int,
    val severity: String,
    val deviceBreakdown: List<DeviceBreakdownDto>,
    val versionBreakdown: List<VersionBreakdownDto>,
    val screenBreakdown: List<ScreenBreakdownDto>,
    val failureScreens: Map<String, Int>,
    val stackTraceElements: List<StackTraceElementDto>,
    val toolCallInfo: AggregatedToolCallInfoDto? = null,
    val affectedTests: Map<String, Int>,
    val recentCaptures: List<FailureCaptureDto>,
    val sampleOccurrences: List<FailureOccurrenceDto>,
) {
    fun toModel(): FailureGroup = FailureGroup(
        id = id,
        type = when (type) {
            "crash" -> FailureType.Crash
            "anr" -> FailureType.ANR
            "tool_failure" -> FailureType.ToolCallFailure
            "nonfatal" -> FailureType.NonFatal
            else -> FailureType.Crash
        },
        signature = signature,
        title = title,
        message = message,
        firstOccurrence = firstOccurrence,
        lastOccurrence = lastOccurrence,
        totalCount = totalCount,
        uniqueSessions = uniqueSessions,
        severity = when (severity) {
            "critical" -> FailureSeverity.Critical
            "high" -> FailureSeverity.High
            "medium" -> FailureSeverity.Medium
            "low" -> FailureSeverity.Low
            else -> FailureSeverity.Medium
        },
        deviceBreakdown = deviceBreakdown.map {
            DeviceBreakdown(it.deviceModel, it.os, it.count, it.percentage)
        },
        versionBreakdown = versionBreakdown.map {
            VersionBreakdown(it.version, it.count, it.percentage)
        },
        screenBreakdown = screenBreakdown.map {
            ScreenBreakdown(it.screenName, it.visitCount, it.failureCount, it.visitPercentage)
        },
        failureScreens = failureScreens,
        stackTraceElements = stackTraceElements.map {
            StackTraceElement(it.className, it.methodName, it.fileName, it.lineNumber, it.isAppCode)
        },
        toolCallInfo = toolCallInfo?.let {
            AggregatedToolCallInfo(
                toolName = it.toolName,
                errorCodes = it.errorCodes,
                parameterVariants = it.parameterVariants,
                durationStats = it.durationStats?.let { stats ->
                    DurationStats(stats.minMs, stats.maxMs, stats.avgMs, stats.medianMs, stats.p95Ms)
                },
            )
        },
        affectedTests = affectedTests,
        recentCaptures = recentCaptures.map {
            FailureCapture(
                it.id,
                if (it.type == "video") CaptureType.Video else CaptureType.Screenshot,
                it.path,
                it.timestamp,
                it.deviceModel,
            )
        },
        sampleOccurrences = sampleOccurrences.map {
            FailureOccurrence(
                it.id,
                it.timestamp,
                it.deviceModel,
                it.os,
                it.appVersion,
                it.sessionId,
                it.screenAtFailure,
                it.screensVisited,
                it.testName,
                it.capturePath,
                it.captureType?.let { type -> if (type == "video") CaptureType.Video else CaptureType.Screenshot },
            )
        },
    )
}

@Serializable
private data class DeviceBreakdownDto(
    val deviceModel: String,
    val os: String,
    val count: Int,
    val percentage: Float,
)

@Serializable
private data class VersionBreakdownDto(
    val version: String,
    val count: Int,
    val percentage: Float,
)

@Serializable
private data class ScreenBreakdownDto(
    val screenName: String,
    val visitCount: Int,
    val failureCount: Int,
    val visitPercentage: Float,
)

@Serializable
private data class StackTraceElementDto(
    val className: String,
    val methodName: String,
    val fileName: String? = null,
    val lineNumber: Int? = null,
    val isAppCode: Boolean = false,
)

@Serializable
private data class AggregatedToolCallInfoDto(
    val toolName: String,
    val errorCodes: Map<String, Int>,
    val parameterVariants: Map<String, List<String>>,
    val durationStats: DurationStatsDto? = null,
)

@Serializable
private data class DurationStatsDto(
    val minMs: Long,
    val maxMs: Long,
    val avgMs: Long,
    val medianMs: Long,
    val p95Ms: Long,
)

@Serializable
private data class FailureCaptureDto(
    val id: String,
    val type: String,
    val path: String,
    val timestamp: Long,
    val deviceModel: String,
)

@Serializable
private data class FailureOccurrenceDto(
    val id: String,
    val timestamp: Long,
    val deviceModel: String,
    val os: String,
    val appVersion: String,
    val sessionId: String,
    val screenAtFailure: String? = null,
    val screensVisited: List<String>,
    val testName: String? = null,
    val capturePath: String? = null,
    val captureType: String? = null,
)

@Serializable
private data class TimelineResponse(
    val dataPoints: List<TimelineDataPointDto>,
    val dateRange: String,
    val aggregation: String,
    val previousPeriodTotals: PeriodTotalsDto,
)

@Serializable
private data class TimelineDataPointDto(
    val label: String,
    val crashes: Int,
    val anrs: Int,
    val toolFailures: Int,
    val nonfatals: Int = 0,
)

@Serializable
private data class PeriodTotalsDto(
    val crashes: Int,
    val anrs: Int,
    val toolFailures: Int,
    val nonfatals: Int = 0,
)

// Maximum number of buckets we can reasonably display
private const val MAX_DISPLAYABLE_BUCKETS = 100

/**
 * Generate mock timeline data with relative time labels
 */
internal fun generateMockTimelineData(
    dateRange: DateRange,
    aggregation: TimeAggregation,
    clock: Clock = SystemClock,
): List<TimelineDataPoint> {
    val random = kotlin.random.Random(42) // Fixed seed for consistent data

    // Calculate number of buckets, capped at displayable limit
    val buckets = (dateRange.durationMs / aggregation.durationMs).toInt().coerceIn(1, MAX_DISPLAYABLE_BUCKETS)

    return (0 until buckets).map { i ->
        // Calculate time offset from now (bucket 0 is most recent)
        val bucketIndex = buckets - 1 - i  // Reverse so oldest first
        val timeAgoMs = bucketIndex * aggregation.durationMs

        // Generate relative time label
        val label = formatRelativeTimeLabel(timeAgoMs, aggregation, clock)

        // Generate realistic-looking failure data with some variance
        val baseCrashes = when (aggregation) {
            TimeAggregation.Minute -> random.nextInt(0, 5)
            TimeAggregation.Hour -> random.nextInt(2, 15)
            TimeAggregation.Day -> random.nextInt(10, 50)
            TimeAggregation.Week -> random.nextInt(30, 150)
        }
        val baseAnrs = baseCrashes / 3
        val baseToolFailures = baseCrashes / 2
        val baseNonfatals = baseCrashes * 2 // Non-fatals are typically more common

        TimelineDataPoint(
            label = label,
            crashes = baseCrashes,
            anrs = baseAnrs,
            toolFailures = baseToolFailures,
            nonfatals = baseNonfatals,
        )
    }
}

/**
 * Format a local human-readable time label for the timeline
 */
private fun formatRelativeTimeLabel(
    timeAgoMs: Long,
    aggregation: TimeAggregation,
    clock: Clock = SystemClock,
): String {
    val now = clock.nowMs()
    val timestamp = now - timeAgoMs
    val calendar = java.util.Calendar.getInstance()
    calendar.timeInMillis = timestamp

    return when (aggregation) {
        TimeAggregation.Minute -> {
            // Show local time like "7:45 PM"
            if (timeAgoMs == 0L) {
                "now"
            } else {
                val hour = calendar.get(java.util.Calendar.HOUR)
                val minute = calendar.get(java.util.Calendar.MINUTE)
                val amPm = if (calendar.get(java.util.Calendar.AM_PM) == java.util.Calendar.AM) "AM" else "PM"
                val displayHour = if (hour == 0) 12 else hour
                "${displayHour}:${minute.toString().padStart(2, '0')} $amPm"
            }
        }
        TimeAggregation.Hour -> {
            // Show local hour like "3 PM", "11 AM"
            if (timeAgoMs == 0L) {
                "now"
            } else {
                val hour = calendar.get(java.util.Calendar.HOUR)
                val amPm = if (calendar.get(java.util.Calendar.AM_PM) == java.util.Calendar.AM) "AM" else "PM"
                val displayHour = if (hour == 0) 12 else hour
                "$displayHour $amPm"
            }
        }
        TimeAggregation.Day -> {
            // Show actual date like "Jan 18"
            val month = calendar.getDisplayName(java.util.Calendar.MONTH, java.util.Calendar.SHORT, java.util.Locale.getDefault()) ?: ""
            val day = calendar.get(java.util.Calendar.DAY_OF_MONTH)
            "$month $day"
        }
        TimeAggregation.Week -> {
            // Calculate the Monday of the week
            val dayOfWeek = calendar.get(java.util.Calendar.DAY_OF_WEEK)
            val daysToMonday = if (dayOfWeek == java.util.Calendar.SUNDAY) -6 else java.util.Calendar.MONDAY - dayOfWeek
            calendar.add(java.util.Calendar.DAY_OF_MONTH, daysToMonday)

            val month = calendar.getDisplayName(java.util.Calendar.MONTH, java.util.Calendar.SHORT, java.util.Locale.getDefault()) ?: ""
            val day = calendar.get(java.util.Calendar.DAY_OF_MONTH)
            "$month $day"
        }
    }
}

/**
 * Generate mock totals for the previous equivalent period
 */
internal fun generateMockPreviousPeriodTotals(dateRange: DateRange): PeriodTotals {
    // Use a different seed based on date range to get consistent but different values
    val random = kotlin.random.Random(dateRange.ordinal + 100)

    // Generate totals that are somewhat similar to current period but with variance
    val baseCrashes = when (dateRange) {
        DateRange.OneHour -> random.nextInt(50, 150)
        DateRange.TwentyFourHours -> random.nextInt(200, 600)
        DateRange.ThreeDays -> random.nextInt(500, 1500)
        DateRange.SevenDays -> random.nextInt(1000, 3000)
        DateRange.ThirtyDays -> random.nextInt(3000, 8000)
    }

    return PeriodTotals(
        crashes = baseCrashes,
        anrs = baseCrashes / 3,
        toolFailures = baseCrashes / 2,
    )
}

/**
 * Create mock failure data for demonstration with aggregated data across multiple occurrences
 */
internal fun createMockFailureGroups(clock: Clock = SystemClock): List<FailureGroup> {
    val now = clock.nowMs()

    return listOf(
        // Crash with data from multiple devices, versions, and sessions
        FailureGroup(
            id = "crash-1",
            type = FailureType.Crash,
            signature = "NullPointerException at LoginViewModel.kt:42",
            title = "NullPointerException in LoginViewModel",
            message = "java.lang.NullPointerException: Attempt to invoke virtual method 'String com.example.User.getName()' on a null object reference",
            firstOccurrence = now - 86400000 * 3,
            lastOccurrence = now - 3600000,
            totalCount = 23,
            uniqueSessions = 18,
            severity = FailureSeverity.Critical,
            deviceBreakdown = listOf(
                DeviceBreakdown("Pixel 8", "Android 15", 9, 39f),
                DeviceBreakdown("Pixel 7", "Android 14", 6, 26f),
                DeviceBreakdown("Samsung S24", "Android 14", 5, 22f),
                DeviceBreakdown("OnePlus 12", "Android 14", 3, 13f),
            ),
            versionBreakdown = listOf(
                VersionBreakdown("2.4.1-debug", 15, 65f),
                VersionBreakdown("2.4.0", 6, 26f),
                VersionBreakdown("2.3.9", 2, 9f),
            ),
            screenBreakdown = listOf(
                ScreenBreakdown("Splash", 23, 0, 100f),
                ScreenBreakdown("Login", 23, 23, 100f),
            ),
            failureScreens = mapOf("Login" to 23),
            stackTraceElements = listOf(
                StackTraceElement("com.example.app.LoginViewModel", "validateUser", "LoginViewModel.kt", 42, true),
                StackTraceElement("com.example.app.LoginViewModel", "onLoginClicked", "LoginViewModel.kt", 28, true),
                StackTraceElement("com.example.app.LoginFragment", "onClick", "LoginFragment.kt", 67, true),
                StackTraceElement("android.view.View", "performClick", "View.java", 7448, false),
            ),
            toolCallInfo = null,
            affectedTests = mapOf("testLoginFlow" to 15, "testSignupValidation" to 8),
            recentCaptures = listOf(
                FailureCapture("cap-1", CaptureType.Screenshot, "/captures/crash-1/1.png", now - 3600000, "Pixel 8"),
                FailureCapture("cap-2", CaptureType.Screenshot, "/captures/crash-1/2.png", now - 7200000, "Samsung S24"),
                FailureCapture("cap-3", CaptureType.Video, "/captures/crash-1/3.mp4", now - 10800000, "Pixel 7"),
            ),
            sampleOccurrences = listOf(
                FailureOccurrence("occ-1", now - 3600000, "Pixel 8", "Android 15", "2.4.1-debug", "session-1", "Login", listOf("Splash", "Login"), "testLoginFlow", "/captures/crash-1/1.png", CaptureType.Screenshot),
                FailureOccurrence("occ-2", now - 7200000, "Samsung S24", "Android 14", "2.4.1-debug", "session-2", "Login", listOf("Splash", "Login"), "testLoginFlow", "/captures/crash-1/2.png", CaptureType.Screenshot),
                FailureOccurrence("occ-3", now - 10800000, "Pixel 7", "Android 14", "2.4.0", "session-3", "Login", listOf("Splash", "Login"), "testSignupValidation", "/captures/crash-1/3.mp4", CaptureType.Video),
                FailureOccurrence("occ-4", now - 14400000, "OnePlus 12", "Android 14", "2.4.1-debug", "session-4", "Login", listOf("Splash", "Login"), "testLoginFlow", null, null),
                FailureOccurrence("occ-5", now - 18000000, "Pixel 8", "Android 15", "2.4.0", "session-5", "Login", listOf("Splash", "Login"), "testSignupValidation", null, null),
                FailureOccurrence("occ-6", now - 21600000, "Pixel 7", "Android 14", "2.3.9", "session-6", "Login", listOf("Splash", "Login"), "testLoginFlow", null, null),
            ),
        ),

        // ANR with multiple occurrences
        FailureGroup(
            id = "anr-1",
            type = FailureType.ANR,
            signature = "ANR in HomeFragment.onResume",
            title = "ANR: Main thread blocked during DB query",
            message = "Application Not Responding: Main thread blocked for 5+ seconds during database query",
            firstOccurrence = now - 86400000 * 2,
            lastOccurrence = now - 7200000,
            totalCount = 8,
            uniqueSessions = 7,
            severity = FailureSeverity.High,
            deviceBreakdown = listOf(
                DeviceBreakdown("Pixel 7", "Android 14", 4, 50f),
                DeviceBreakdown("Pixel 6", "Android 13", 3, 37f),
                DeviceBreakdown("Samsung A54", "Android 13", 1, 13f),
            ),
            versionBreakdown = listOf(
                VersionBreakdown("2.4.1-debug", 6, 75f),
                VersionBreakdown("2.4.0", 2, 25f),
            ),
            screenBreakdown = listOf(
                ScreenBreakdown("Splash", 8, 0, 100f),
                ScreenBreakdown("Login", 8, 0, 100f),
                ScreenBreakdown("Home", 8, 8, 100f),
            ),
            failureScreens = mapOf("Home" to 8),
            stackTraceElements = listOf(
                StackTraceElement("com.example.app.data.UserDao", "getAllUsers", "UserDao.kt", 23, true),
                StackTraceElement("com.example.app.HomeViewModel", "loadUsers", "HomeViewModel.kt", 45, true),
                StackTraceElement("com.example.app.HomeFragment", "onResume", "HomeFragment.kt", 31, true),
                StackTraceElement("androidx.fragment.app.Fragment", "performResume", "Fragment.java", 3135, false),
            ),
            toolCallInfo = null,
            affectedTests = mapOf("testHomeLoad" to 5, "testProfileEdit" to 3),
            recentCaptures = listOf(
                FailureCapture("cap-4", CaptureType.Video, "/captures/anr-1/1.mp4", now - 7200000, "Pixel 7"),
                FailureCapture("cap-5", CaptureType.Video, "/captures/anr-1/2.mp4", now - 14400000, "Pixel 6"),
            ),
            sampleOccurrences = listOf(
                FailureOccurrence("occ-7", now - 7200000, "Pixel 7", "Android 14", "2.4.1-debug", "session-7", "Home", listOf("Splash", "Login", "Home"), "testHomeLoad", "/captures/anr-1/1.mp4", CaptureType.Video),
                FailureOccurrence("occ-8", now - 14400000, "Pixel 6", "Android 13", "2.4.1-debug", "session-8", "Home", listOf("Splash", "Login", "Home"), "testProfileEdit", "/captures/anr-1/2.mp4", CaptureType.Video),
                FailureOccurrence("occ-9", now - 21600000, "Samsung A54", "Android 13", "2.4.0", "session-9", "Home", listOf("Splash", "Login", "Home"), "testHomeLoad", null, null),
            ),
        ),

        // Tool call failure with aggregated duration stats and parameter variants
        FailureGroup(
            id = "tool-1",
            type = FailureType.ToolCallFailure,
            signature = "tapOn failed: Element not found",
            title = "tapOn: Element not found",
            message = "Element with text not found within timeout. Check element visibility and timing.",
            firstOccurrence = now - 86400000,
            lastOccurrence = now - 1800000,
            totalCount = 12,
            uniqueSessions = 10,
            severity = FailureSeverity.Medium,
            deviceBreakdown = listOf(
                DeviceBreakdown("iPhone 15 Pro", "iOS 17.2", 5, 42f),
                DeviceBreakdown("iPhone 14", "iOS 17.1", 4, 33f),
                DeviceBreakdown("Pixel 8", "Android 15", 3, 25f),
            ),
            versionBreakdown = listOf(
                VersionBreakdown("2.4.0", 8, 67f),
                VersionBreakdown("2.4.1-debug", 4, 33f),
            ),
            screenBreakdown = listOf(
                ScreenBreakdown("Home", 12, 0, 100f),
                ScreenBreakdown("Cart", 12, 0, 100f),
                ScreenBreakdown("Checkout", 12, 12, 100f),
            ),
            failureScreens = mapOf("Checkout" to 12),
            stackTraceElements = emptyList(),
            toolCallInfo = AggregatedToolCallInfo(
                toolName = "tapOn",
                errorCodes = mapOf("ELEMENT_NOT_FOUND" to 10, "TIMEOUT" to 2),
                parameterVariants = mapOf(
                    "text" to listOf("Submit", "Complete Order", "Place Order"),
                    "timeout" to listOf("5000", "10000"),
                ),
                durationStats = DurationStats(
                    minMs = 5001,
                    maxMs = 10234,
                    avgMs = 6543,
                    medianMs = 5500,
                    p95Ms = 9800,
                ),
            ),
            affectedTests = mapOf("testFormSubmission" to 7, "testCheckout" to 5),
            recentCaptures = listOf(
                FailureCapture("cap-6", CaptureType.Screenshot, "/captures/tool-1/1.png", now - 1800000, "iPhone 15 Pro"),
                FailureCapture("cap-7", CaptureType.Screenshot, "/captures/tool-1/2.png", now - 3600000, "Pixel 8"),
                FailureCapture("cap-8", CaptureType.Screenshot, "/captures/tool-1/3.png", now - 7200000, "iPhone 14"),
            ),
            sampleOccurrences = listOf(
                FailureOccurrence("occ-10", now - 1800000, "iPhone 15 Pro", "iOS 17.2", "2.4.0", "session-10", "Checkout", listOf("Home", "Cart", "Checkout"), "testCheckout", "/captures/tool-1/1.png", CaptureType.Screenshot),
                FailureOccurrence("occ-11", now - 3600000, "Pixel 8", "Android 15", "2.4.1-debug", "session-11", "Checkout", listOf("Home", "Cart", "Checkout"), "testFormSubmission", "/captures/tool-1/2.png", CaptureType.Screenshot),
                FailureOccurrence("occ-12", now - 7200000, "iPhone 14", "iOS 17.1", "2.4.0", "session-12", "Checkout", listOf("Home", "Cart", "Checkout"), "testCheckout", "/captures/tool-1/3.png", CaptureType.Screenshot),
            ),
        ),

        // Low severity crash
        FailureGroup(
            id = "crash-2",
            type = FailureType.Crash,
            signature = "IndexOutOfBoundsException at RecyclerView",
            title = "IndexOutOfBoundsException in MessageList",
            message = "java.lang.IndexOutOfBoundsException: Inconsistency detected. Invalid view holder adapter position",
            firstOccurrence = now - 86400000 * 5,
            lastOccurrence = now - 86400000,
            totalCount = 5,
            uniqueSessions = 5,
            severity = FailureSeverity.Low,
            deviceBreakdown = listOf(
                DeviceBreakdown("Pixel 8", "Android 15", 3, 60f),
                DeviceBreakdown("Pixel 7", "Android 14", 2, 40f),
            ),
            versionBreakdown = listOf(
                VersionBreakdown("2.4.1-debug", 5, 100f),
            ),
            screenBreakdown = listOf(
                ScreenBreakdown("Home", 5, 0, 100f),
                ScreenBreakdown("Messages", 5, 5, 100f),
            ),
            failureScreens = mapOf("Messages" to 5),
            stackTraceElements = listOf(
                StackTraceElement("androidx.recyclerview.widget.RecyclerView", "findViewHolderForPosition", "RecyclerView.java", 1345, false),
                StackTraceElement("com.example.app.MessageListAdapter", "onBindViewHolder", "MessageListAdapter.kt", 67, true),
            ),
            toolCallInfo = null,
            affectedTests = mapOf("testSendMessage" to 5),
            recentCaptures = emptyList(),
            sampleOccurrences = listOf(
                FailureOccurrence("occ-13", now - 86400000, "Pixel 8", "Android 15", "2.4.1-debug", "session-13", "Messages", listOf("Home", "Messages"), "testSendMessage", null, null),
                FailureOccurrence("occ-14", now - 86400000 * 2, "Pixel 7", "Android 14", "2.4.1-debug", "session-14", "Messages", listOf("Home", "Messages"), "testSendMessage", null, null),
            ),
        ),
    )
}
