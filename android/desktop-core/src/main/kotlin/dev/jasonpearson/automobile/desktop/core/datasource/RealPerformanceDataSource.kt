package dev.jasonpearson.automobile.desktop.core.datasource

import dev.jasonpearson.automobile.desktop.core.daemon.AutoMobileClient
import dev.jasonpearson.automobile.desktop.core.daemon.McpConnectionException
import dev.jasonpearson.automobile.desktop.core.performance.HealthStatus
import dev.jasonpearson.automobile.desktop.core.performance.MetricDataPoint
import dev.jasonpearson.automobile.desktop.core.performance.MetricTrend
import dev.jasonpearson.automobile.desktop.core.performance.MetricType
import dev.jasonpearson.automobile.desktop.core.performance.PerformanceAnomaly
import dev.jasonpearson.automobile.desktop.core.performance.PerformanceMetric
import dev.jasonpearson.automobile.desktop.core.performance.PerformanceRun

/**
 * Real performance data source that fetches from MCP resources.
 * Uses the performance-results resource to get actual performance audit data.
 */
class RealPerformanceDataSource(
    private val clientProvider: (() -> AutoMobileClient)? = null,
) : PerformanceDataSource {
    override suspend fun getPerformanceRun(): Result<PerformanceRun> {
        val provider = clientProvider ?: return Result.Success(createEmptyRun())

        return try {
            val client = provider()
            val auditResult = client.listPerformanceAuditResults(limit = 50)

            if (auditResult.results.isEmpty()) {
                return Result.Success(createEmptyRun())
            }

            // Aggregate metrics from audit results
            val now = System.currentTimeMillis()
            val metrics = mutableListOf<PerformanceMetric>()
            val anomalies = mutableListOf<PerformanceAnomaly>()
            val screensAnalyzed = mutableSetOf<String>()

            // Collect metrics from audit entries
            val p50Values = mutableListOf<MetricDataPoint>()
            val p90Values = mutableListOf<MetricDataPoint>()
            val jankCounts = mutableListOf<MetricDataPoint>()
            val touchLatencies = mutableListOf<MetricDataPoint>()

            auditResult.results.forEach { entry ->
                val timestamp = parseTimestamp(entry.timestamp)

                entry.metrics.p50Ms?.let { p50 ->
                    p50Values.add(MetricDataPoint(timestamp, p50.toFloat()))
                }
                entry.metrics.p90Ms?.let { p90 ->
                    p90Values.add(MetricDataPoint(timestamp, p90.toFloat()))
                }
                entry.metrics.jankCount?.let { jank ->
                    jankCounts.add(MetricDataPoint(timestamp, jank.toFloat()))
                }
                entry.metrics.touchLatencyMs?.let { latency ->
                    touchLatencies.add(MetricDataPoint(timestamp, latency.toFloat()))
                }

                // Check for anomalies (failures)
                if (!entry.passed) {
                    anomalies.add(
                        PerformanceAnomaly(
                            id = "anomaly-${entry.id}",
                            metricType = MetricType.Jank,
                            severity = HealthStatus.Warning,
                            message = entry.diagnostics ?: "Performance audit failed",
                            timestamp = timestamp,
                            screenName = null,
                            testName = null,
                            value = entry.metrics.jankCount?.toFloat() ?: 0f,
                            threshold = 5f, // Default threshold
                        )
                    )
                }
            }

            // Build metrics from collected data
            if (p50Values.isNotEmpty()) {
                val currentValue = p50Values.lastOrNull()?.value ?: 0f
                metrics.add(
                    PerformanceMetric(
                        id = "p50_frame_time",
                        type = MetricType.TimeToFirstFrame,
                        name = "Frame Time (P50)",
                        currentValue = currentValue,
                        unit = "ms",
                        thresholdWarning = 16f, // ~60fps
                        thresholdCritical = 33f, // ~30fps
                        trend = calculateTrend(p50Values),
                        history = p50Values.sortedBy { it.timestamp },
                    )
                )
            }

            if (p90Values.isNotEmpty()) {
                val currentValue = p90Values.lastOrNull()?.value ?: 0f
                metrics.add(
                    PerformanceMetric(
                        id = "p90_frame_time",
                        type = MetricType.TimeToFirstFrame,
                        name = "Frame Time (P90)",
                        currentValue = currentValue,
                        unit = "ms",
                        thresholdWarning = 20f,
                        thresholdCritical = 40f,
                        trend = calculateTrend(p90Values),
                        history = p90Values.sortedBy { it.timestamp },
                    )
                )
            }

            if (jankCounts.isNotEmpty()) {
                val currentValue = jankCounts.lastOrNull()?.value ?: 0f
                metrics.add(
                    PerformanceMetric(
                        id = "jank_count",
                        type = MetricType.Jank,
                        name = "Jank (Missed Frames)",
                        currentValue = currentValue,
                        unit = "frames",
                        thresholdWarning = 5f,
                        thresholdCritical = 10f,
                        trend = calculateTrend(jankCounts),
                        history = jankCounts.sortedBy { it.timestamp },
                    )
                )
            }

            if (touchLatencies.isNotEmpty()) {
                val currentValue = touchLatencies.lastOrNull()?.value ?: 0f
                metrics.add(
                    PerformanceMetric(
                        id = "touch_latency",
                        type = MetricType.TouchLatency,
                        name = "Touch Latency",
                        currentValue = currentValue,
                        unit = "ms",
                        thresholdWarning = 100f,
                        thresholdCritical = 200f,
                        trend = calculateTrend(touchLatencies),
                        history = touchLatencies.sortedBy { it.timestamp },
                    )
                )
            }

            // Determine overall health
            val overallHealth = when {
                anomalies.any { it.severity == HealthStatus.Critical } -> HealthStatus.Critical
                anomalies.isNotEmpty() -> HealthStatus.Warning
                else -> HealthStatus.Healthy
            }

            val latestEntry = auditResult.results.maxByOrNull { parseTimestamp(it.timestamp) }

            Result.Success(
                PerformanceRun(
                    id = "mcp-run-${now}",
                    name = "MCP Performance Data",
                    timestamp = latestEntry?.let { parseTimestamp(it.timestamp) } ?: now,
                    durationMs = 0, // Not tracked in audit results
                    deviceName = latestEntry?.deviceId ?: "Unknown",
                    overallHealth = overallHealth,
                    metrics = metrics,
                    anomalies = anomalies,
                    screensAnalyzed = screensAnalyzed.toList(),
                )
            )
        } catch (e: McpConnectionException) {
            Result.Error("MCP server not available: ${e.message}")
        } catch (e: Exception) {
            Result.Error("Failed to load performance data: ${e.message}")
        }
    }

    private fun createEmptyRun(): PerformanceRun {
        return PerformanceRun(
            id = "empty-run",
            name = "No data available",
            timestamp = System.currentTimeMillis(),
            durationMs = 0,
            deviceName = "Unknown",
            overallHealth = HealthStatus.Healthy,
            metrics = emptyList(),
            anomalies = emptyList(),
            screensAnalyzed = emptyList(),
        )
    }

    private fun parseTimestamp(timestamp: String): Long {
        return try {
            java.time.Instant.parse(timestamp).toEpochMilli()
        } catch (e: Exception) {
            System.currentTimeMillis()
        }
    }

    private fun calculateTrend(values: List<MetricDataPoint>): MetricTrend {
        if (values.size < 2) return MetricTrend.Stable

        val sorted = values.sortedBy { it.timestamp }
        val recentAvg = sorted.takeLast(5).map { it.value }.average()
        val oldAvg = sorted.take(5).map { it.value }.average()

        val changePercent = if (oldAvg > 0) ((recentAvg - oldAvg) / oldAvg) * 100 else 0.0

        return when {
            changePercent > 10 -> MetricTrend.Up
            changePercent < -10 -> MetricTrend.Down
            else -> MetricTrend.Stable
        }
    }
}
