package dev.jasonpearson.automobile.ide.performance

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
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
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.Link
import org.jetbrains.jewel.ui.component.OutlinedButton
import org.jetbrains.jewel.ui.component.Text
import com.intellij.openapi.diagnostic.Logger
import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.ObservationStreamClient
import dev.jasonpearson.automobile.ide.daemon.PerformanceStreamUpdate
import dev.jasonpearson.automobile.ide.datasource.DataSourceMode

private val LOG = Logger.getInstance("PerformanceDashboard")

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
) {
    var currentScreen by remember { mutableStateOf(PerformanceScreen.Overview) }
    var selectedMetric by remember { mutableStateOf<PerformanceMetric?>(null) }
    var selectedScreenFilter by remember { mutableStateOf<String?>(null) }
    var compareRunId by remember { mutableStateOf<String?>(null) }

    // Live/Paused mode for real-time streaming
    var isLive by remember { mutableStateOf(true) }

    // Fetch performance run from data source
    var currentRun by remember { mutableStateOf<PerformanceRun?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    // Real-time performance metrics history (for live streaming)
    var realtimeMetricsHistory by remember { mutableStateOf<List<MetricDataPoint>>(emptyList()) }
    var lastPerformanceUpdate by remember { mutableStateOf<PerformanceStreamUpdate?>(null) }

    // Screen names from navigation graph for filtering
    var availableScreens by remember { mutableStateOf<List<String>>(emptyList()) }

    // Collect navigation updates to populate screen filter
    LaunchedEffect(observationStreamClient) {
        if (observationStreamClient == null) return@LaunchedEffect

        observationStreamClient.navigationUpdates.collect { update ->
            // Extract screen names from navigation nodes
            val screenNames = update.nodes.map { it.screenName }.distinct().sorted()
            availableScreens = screenNames
        }
    }

    // Collect real-time performance updates from the stream
    LaunchedEffect(observationStreamClient, isLive) {
        if (observationStreamClient == null || !isLive) return@LaunchedEffect

        LOG.info("Starting performance updates collection from stream client")
        observationStreamClient.performanceUpdates.collect { update ->
            LOG.info("Received performance update - fps=${update.fps}, jankFrames=${update.jankFrames}, screenName=${update.screenName}")
            lastPerformanceUpdate = update

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
                listOf(
                    PerformanceMetric(
                        id = "fps",
                        type = MetricType.FPS,
                        name = "Frame Rate",
                        currentValue = update.fps,
                        unit = "fps",
                        thresholdWarning = 55f,
                        thresholdCritical = 45f,
                        trend = MetricTrend.Stable,
                        history = listOf(newPoint),
                    ),
                    PerformanceMetric(
                        id = "frame_time",
                        type = MetricType.FrameTime,
                        name = "Frame Time",
                        currentValue = update.frameTimeMs,
                        unit = "ms",
                        thresholdWarning = 18f,
                        thresholdCritical = 33f,
                        trend = MetricTrend.Stable,
                        history = listOf(MetricDataPoint(update.timestamp, update.frameTimeMs, update.screenName)),
                    ),
                    PerformanceMetric(
                        id = "jank",
                        type = MetricType.Jank,
                        name = "Jank (Missed Frames)",
                        currentValue = update.jankFrames.toFloat(),
                        unit = "frames",
                        thresholdWarning = 5f,
                        thresholdCritical = 10f,
                        trend = MetricTrend.Stable,
                        history = listOf(MetricDataPoint(update.timestamp, update.jankFrames.toFloat(), update.screenName)),
                    ),
                    PerformanceMetric(
                        id = "memory",
                        type = MetricType.Memory,
                        name = "Memory Usage",
                        currentValue = update.memoryUsageMb,
                        unit = "MB",
                        thresholdWarning = 256f,
                        thresholdCritical = 512f,
                        trend = MetricTrend.Stable,
                        history = listOf(MetricDataPoint(update.timestamp, update.memoryUsageMb, update.screenName)),
                    ),
                )
            } else {
                // Update existing metrics
                run.metrics.map { metric ->
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
                        // TouchLatency requires actual touch interaction events, not streaming frame data
                        else -> metric
                    }
                }
            }

            // Detect anomalies from real-time data
            val newAnomalies = detectAnomalies(update, updatedMetrics)

            currentRun = run.copy(
                metrics = updatedMetrics,
                anomalies = (run.anomalies + newAnomalies).distinctBy { it.id }.takeLast(50),
                overallHealth = calculateOverallHealth(updatedMetrics),
            )
        }
    }

    // Initial fetch as fallback (in case stream hasn't pushed yet)
    LaunchedEffect(dataSourceMode, clientProvider) {
        isLoading = true
        error = null
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            try {
                val dataSource = dev.jasonpearson.automobile.ide.datasource.DataSourceFactory.createPerformanceDataSource(dataSourceMode, clientProvider)
                when (val result = dataSource.getPerformanceRun()) {
                    is dev.jasonpearson.automobile.ide.datasource.Result.Success -> {
                        currentRun = result.data
                        isLoading = false
                    }
                    is dev.jasonpearson.automobile.ide.datasource.Result.Error -> {
                        error = result.message
                        isLoading = false
                    }
                    is dev.jasonpearson.automobile.ide.datasource.Result.Loading -> {
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
            // Merge screens from run and navigation graph
            val allScreens = (run.screensAnalyzed + availableScreens).distinct().sorted()
            val updatedRun = if (allScreens != run.screensAnalyzed) {
                run.copy(screensAnalyzed = allScreens)
            } else {
                run
            }

            PerformanceOverviewScreen(
                run = updatedRun,
                selectedScreenFilter = selectedScreenFilter,
                onScreenFilterChanged = { selectedScreenFilter = it },
                onMetricSelected = { metric ->
                    selectedMetric = metric
                    currentScreen = PerformanceScreen.MetricDetail
                },
                onAnomalyClicked = { anomaly ->
                    anomaly.screenName?.let { onNavigateToScreen(it) }
                },
                onCompareRuns = { compareRunId = it },
                isLive = isLive,
                onLiveToggle = { isLive = it },
                hasStreamClient = observationStreamClient != null,
                lastUpdate = lastPerformanceUpdate,
            )
        }
        PerformanceScreen.MetricDetail -> {
            val metric = selectedMetric
            val run = currentRun
            if (metric != null && run != null) {
                MetricDetailScreen(
                    metric = metric,
                    run = run,
                    onBack = { currentScreen = PerformanceScreen.Overview },
                    onScreenClicked = onNavigateToScreen,
                    onTestClicked = onNavigateToTest,
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
    selectedScreenFilter: String?,
    onScreenFilterChanged: (String?) -> Unit,
    onMetricSelected: (PerformanceMetric) -> Unit,
    onAnomalyClicked: (PerformanceAnomaly) -> Unit,
    onCompareRuns: (String?) -> Unit,
    isLive: Boolean = true,
    onLiveToggle: (Boolean) -> Unit = {},
    hasStreamClient: Boolean = false,
    lastUpdate: PerformanceStreamUpdate? = null,
) {
    val colors = JewelTheme.globalColors
    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(scrollState).padding(16.dp),
    ) {
        // Header
        Text("Performance Overview", fontSize = 18.sp)

        // Real-time stats row (when live streaming)
        if (hasStreamClient && isLive && lastUpdate != null) {
            Spacer(Modifier.height(12.dp))
            RealTimeStatsRow(update = lastUpdate)
        }

        Spacer(Modifier.height(16.dp))

        // Screen filter chips
        Text("Filter by Screen", fontSize = 12.sp, color = colors.text.normal.copy(alpha = 0.6f))
        Spacer(Modifier.height(6.dp))
        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            FilterChip(
                label = "All",
                selected = selectedScreenFilter == null,
                onClick = { onScreenFilterChanged(null) },
            )
            run.screensAnalyzed.take(4).forEach { screen ->
                FilterChip(
                    label = screen,
                    selected = selectedScreenFilter == screen,
                    onClick = { onScreenFilterChanged(screen) },
                )
            }
        }

        Spacer(Modifier.height(20.dp))

        // Metrics grid
        Text("Metrics", fontSize = 14.sp, color = colors.text.normal.copy(alpha = 0.8f))
        Spacer(Modifier.height(8.dp))

        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val isWide = maxWidth >= 400.dp
            if (isWide) {
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
            } else {
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

        Spacer(Modifier.height(20.dp))

        // Anomalies section
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Anomalies", fontSize = 14.sp, color = colors.text.normal.copy(alpha = 0.8f))
            Text(
                "${run.anomalies.size} detected",
                fontSize = 11.sp,
                color = colors.text.normal.copy(alpha = 0.5f),
            )
        }
        Spacer(Modifier.height(8.dp))

        if (run.anomalies.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(8.dp))
                    .padding(16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "No anomalies detected",
                    fontSize = 12.sp,
                    color = colors.text.normal.copy(alpha = 0.5f),
                )
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                run.anomalies.forEach { anomaly ->
                    AnomalyRow(
                        anomaly = anomaly,
                        onClick = { onAnomalyClicked(anomaly) },
                    )
                }
            }
        }

        Spacer(Modifier.height(20.dp))

        // Compare runs section
        Text("Compare Runs", fontSize = 14.sp, color = colors.text.normal.copy(alpha = 0.8f))
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { onCompareRuns(PerformanceMockData.previousRun.id) }) {
                Text("vs Previous Run")
            }
            OutlinedButton(onClick = { /* TODO: Select baseline */ }) {
                Text("Select Baseline...")
            }
        }
    }
}

@Composable
private fun MetricDetailScreen(
    metric: PerformanceMetric,
    run: PerformanceRun,
    onBack: () -> Unit,
    onScreenClicked: (String) -> Unit,
    onTestClicked: (String) -> Unit,
) {
    val colors = JewelTheme.globalColors
    val scrollState = rememberScrollState()

    // Find anomalies related to this metric
    val relatedAnomalies = run.anomalies.filter { it.metricType == metric.type }

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
                Text(
                    "Deep dive into metric over time",
                    color = colors.text.normal.copy(alpha = 0.6f),
                    fontSize = 12.sp,
                )
            }
            CurrentValueDisplay(metric = metric)
        }

        Spacer(Modifier.height(20.dp))

        // Timeline graph
        Text("Timeline", fontSize = 14.sp, color = colors.text.normal.copy(alpha = 0.8f))
        Spacer(Modifier.height(8.dp))

        MetricTimelineGraph(
            metric = metric,
            onPointClicked = { point ->
                point.screenName?.let { onScreenClicked(it) }
            },
        )

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

        Spacer(Modifier.height(20.dp))

        // Related anomalies
        if (relatedAnomalies.isNotEmpty()) {
            Text("Related Anomalies", fontSize = 14.sp, color = colors.text.normal.copy(alpha = 0.8f))
            Spacer(Modifier.height(8.dp))
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                relatedAnomalies.forEach { anomaly ->
                    AnomalyRow(
                        anomaly = anomaly,
                        onClick = { anomaly.screenName?.let { onScreenClicked(it) } },
                    )
                }
            }
            Spacer(Modifier.height(20.dp))
        }

        // Screen breakdown
        Text("By Screen", fontSize = 14.sp, color = colors.text.normal.copy(alpha = 0.8f))
        Spacer(Modifier.height(8.dp))

        val screenAverages = metric.history
            .filter { it.screenName != null }
            .groupBy { it.screenName!! }
            .mapValues { (_, points) -> points.map { it.value }.average().toFloat() }

        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            screenAverages.entries.sortedByDescending { it.value }.forEach { (screen, avg) ->
                ScreenMetricRow(
                    screenName = screen,
                    value = avg,
                    unit = metric.unit,
                    maxValue = screenAverages.values.maxOrNull() ?: avg,
                    onClick = { onScreenClicked(screen) },
                )
            }
        }

        Spacer(Modifier.height(20.dp))

        // Export action
        OutlinedButton(onClick = { /* TODO: Export snapshot */ }) {
            Text("Export Snapshot")
        }
    }
}

@Composable
private fun FilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val colors = JewelTheme.globalColors
    val bgColor = if (selected) colors.text.normal.copy(alpha = 0.15f) else Color.Transparent
    val borderColor = if (selected) colors.text.normal.copy(alpha = 0.3f) else colors.text.normal.copy(alpha = 0.15f)
    val textColor = if (selected) colors.text.normal else colors.text.normal.copy(alpha = 0.6f)

    Box(
        modifier = Modifier
            .border(1.dp, borderColor, RoundedCornerShape(12.dp))
            .background(bgColor, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(label, fontSize = 11.sp, color = textColor)
    }
}

@Composable
private fun MetricCard(
    metric: PerformanceMetric,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = JewelTheme.globalColors

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
                modifier = Modifier.fillMaxWidth().height(24.dp),
            )
        }
    }
}

@Composable
private fun MiniSparkline(
    data: List<Float>,
    color: Color,
    modifier: Modifier = Modifier,
) {
    if (data.isEmpty()) return

    val minVal = data.minOrNull() ?: 0f
    val maxVal = data.maxOrNull() ?: 1f
    val range = (maxVal - minVal).coerceAtLeast(0.1f)

    Box(
        modifier = modifier.drawBehind {
            if (data.size < 2) return@drawBehind

            val path = Path()
            val stepX = size.width / (data.size - 1)

            data.forEachIndexed { index, value ->
                val x = index * stepX
                val y = size.height - ((value - minVal) / range * size.height)

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
private fun AnomalyRow(
    anomaly: PerformanceAnomaly,
    onClick: () -> Unit,
) {
    val colors = JewelTheme.globalColors
    val severityColor = when (anomaly.severity) {
        HealthStatus.Warning -> Color(0xFFFFC107)
        HealthStatus.Critical -> Color(0xFFFF5722)
        else -> colors.text.normal.copy(alpha = 0.5f)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(6.dp))
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(modifier = Modifier.size(8.dp).background(severityColor, CircleShape))

        Column(modifier = Modifier.weight(1f)) {
            Text(anomaly.message, fontSize = 12.sp)
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                anomaly.screenName?.let {
                    Text(it, fontSize = 10.sp, color = colors.text.normal.copy(alpha = 0.5f))
                }
                anomaly.testName?.let {
                    Text("• $it", fontSize = 10.sp, color = colors.text.normal.copy(alpha = 0.5f))
                }
            }
        }

        Text(
            "${anomaly.value.toInt()} > ${anomaly.threshold.toInt()}",
            fontSize = 10.sp,
            color = severityColor,
        )
    }
}

@Composable
private fun CurrentValueDisplay(metric: PerformanceMetric) {
    val colors = JewelTheme.globalColors

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
    onPointClicked: (MetricDataPoint) -> Unit,
) {
    val colors = JewelTheme.globalColors
    val data = metric.history

    if (data.isEmpty()) return

    val minVal = data.minOf { it.value }
    val maxVal = data.maxOf { it.value }
    val range = (maxVal - minVal).coerceAtLeast(0.1f)

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(150.dp)
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(8.dp))
            .padding(8.dp)
            .drawBehind {
                if (data.size < 2) return@drawBehind

                val stepX = size.width / (data.size - 1)

                // Draw threshold lines
                val warningY = size.height - ((metric.thresholdWarning - minVal) / range * size.height)
                val criticalY = size.height - ((metric.thresholdCritical - minVal) / range * size.height)

                // Warning threshold
                if (warningY in 0f..size.height) {
                    drawLine(
                        color = Color(0xFFFFC107).copy(alpha = 0.3f),
                        start = Offset(0f, warningY),
                        end = Offset(size.width, warningY),
                        strokeWidth = 1f,
                    )
                }

                // Critical threshold
                if (criticalY in 0f..size.height) {
                    drawLine(
                        color = Color(0xFFFF5722).copy(alpha = 0.3f),
                        start = Offset(0f, criticalY),
                        end = Offset(size.width, criticalY),
                        strokeWidth = 1f,
                    )
                }

                // Draw data line
                val path = Path()
                data.forEachIndexed { index, point ->
                    val x = index * stepX
                    val y = size.height - ((point.value - minVal) / range * size.height)

                    if (index == 0) {
                        path.moveTo(x, y)
                    } else {
                        path.lineTo(x, y)
                    }
                }

                drawPath(
                    path = path,
                    color = Color(0xFF2196F3),
                    style = Stroke(width = 2f),
                )

                // Draw points
                data.forEachIndexed { index, point ->
                    val x = index * stepX
                    val y = size.height - ((point.value - minVal) / range * size.height)

                    drawCircle(
                        color = Color(0xFF2196F3),
                        radius = 3f,
                        center = Offset(x, y),
                    )
                }
            }
    )
}

@Composable
private fun ThresholdIndicator(
    label: String,
    value: String,
    color: Color,
) {
    val colors = JewelTheme.globalColors

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

@Composable
private fun ScreenMetricRow(
    screenName: String,
    value: Float,
    unit: String,
    maxValue: Float,
    onClick: () -> Unit,
) {
    val colors = JewelTheme.globalColors
    val progress = (value / maxValue).coerceIn(0f, 1f)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            screenName,
            fontSize = 11.sp,
            modifier = Modifier.width(80.dp),
        )

        Box(
            modifier = Modifier
                .weight(1f)
                .height(8.dp)
                .background(colors.text.normal.copy(alpha = 0.1f), RoundedCornerShape(4.dp))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(progress)
                    .height(8.dp)
                    .background(Color(0xFF2196F3), RoundedCornerShape(4.dp))
            )
        }

        Text(
            "${value.toInt()}$unit",
            fontSize = 10.sp,
            color = colors.text.normal.copy(alpha = 0.6f),
            modifier = Modifier.width(50.dp),
        )
    }
}

@Composable
private fun RealTimeStatsRow(update: PerformanceStreamUpdate) {
    val colors = JewelTheme.globalColors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(8.dp))
            .padding(12.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        RealTimeStat(
            label = "FPS",
            value = "${update.fps.toInt()}",
            color = when {
                update.fps >= 55 -> Color(0xFF4CAF50)
                update.fps >= 45 -> Color(0xFFFFC107)
                else -> Color(0xFFFF5722)
            },
        )
        RealTimeStat(
            label = "Frame Time",
            value = "${update.frameTimeMs.toInt()}ms",
            color = when {
                update.frameTimeMs <= 16 -> Color(0xFF4CAF50)
                update.frameTimeMs <= 33 -> Color(0xFFFFC107)
                else -> Color(0xFFFF5722)
            },
        )
        RealTimeStat(
            label = "Jank",
            value = "${update.jankFrames}",
            color = when {
                update.jankFrames == 0 -> Color(0xFF4CAF50)
                update.jankFrames <= 3 -> Color(0xFFFFC107)
                else -> Color(0xFFFF5722)
            },
        )
        RealTimeStat(
            label = "Memory",
            value = "${update.memoryUsageMb.toInt()}MB",
            color = Color(0xFF2196F3),
        )
        if (update.screenName != null) {
            RealTimeStat(
                label = "Screen",
                value = update.screenName,
                color = colors.text.normal.copy(alpha = 0.7f),
            )
        }
    }
}

@Composable
private fun RealTimeStat(
    label: String,
    value: String,
    color: Color,
) {
    val colors = JewelTheme.globalColors

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            value,
            fontSize = 16.sp,
            color = color,
        )
        Text(
            label,
            fontSize = 10.sp,
            color = colors.text.normal.copy(alpha = 0.5f),
        )
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

// Helper function to detect anomalies from real-time update
private fun detectAnomalies(
    update: PerformanceStreamUpdate,
    metrics: List<PerformanceMetric>,
): List<PerformanceAnomaly> {
    val anomalies = mutableListOf<PerformanceAnomaly>()

    // Check FPS anomaly
    val fpsMetric = metrics.find { it.type == MetricType.FPS }
    if (fpsMetric != null && update.fps < fpsMetric.thresholdWarning) {
        val severity = if (update.fps < fpsMetric.thresholdCritical) HealthStatus.Critical else HealthStatus.Warning
        anomalies.add(
            PerformanceAnomaly(
                id = "fps-${update.timestamp}",
                metricType = MetricType.FPS,
                severity = severity,
                message = "FPS drop detected: ${update.fps.toInt()} fps",
                timestamp = update.timestamp,
                screenName = update.screenName,
                testName = null,
                value = update.fps,
                threshold = fpsMetric.thresholdWarning,
            )
        )
    }

    // Check jank anomaly
    val jankMetric = metrics.find { it.type == MetricType.Jank }
    if (jankMetric != null && update.jankFrames > jankMetric.thresholdWarning) {
        val severity = if (update.jankFrames > jankMetric.thresholdCritical) HealthStatus.Critical else HealthStatus.Warning
        anomalies.add(
            PerformanceAnomaly(
                id = "jank-${update.timestamp}",
                metricType = MetricType.Jank,
                severity = severity,
                message = "Jank detected: ${update.jankFrames} dropped frames",
                timestamp = update.timestamp,
                screenName = update.screenName,
                testName = null,
                value = update.jankFrames.toFloat(),
                threshold = jankMetric.thresholdWarning,
            )
        )
    }

    // Check frame time anomaly (>16ms means can't hit 60fps)
    val frameTimeMetric = metrics.find { it.type == MetricType.FrameTime }
    if (frameTimeMetric != null && update.frameTimeMs > frameTimeMetric.thresholdWarning) {
        val severity = if (update.frameTimeMs > frameTimeMetric.thresholdCritical) HealthStatus.Critical else HealthStatus.Warning
        anomalies.add(
            PerformanceAnomaly(
                id = "frametime-${update.timestamp}",
                metricType = MetricType.FrameTime,
                severity = severity,
                message = "Slow frame: ${update.frameTimeMs.toInt()}ms render time",
                timestamp = update.timestamp,
                screenName = update.screenName,
                testName = null,
                value = update.frameTimeMs,
                threshold = frameTimeMetric.thresholdWarning,
            )
        )
    }

    return anomalies
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
