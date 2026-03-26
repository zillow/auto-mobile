package dev.jasonpearson.automobile.desktop.core.failures

import androidx.compose.ui.graphics.Color

/**
 * Types of failures that can occur
 */
enum class FailureType(val label: String, val icon: String, val color: Color) {
    Crash("Crash", "💥", Color(0xFFE53935)),
    ANR("ANR", "🔄", Color(0xFFFF9800)),
    ToolCallFailure("Tool Failure", "🔧", Color(0xFF9C27B0)),
    NonFatal("Non-Fatal", "⚠️", Color(0xFF2196F3)),
}

/**
 * Severity of a failure based on frequency and impact
 */
enum class FailureSeverity(val label: String, val color: Color) {
    Critical("Critical", Color(0xFFE53935)),
    High("High", Color(0xFFFF5722)),
    Medium("Medium", Color(0xFFFF9800)),
    Low("Low", Color(0xFFFFC107)),
}

/**
 * Parsed stack trace element with file navigation info
 */
data class StackTraceElement(
    val className: String,
    val methodName: String,
    val fileName: String?,
    val lineNumber: Int?,
    val isAppCode: Boolean = false,
)

/**
 * Device model with occurrence count
 */
data class DeviceBreakdown(
    val deviceModel: String,
    val os: String,
    val count: Int,
    val percentage: Float,
)

/**
 * App version with occurrence count
 */
data class VersionBreakdown(
    val version: String,
    val count: Int,
    val percentage: Float,
)

/**
 * Screen with visit/failure frequency
 */
data class ScreenBreakdown(
    val screenName: String,
    val visitCount: Int,
    val failureCount: Int,
    val visitPercentage: Float,
)

/**
 * Duration statistics for tool calls or ANRs
 */
data class DurationStats(
    val minMs: Long,
    val maxMs: Long,
    val avgMs: Long,
    val medianMs: Long,
    val p95Ms: Long,
)

/**
 * Tool call aggregated info across multiple failures
 */
data class AggregatedToolCallInfo(
    val toolName: String,
    val errorCodes: Map<String, Int>, // error code -> count
    val parameterVariants: Map<String, List<String>>, // param name -> unique values seen
    val durationStats: DurationStats?,
)

/**
 * Capture (screenshot or video) from a failure occurrence
 */
data class FailureCapture(
    val id: String,
    val type: CaptureType,
    val path: String,
    val timestamp: Long,
    val deviceModel: String,
)

enum class CaptureType { Screenshot, Video }

/**
 * Individual occurrence for drill-down
 */
data class FailureOccurrence(
    val id: String,
    val timestamp: Long,
    val deviceModel: String,
    val os: String,
    val appVersion: String,
    val sessionId: String,
    val screenAtFailure: String?,
    val screensVisited: List<String>,
    val testName: String?,
    val capturePath: String?,
    val captureType: CaptureType?,
)

/**
 * Group of similar failures with aggregated data across all occurrences
 */
data class FailureGroup(
    val id: String,
    val type: FailureType,
    val signature: String,
    val title: String,
    val message: String,
    val firstOccurrence: Long,
    val lastOccurrence: Long,
    val totalCount: Int,
    val uniqueSessions: Int,
    val severity: FailureSeverity,

    // Aggregated breakdowns
    val deviceBreakdown: List<DeviceBreakdown>,
    val versionBreakdown: List<VersionBreakdown>,
    val screenBreakdown: List<ScreenBreakdown>,
    val failureScreens: Map<String, Int>, // screen where failure occurred -> count

    // Stack trace (shared across occurrences of same signature)
    val stackTraceElements: List<StackTraceElement>,

    // Tool call info (for tool failures)
    val toolCallInfo: AggregatedToolCallInfo?,

    // Affected tests with their failure counts
    val affectedTests: Map<String, Int>, // test name -> failure count

    // Recent captures for preview
    val recentCaptures: List<FailureCapture>,

    // Sample occurrences for drill-down
    val sampleOccurrences: List<FailureOccurrence>,
)
