package dev.jasonpearson.automobile.desktop.core.performance

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.jasonpearson.automobile.desktop.core.logging.LoggerFactory
import dev.jasonpearson.automobile.desktop.core.daemon.AutoMobileClient
import dev.jasonpearson.automobile.desktop.core.daemon.ObservationStreamClient
import dev.jasonpearson.automobile.desktop.core.datasource.DataSourceMode
import androidx.compose.material3.MaterialTheme
import dev.jasonpearson.automobile.desktop.core.components.Link
import androidx.compose.material3.Text
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

private val LOG = LoggerFactory.getLogger("PerformanceDashboard")

enum class PerformanceScreen {
    Overview,
    MetricDetail,
}

@Composable
fun PerformanceDashboard(
    onNavigateToScreen: (String) -> Unit = {},  // Navigate to a screen in nav graph
    onNavigateToTest: (String) -> Unit = {},  // Navigate to a test
    dataSourceMode: DataSourceMode = DataSourceMode.Fake,
    clientProvider: (() -> AutoMobileClient)? = null,  // MCP client for real data
    observationStreamClient: ObservationStreamClient? = null,  // Shared stream client for real-time updates
    // Initial metrics from parent to avoid empty state flicker when opening
    initialFps: Float? = null,
    initialFrameTimeMs: Float? = null,
    initialJankFrames: Int? = null,
    initialMemoryMb: Float? = null,
    initialTouchLatencyMs: Float? = null,
    initialRecompositionRate: Float? = null,
) {
    var currentScreen by remember { mutableStateOf(PerformanceScreen.Overview) }
    var selectedMetric by remember { mutableStateOf<PerformanceMetric?>(null) }

    // Build initial run from passed metrics to avoid empty state flicker
    val initialRun = remember(initialFps, initialFrameTimeMs, initialJankFrames, initialMemoryMb, initialTouchLatencyMs, initialRecompositionRate) {
        if (initialFps != null || initialMemoryMb != null) {
            val timestamp = System.currentTimeMillis()
            PerformanceRun(
                id = "live-run-$timestamp",
                name = "Live Performance Data",
                timestamp = timestamp,
                durationMs = 0,
                deviceName = "Unknown",
                overallHealth = HealthStatus.Healthy,
                metrics = buildList {
                    if (initialFps != null) {
                        add(PerformanceMetric(
                            id = "fps",
                            type = MetricType.FPS,
                            name = "Frame Rate",
                            currentValue = initialFps,
                            unit = "fps",
                            thresholdWarning = 55f,
                            thresholdCritical = 45f,
                            trend = MetricTrend.Stable,
                            history = listOf(MetricDataPoint(timestamp, initialFps, null)),
                        ))
                    }
                    if (initialFrameTimeMs != null) {
                        add(PerformanceMetric(
                            id = "frame_time",
                            type = MetricType.FrameTime,
                            name = "Frame Time",
                            currentValue = initialFrameTimeMs,
                            unit = "ms",
                            thresholdWarning = 18f,
                            thresholdCritical = 33f,
                            trend = MetricTrend.Stable,
                            history = listOf(MetricDataPoint(timestamp, initialFrameTimeMs, null)),
                        ))
                    }
                    if (initialJankFrames != null) {
                        add(PerformanceMetric(
                            id = "jank",
                            type = MetricType.Jank,
                            name = "Jank (Missed Frames)",
                            currentValue = initialJankFrames.toFloat(),
                            unit = "frames",
                            thresholdWarning = 5f,
                            thresholdCritical = 10f,
                            trend = MetricTrend.Stable,
                            history = listOf(MetricDataPoint(timestamp, initialJankFrames.toFloat(), null)),
                        ))
                    }
                    if (initialMemoryMb != null) {
                        add(PerformanceMetric(
                            id = "memory",
                            type = MetricType.Memory,
                            name = "Memory Usage",
                            currentValue = initialMemoryMb,
                            unit = "MB",
                            thresholdWarning = 256f,
                            thresholdCritical = 512f,
                            trend = MetricTrend.Stable,
                            history = listOf(MetricDataPoint(timestamp, initialMemoryMb, null)),
                        ))
                    }
                    if (initialTouchLatencyMs != null) {
                        add(PerformanceMetric(
                            id = "touch_latency",
                            type = MetricType.TouchLatency,
                            name = "Touch Latency",
                            currentValue = initialTouchLatencyMs,
                            unit = "ms",
                            thresholdWarning = 100f,
                            thresholdCritical = 200f,
                            trend = MetricTrend.Stable,
                            history = listOf(MetricDataPoint(timestamp, initialTouchLatencyMs, null)),
                        ))
                    }
                    if (initialRecompositionRate != null) {
                        add(PerformanceMetric(
                            id = "recomposition",
                            type = MetricType.RecompositionCount,
                            name = "Recompositions",
                            currentValue = initialRecompositionRate,
                            unit = "recomp/s",
                            thresholdWarning = 10f,
                            thresholdCritical = 50f,
                            trend = MetricTrend.Stable,
                            history = listOf(MetricDataPoint(timestamp, initialRecompositionRate, null)),
                        ))
                    }
                },
                anomalies = emptyList(),
                screensAnalyzed = emptyList(),
            )
        } else null
    }

    // Fetch performance run from data source
    var currentRun by remember { mutableStateOf(initialRun) }
    var isLoading by remember { mutableStateOf(initialRun == null) }
    var error by remember { mutableStateOf<String?>(null) }

    // Real-time performance metrics history (for live streaming)
    var realtimeMetricsHistory by remember { mutableStateOf<List<MetricDataPoint>>(emptyList()) }

    // Collect real-time performance updates from the stream
    LaunchedEffect(observationStreamClient) {
        if (observationStreamClient == null) return@LaunchedEffect

        LOG.info("Starting performance updates collection from stream client")
        observationStreamClient.performanceUpdates.collect { update ->
            LOG.info("Received performance update - fps=${update.fps}, jankFrames=${update.jankFrames}, touchLatencyMs=${update.touchLatencyMs}, ttiMs=${update.timeToInteractiveMs}, screenName=${update.screenName}")

            // Add to real-time history (keep last 120 data points for sparklines)
            val newPoint = MetricDataPoint(
                timestamp = update.timestamp,
                value = update.fps,
                screenName = update.screenName,
            )
            realtimeMetricsHistory = (realtimeMetricsHistory + newPoint).takeLast(120)

            // Update the current run with real-time data
            val run = currentRun ?: PerformanceRun(
                id = "live-run-${System.currentTimeMillis()}",
                name = "Live Performance Data",
                timestamp = System.currentTimeMillis(),
                durationMs = 0,
                deviceName = update.deviceId ?: "Unknown",
                overallHealth = HealthStatus.Healthy,
                metrics = emptyList(),
                anomalies = emptyList(),
                screensAnalyzed = emptyList(),
            )

            // Create metrics from streaming data if they don't exist, otherwise update
            val updatedMetrics = if (run.metrics.isEmpty()) {
                // Create new metrics from live data
                buildList {
                    add(PerformanceMetric(
                        id = "fps",
                        type = MetricType.FPS,
                        name = "Frame Rate",
                        currentValue = update.fps,
                        unit = "fps",
                        thresholdWarning = 55f,
                        thresholdCritical = 45f,
                        trend = MetricTrend.Stable,
                        history = listOf(newPoint),
                    ))
                    add(PerformanceMetric(
                        id = "frame_time",
                        type = MetricType.FrameTime,
                        name = "Frame Time",
                        currentValue = update.frameTimeMs,
                        unit = "ms",
                        thresholdWarning = 18f,
                        thresholdCritical = 33f,
                        trend = MetricTrend.Stable,
                        history = listOf(MetricDataPoint(update.timestamp, update.frameTimeMs, update.screenName)),
                    ))
                    add(PerformanceMetric(
                        id = "jank",
                        type = MetricType.Jank,
                        name = "Jank (Missed Frames)",
                        currentValue = update.jankFrames.toFloat(),
                        unit = "frames",
                        thresholdWarning = 5f,
                        thresholdCritical = 10f,
                        trend = MetricTrend.Stable,
                        history = listOf(MetricDataPoint(update.timestamp, update.jankFrames.toFloat(), update.screenName)),
                    ))
                    add(PerformanceMetric(
                        id = "memory",
                        type = MetricType.Memory,
                        name = "Memory Usage",
                        currentValue = update.memoryUsageMb,
                        unit = "MB",
                        thresholdWarning = 256f,
                        thresholdCritical = 512f,
                        trend = MetricTrend.Stable,
                        history = listOf(MetricDataPoint(update.timestamp, update.memoryUsageMb, update.screenName)),
                    ))
                    // Add touch latency if available
                    update.touchLatencyMs?.let { latency ->
                        add(PerformanceMetric(
                            id = "touch_latency",
                            type = MetricType.TouchLatency,
                            name = "Touch Latency",
                            currentValue = latency,
                            unit = "ms",
                            thresholdWarning = 100f,
                            thresholdCritical = 200f,
                            trend = MetricTrend.Stable,
                            history = listOf(MetricDataPoint(update.timestamp, latency, update.screenName)),
                        ))
                    }
                    // Add time to interactive if available
                    update.timeToInteractiveMs?.let { tti ->
                        add(PerformanceMetric(
                            id = "tti",
                            type = MetricType.TimeToInteractive,
                            name = "Time to Interactive",
                            currentValue = tti,
                            unit = "ms",
                            thresholdWarning = 700f,
                            thresholdCritical = 1500f,
                            trend = MetricTrend.Stable,
                            history = listOf(MetricDataPoint(update.timestamp, tti, update.screenName)),
                        ))
                    }
                    // Add recomposition rate if available
                    update.recompositionRate?.let { rate ->
                        add(PerformanceMetric(
                            id = "recomposition",
                            type = MetricType.RecompositionCount,
                            name = "Recompositions",
                            currentValue = rate,
                            unit = "recomp/s",
                            thresholdWarning = 10f,
                            thresholdCritical = 50f,
                            trend = MetricTrend.Stable,
                            history = listOf(MetricDataPoint(update.timestamp, rate, update.screenName)),
                        ))
                    }
                }
            } else {
                // Update existing metrics
                val existingMetricTypes = run.metrics.map { it.type }.toSet()
                val updatedExisting = run.metrics.map { metric ->
                    when (metric.type) {
                        MetricType.FPS -> metric.copy(
                            currentValue = update.fps,
                            history = (metric.history + newPoint).takeLast(120),
                            trend = calculateTrend(metric.currentValue, update.fps),
                        )
                        MetricType.Jank -> metric.copy(
                            currentValue = update.jankFrames.toFloat(),
                            history = (metric.history + MetricDataPoint(
                                timestamp = update.timestamp,
                                value = update.jankFrames.toFloat(),
                                screenName = update.screenName,
                            )).takeLast(120),
                            trend = calculateTrend(metric.currentValue, update.jankFrames.toFloat()),
                        )
                        MetricType.FrameTime -> metric.copy(
                            currentValue = update.frameTimeMs,
                            history = (metric.history + MetricDataPoint(
                                timestamp = update.timestamp,
                                value = update.frameTimeMs,
                                screenName = update.screenName,
                            )).takeLast(120),
                            trend = calculateTrend(metric.currentValue, update.frameTimeMs),
                        )
                        MetricType.Memory -> metric.copy(
                            currentValue = update.memoryUsageMb,
                            history = (metric.history + MetricDataPoint(
                                timestamp = update.timestamp,
                                value = update.memoryUsageMb,
                                screenName = update.screenName,
                            )).takeLast(120),
                            trend = calculateTrend(metric.currentValue, update.memoryUsageMb),
                        )
                        MetricType.TouchLatency -> {
                            val latency = update.touchLatencyMs ?: metric.currentValue
                            metric.copy(
                                currentValue = latency,
                                history = (metric.history + MetricDataPoint(
                                    timestamp = update.timestamp,
                                    value = latency,
                                    screenName = update.screenName,
                                )).takeLast(120),
                                trend = calculateTrend(metric.currentValue, latency),
                            )
                        }
                        MetricType.TimeToInteractive -> {
                            val tti = update.timeToInteractiveMs ?: metric.currentValue
                            metric.copy(
                                currentValue = tti,
                                history = (metric.history + MetricDataPoint(
                                    timestamp = update.timestamp,
                                    value = tti,
                                    screenName = update.screenName,
                                )).takeLast(120),
                                trend = calculateTrend(metric.currentValue, tti),
                            )
                        }
                        MetricType.RecompositionCount -> {
                            val rate = update.recompositionRate ?: metric.currentValue
                            metric.copy(
                                currentValue = rate,
                                history = (metric.history + MetricDataPoint(
                                    timestamp = update.timestamp,
                                    value = rate,
                                    screenName = update.screenName,
                                )).takeLast(120),
                                trend = calculateTrend(metric.currentValue, rate),
                            )
                        }
                        else -> metric
                    }
                }
                // Add new metrics that weren't in the initial set
                buildList {
                    addAll(updatedExisting)
                    // Add touch latency if it becomes available and doesn't exist
                    if (!existingMetricTypes.contains(MetricType.TouchLatency) && update.touchLatencyMs != null) {
                        add(PerformanceMetric(
                            id = "touch_latency",
                            type = MetricType.TouchLatency,
                            name = "Touch Latency",
                            currentValue = update.touchLatencyMs!!,
                            unit = "ms",
                            thresholdWarning = 100f,
                            thresholdCritical = 200f,
                            trend = MetricTrend.Stable,
                            history = listOf(MetricDataPoint(update.timestamp, update.touchLatencyMs!!, update.screenName)),
                        ))
                    }
                    // Add TTI if it becomes available and doesn't exist
                    if (!existingMetricTypes.contains(MetricType.TimeToInteractive) && update.timeToInteractiveMs != null) {
                        add(PerformanceMetric(
                            id = "tti",
                            type = MetricType.TimeToInteractive,
                            name = "Time to Interactive",
                            currentValue = update.timeToInteractiveMs!!,
                            unit = "ms",
                            thresholdWarning = 700f,
                            thresholdCritical = 1500f,
                            trend = MetricTrend.Stable,
                            history = listOf(MetricDataPoint(update.timestamp, update.timeToInteractiveMs!!, update.screenName)),
                        ))
                    }
                    // Add recomposition rate if it becomes available and doesn't exist
                    if (!existingMetricTypes.contains(MetricType.RecompositionCount) && update.recompositionRate != null) {
                        add(PerformanceMetric(
                            id = "recomposition",
                            type = MetricType.RecompositionCount,
                            name = "Recompositions",
                            currentValue = update.recompositionRate!!,
                            unit = "recomp/s",
                            thresholdWarning = 10f,
                            thresholdCritical = 50f,
                            trend = MetricTrend.Stable,
                            history = listOf(MetricDataPoint(update.timestamp, update.recompositionRate!!, update.screenName)),
                        ))
                    }
                }
            }

            currentRun = run.copy(
                metrics = updatedMetrics,
                overallHealth = calculateOverallHealth(updatedMetrics),
            )
        }
    }

    // Initial fetch as fallback (only if we don't already have data from initial metrics)
    LaunchedEffect(dataSourceMode, clientProvider) {
        // Skip fetch if we already have data from initial metrics
        if (currentRun != null) {
            isLoading = false
            return@LaunchedEffect
        }
        isLoading = true
        error = null
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            try {
                val dataSource = dev.jasonpearson.automobile.desktop.core.datasource.DataSourceFactory.createPerformanceDataSource(dataSourceMode, clientProvider)
                when (val result = dataSource.getPerformanceRun()) {
                    is dev.jasonpearson.automobile.desktop.core.datasource.Result.Success -> {
                        // Only update if we still don't have data (stream might have pushed by now)
                        if (currentRun == null) {
                            currentRun = result.data
                        }
                        isLoading = false
                    }
                    is dev.jasonpearson.automobile.desktop.core.datasource.Result.Error -> {
                        error = result.message
                        isLoading = false
                    }
                    is dev.jasonpearson.automobile.desktop.core.datasource.Result.Loading -> {
                        // Keep loading state
                    }
                }
            } catch (e: Exception) {
                error = e.message ?: "Unknown error"
                isLoading = false
            }
        }
    }

    when (currentScreen) {
        PerformanceScreen.Overview -> currentRun?.let { run ->
            PerformanceOverviewScreen(
                run = run,
                onMetricSelected = { metric ->
                    selectedMetric = metric
                    currentScreen = PerformanceScreen.MetricDetail
                },
            )
        }
        PerformanceScreen.MetricDetail -> {
            // Get the latest version of the metric from currentRun for real-time updates
            val run = currentRun
            val metric = run?.metrics?.find { it.type == selectedMetric?.type } ?: selectedMetric
            if (metric != null && run != null) {
                MetricDetailScreen(
                    metric = metric,
                    run = run,
                    onBack = { currentScreen = PerformanceScreen.Overview },
                )
            } else {
                currentScreen = PerformanceScreen.Overview
            }
        }
    }
}

@Composable
private fun PerformanceOverviewScreen(
    run: PerformanceRun,
    onMetricSelected: (PerformanceMetric) -> Unit,
) {
    val colors = SharedTheme.globalColors
    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(scrollState).padding(16.dp),
    ) {

        if (run.metrics.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(8.dp))
                    .padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        "Waiting for performance data...",
                        fontSize = 13.sp,
                        color = colors.text.normal.copy(alpha = 0.6f),
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Interact with your app to see metrics",
                        fontSize = 11.sp,
                        color = colors.text.normal.copy(alpha = 0.4f),
                    )
                }
            }
        }

        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val isWide = maxWidth >= 400.dp
            if (isWide && run.metrics.isNotEmpty()) {
                // 2 columns
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    run.metrics.chunked(2).forEach { row ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            row.forEach { metric ->
                                MetricCard(
                                    metric = metric,
                                    onClick = { onMetricSelected(metric) },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                            if (row.size == 1) {
                                Spacer(Modifier.weight(1f))
                            }
                        }
                    }
                }
            } else if (run.metrics.isNotEmpty()) {
                // Single column
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    run.metrics.forEach { metric ->
                        MetricCard(
                            metric = metric,
                            onClick = { onMetricSelected(metric) },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }

    }
}

@Composable
private fun MetricDetailScreen(
    metric: PerformanceMetric,
    run: PerformanceRun,
    onBack: () -> Unit,
) {
    val colors = SharedTheme.globalColors
    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(scrollState).padding(16.dp),
    ) {
        Link("← Back", onClick = onBack)
        Spacer(Modifier.height(12.dp))

        // Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(metric.name, fontSize = 18.sp)
            }
            CurrentValueDisplay(metric = metric)
        }

        Spacer(Modifier.height(20.dp))

        // Timeline graph (updates in real-time as metric.history is updated)
        MetricTimelineGraph(metric = metric)

        Spacer(Modifier.height(20.dp))

        // Threshold info
        Text("Thresholds", fontSize = 14.sp, color = colors.text.normal.copy(alpha = 0.8f))
        Spacer(Modifier.height(8.dp))
        Row(
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            ThresholdIndicator(
                label = "Warning",
                value = "${metric.thresholdWarning.toInt()}${metric.unit}",
                color = Color(0xFFFFC107),
            )
            ThresholdIndicator(
                label = "Critical",
                value = "${metric.thresholdCritical.toInt()}${metric.unit}",
                color = Color(0xFFFF5722),
            )
        }
    }
}

@Composable
private fun MetricCard(
    metric: PerformanceMetric,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = SharedTheme.globalColors

    val statusColor = when {
        metric.type == MetricType.FPS -> {
            // For FPS, lower is worse
            when {
                metric.currentValue < metric.thresholdCritical -> Color(0xFFFF5722)
                metric.currentValue < metric.thresholdWarning -> Color(0xFFFFC107)
                else -> Color(0xFF4CAF50)
            }
        }
        else -> {
            // For other metrics (latency, time, jank), higher is worse
            when {
                metric.currentValue > metric.thresholdCritical -> Color(0xFFFF5722)
                metric.currentValue > metric.thresholdWarning -> Color(0xFFFFC107)
                else -> Color(0xFF4CAF50)
            }
        }
    }

    val trendIcon = when (metric.trend) {
        MetricTrend.Up -> "↑"
        MetricTrend.Down -> "↓"
        MetricTrend.Stable -> "→"
    }

    Box(
        modifier = modifier
            .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(12.dp),
    ) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(metric.name, fontSize = 12.sp, color = colors.text.normal.copy(alpha = 0.7f))
                Box(modifier = Modifier.size(8.dp).background(statusColor, CircleShape))
            }

            Spacer(Modifier.height(8.dp))

            Row(
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    "${metric.currentValue.toInt()}",
                    fontSize = 24.sp,
                )
                Text(
                    metric.unit,
                    fontSize = 12.sp,
                    color = colors.text.normal.copy(alpha = 0.5f),
                    modifier = Modifier.padding(bottom = 4.dp),
                )
                Spacer(Modifier.weight(1f))
                Text(
                    trendIcon,
                    fontSize = 14.sp,
                    color = colors.text.normal.copy(alpha = 0.4f),
                )
            }

            Spacer(Modifier.height(8.dp))

            // Mini sparkline
            MiniSparkline(
                data = metric.history.takeLast(20).map { it.value },
                color = statusColor,
                metricType = metric.type,
                modifier = Modifier.fillMaxWidth().height(24.dp),
            )
        }
    }
}

/**
 * Get fixed Y-axis range for a metric type.
 * Returns Pair(minValue, maxValue) for consistent chart scaling.
 */
private fun getFixedYAxisRange(metricType: MetricType): Pair<Float, Float> {
    return when (metricType) {
        MetricType.FPS -> 0f to 120f
        MetricType.FrameTime -> 0f to 5000f // 5 seconds
        MetricType.Memory -> 0f to 1024f // 1 GB
        MetricType.TouchLatency -> 0f to 2000f // 2 seconds
        MetricType.Jank -> 0f to 30f // 30 missed frames
        MetricType.TimeToInteractive -> 0f to 5000f // 5 seconds
        MetricType.TimeToFirstFrame -> 0f to 5000f // 5 seconds
        MetricType.RecompositionCount -> 0f to 200f // 200 recomp/s
    }
}

/**
 * Convert a value to logarithmic scale for chart display.
 * Maps values from [0, max] to [0, 1] using log scale.
 */
private fun toLogScale(value: Float, max: Float): Float {
    if (value <= 0f || max <= 0f) return 0f
    // Use log(1 + value) to handle 0 values smoothly
    // Normalize to [0, 1] range
    return kotlin.math.ln(1f + value) / kotlin.math.ln(1f + max)
}

@Composable
private fun MiniSparkline(
    data: List<Float>,
    color: Color,
    metricType: MetricType,
    modifier: Modifier = Modifier,
) {
    if (data.isEmpty()) return

    val (_, fixedMax) = getFixedYAxisRange(metricType)

    Box(
        modifier = modifier.drawBehind {
            if (data.size < 2) return@drawBehind

            val path = Path()
            val stepX = size.width / (data.size - 1)

            data.forEachIndexed { index, value ->
                val x = index * stepX
                // Use logarithmic scale
                val clampedValue = value.coerceIn(0f, fixedMax)
                val normalizedY = toLogScale(clampedValue, fixedMax)
                val y = size.height - (normalizedY * size.height)

                if (index == 0) {
                    path.moveTo(x, y)
                } else {
                    path.lineTo(x, y)
                }
            }

            drawPath(
                path = path,
                color = color.copy(alpha = 0.6f),
                style = Stroke(width = 2f),
            )
        }
    )
}

@Composable
private fun CurrentValueDisplay(metric: PerformanceMetric) {
    val colors = SharedTheme.globalColors

    Column(horizontalAlignment = Alignment.End) {
        Row(
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text("${metric.currentValue.toInt()}", fontSize = 28.sp)
            Text(metric.unit, fontSize = 12.sp, color = colors.text.normal.copy(alpha = 0.5f))
        }
        Text(
            when (metric.trend) {
                MetricTrend.Up -> "↑ Trending up"
                MetricTrend.Down -> "↓ Trending down"
                MetricTrend.Stable -> "→ Stable"
            },
            fontSize = 10.sp,
            color = colors.text.normal.copy(alpha = 0.5f),
        )
    }
}

@Composable
private fun MetricTimelineGraph(
    metric: PerformanceMetric,
) {
    val data = metric.history

    if (data.isEmpty()) return

    // Use fixed Y-axis range based on metric type
    val (_, fixedMax) = getFixedYAxisRange(metric.type)

    // Calculate status color (same as tile cards)
    val statusColor = when {
        metric.type == MetricType.FPS -> {
            // For FPS, lower is worse
            when {
                metric.currentValue < metric.thresholdCritical -> Color(0xFFFF5722)
                metric.currentValue < metric.thresholdWarning -> Color(0xFFFFC107)
                else -> Color(0xFF4CAF50)
            }
        }
        else -> {
            // For other metrics (latency, time, jank), higher is worse
            when {
                metric.currentValue > metric.thresholdCritical -> Color(0xFFFF5722)
                metric.currentValue > metric.thresholdWarning -> Color(0xFFFFC107)
                else -> Color(0xFF4CAF50)
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(150.dp)
            .drawBehind {
                if (data.size < 2) return@drawBehind

                val stepX = size.width / (data.size - 1)

                // Draw data line (same style as tile sparkline, with log scale)
                val path = Path()
                data.forEachIndexed { index, point ->
                    val x = index * stepX
                    // Use logarithmic scale
                    val clampedValue = point.value.coerceIn(0f, fixedMax)
                    val normalizedY = toLogScale(clampedValue, fixedMax)
                    val y = size.height - (normalizedY * size.height)

                    if (index == 0) {
                        path.moveTo(x, y)
                    } else {
                        path.lineTo(x, y)
                    }
                }

                drawPath(
                    path = path,
                    color = statusColor.copy(alpha = 0.6f),
                    style = Stroke(width = 2f),
                )
            }
    )
}

@Composable
private fun ThresholdIndicator(
    label: String,
    value: String,
    color: Color,
) {
    val colors = SharedTheme.globalColors

    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(width = 16.dp, height = 2.dp)
                .background(color)
        )
        Text(label, fontSize = 11.sp, color = colors.text.normal.copy(alpha = 0.6f))
        Text(value, fontSize = 11.sp)
    }
}

// Helper function to calculate metric trend
private fun calculateTrend(oldValue: Float, newValue: Float): MetricTrend {
    val diff = newValue - oldValue
    return when {
        diff > 1f -> MetricTrend.Up
        diff < -1f -> MetricTrend.Down
        else -> MetricTrend.Stable
    }
}

// Helper function to calculate overall health from metrics
private fun calculateOverallHealth(metrics: List<PerformanceMetric>): HealthStatus {
    var hasCritical = false
    var hasWarning = false

    for (metric in metrics) {
        val isBetter = when (metric.type) {
            MetricType.FPS -> metric.currentValue >= metric.thresholdWarning
            else -> metric.currentValue <= metric.thresholdWarning
        }
        val isCritical = when (metric.type) {
            MetricType.FPS -> metric.currentValue < metric.thresholdCritical
            else -> metric.currentValue > metric.thresholdCritical
        }

        if (isCritical) hasCritical = true
        if (!isBetter) hasWarning = true
    }

    return when {
        hasCritical -> HealthStatus.Critical
        hasWarning -> HealthStatus.Warning
        else -> HealthStatus.Healthy
    }

}
