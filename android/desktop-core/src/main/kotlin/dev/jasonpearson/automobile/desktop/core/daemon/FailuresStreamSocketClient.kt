package dev.jasonpearson.automobile.desktop.core.daemon

import dev.jasonpearson.automobile.desktop.core.failures.AggregatedToolCallInfo
import dev.jasonpearson.automobile.desktop.core.failures.CaptureType
import dev.jasonpearson.automobile.desktop.core.failures.DeviceBreakdown
import dev.jasonpearson.automobile.desktop.core.failures.DurationStats
import dev.jasonpearson.automobile.desktop.core.failures.FailureCapture
import dev.jasonpearson.automobile.desktop.core.failures.FailureGroup
import dev.jasonpearson.automobile.desktop.core.failures.FailureOccurrence
import dev.jasonpearson.automobile.desktop.core.failures.FailureSeverity
import dev.jasonpearson.automobile.desktop.core.failures.FailureType
import dev.jasonpearson.automobile.desktop.core.failures.ScreenBreakdown
import dev.jasonpearson.automobile.desktop.core.failures.StackTraceElement
import dev.jasonpearson.automobile.desktop.core.failures.VersionBreakdown
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.File
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.UnixDomainSocketAddress
import java.nio.channels.Channels
import java.nio.channels.SocketChannel
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Interface for failures stream operations
 */
interface FailuresStreamClient {
    fun pollNotifications(request: FailuresNotificationsRequest): FailuresNotificationsResponse
    fun pollGroups(request: FailuresGroupsRequest): FailuresGroupsResponse
    fun pollTimeline(request: FailuresTimelineRequest): FailuresTimelineResponse
    fun acknowledge(notificationIds: List<Int>): AcknowledgeResponse
}

/**
 * Request for polling failure notifications
 */
@Serializable
data class FailuresNotificationsRequest(
    val command: String = "poll_notifications",
    val sinceTimestamp: Long? = null,
    val sinceId: Long? = null,
    val startTime: Long? = null,
    val endTime: Long? = null,
    val dateRange: String? = null,
    val type: String? = null,
    val acknowledged: Boolean? = null,
    val limit: Int? = null,
)

/**
 * Request for polling failure groups
 */
@Serializable
data class FailuresGroupsRequest(
    val command: String = "poll_groups",
    val startTime: Long? = null,
    val endTime: Long? = null,
    val dateRange: String? = null,
    val type: String? = null,
    val severity: String? = null,
)

/**
 * Request for polling timeline data
 */
@Serializable
data class FailuresTimelineRequest(
    val command: String = "poll_timeline",
    val startTime: Long? = null,
    val endTime: Long? = null,
    val dateRange: String? = null,
    val aggregation: String? = null,
)

/**
 * Request for acknowledging notifications
 */
@Serializable
data class AcknowledgeRequest(
    val command: String = "acknowledge",
    val notificationIds: List<Int>,
)

/**
 * Notification entry from the stream
 */
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

/**
 * Response for notifications poll
 */
@Serializable
data class FailuresNotificationsResponse(
    val success: Boolean,
    val error: String? = null,
    val notifications: List<FailureNotificationEntry>? = null,
    val lastTimestamp: Long? = null,
    val lastId: Long? = null,
)

/**
 * Response for groups poll
 */
@Serializable
data class FailuresGroupsResponse(
    val success: Boolean,
    val error: String? = null,
    val groups: List<FailureGroupDto>? = null,
    val totals: FailureTotals? = null,
)

@Serializable
data class FailureTotals(
    val crashes: Int,
    val anrs: Int,
    val toolFailures: Int,
    val nonfatals: Int = 0,
)

/**
 * Response for timeline poll
 */
@Serializable
data class FailuresTimelineResponse(
    val success: Boolean,
    val error: String? = null,
    val dataPoints: List<TimelineDataPointDto>? = null,
    val previousPeriodTotals: PeriodTotalsDto? = null,
)

@Serializable
data class TimelineDataPointDto(
    val label: String,
    val crashes: Int,
    val anrs: Int,
    val toolFailures: Int,
    val nonfatals: Int = 0,
)

@Serializable
data class PeriodTotalsDto(
    val crashes: Int,
    val anrs: Int,
    val toolFailures: Int,
    val nonfatals: Int = 0,
)

/**
 * Response for acknowledge
 */
@Serializable
data class AcknowledgeResponse(
    val success: Boolean,
    val error: String? = null,
    val acknowledgedCount: Int? = null,
)

// DTO types for group parsing

@Serializable
data class FailureGroupDto(
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
data class DeviceBreakdownDto(
    val deviceModel: String,
    val os: String,
    val count: Int,
    val percentage: Float,
)

@Serializable
data class VersionBreakdownDto(
    val version: String,
    val count: Int,
    val percentage: Float,
)

@Serializable
data class ScreenBreakdownDto(
    val screenName: String,
    val visitCount: Int,
    val failureCount: Int,
    val visitPercentage: Float,
)

@Serializable
data class StackTraceElementDto(
    val className: String,
    val methodName: String,
    val fileName: String? = null,
    val lineNumber: Int? = null,
    val isAppCode: Boolean = false,
)

@Serializable
data class AggregatedToolCallInfoDto(
    val toolName: String,
    val errorCodes: Map<String, Int>,
    val parameterVariants: Map<String, List<String>>,
    val durationStats: DurationStatsDto? = null,
)

@Serializable
data class DurationStatsDto(
    val minMs: Long,
    val maxMs: Long,
    val avgMs: Long,
    val medianMs: Long,
    val p95Ms: Long,
)

@Serializable
data class FailureCaptureDto(
    val id: String,
    val type: String,
    val path: String,
    val timestamp: Long,
    val deviceModel: String,
)

@Serializable
data class FailureOccurrenceDto(
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

/**
 * Socket client for failures streaming
 */
class FailuresStreamSocketClient(
    private val socketPathValue: String = FailuresStreamSocketPaths.socketPath(),
    private val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true  // Required to include command field with default value
    },
) : FailuresStreamClient {

    override fun pollNotifications(request: FailuresNotificationsRequest): FailuresNotificationsResponse {
        val response = sendRequest<FailuresNotificationsResponse>(json.encodeToString(request))
        if (!response.success) {
            throw McpConnectionException(response.error ?: "Failures notifications poll failed")
        }
        return response
    }

    override fun pollGroups(request: FailuresGroupsRequest): FailuresGroupsResponse {
        val response = sendRequest<FailuresGroupsResponse>(json.encodeToString(request))
        if (!response.success) {
            throw McpConnectionException(response.error ?: "Failures groups poll failed")
        }
        return response
    }

    override fun pollTimeline(request: FailuresTimelineRequest): FailuresTimelineResponse {
        val response = sendRequest<FailuresTimelineResponse>(json.encodeToString(request))
        if (!response.success) {
            throw McpConnectionException(response.error ?: "Failures timeline poll failed")
        }
        return response
    }

    override fun acknowledge(notificationIds: List<Int>): AcknowledgeResponse {
        val request = AcknowledgeRequest(notificationIds = notificationIds)
        val response = sendRequest<AcknowledgeResponse>(json.encodeToString(request))
        if (!response.success) {
            throw McpConnectionException(response.error ?: "Failures acknowledge failed")
        }
        return response
    }

    private inline fun <reified T> sendRequest(requestJson: String): T {
        ensureSocketExists()

        val address = UnixDomainSocketAddress.of(socketPathValue)
        SocketChannel.open(address).use { channel ->
            val reader =
                BufferedReader(
                    InputStreamReader(Channels.newInputStream(channel), StandardCharsets.UTF_8)
                )
            val writer =
                BufferedWriter(
                    OutputStreamWriter(Channels.newOutputStream(channel), StandardCharsets.UTF_8)
                )

            writer.write(requestJson)
            writer.newLine()
            writer.flush()

            val line = reader.readLine()
                ?: throw McpConnectionException("Failures stream socket closed")
            return json.decodeFromString(line)
        }
    }

    private fun ensureSocketExists() {
        val path = File(socketPathValue).toPath()
        if (!Files.exists(path)) {
            throw McpConnectionException("Failures stream socket not found at $socketPathValue")
        }
    }
}

object FailuresStreamSocketPaths {
    fun socketPath(): String {
        // Check for external mode (matches the server's logic)
        val isExternalMode = System.getenv("AUTOMOBILE_EMULATOR_EXTERNAL") == "true"
        return if (isExternalMode) {
            "/tmp/auto-mobile-failures-stream.sock"
        } else {
            val home = System.getProperty("user.home", "").ifBlank { "." }
            File(home, ".auto-mobile/failures-stream.sock").path
        }
    }
}
