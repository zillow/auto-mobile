package com.automobile.ide.daemon

import kotlinx.serialization.Serializable

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
