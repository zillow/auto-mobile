package dev.jasonpearson.automobile.ide.failures

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.datasource.DataSourceMode
import dev.jasonpearson.automobile.ide.time.Clock
import dev.jasonpearson.automobile.ide.time.SystemClock
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.Text

/**
 * Main Failures dashboard showing crashes, ANRs, and tool call failures
 */
@Composable
fun FailuresDashboard(
    onNavigateToScreen: (String) -> Unit = {},
    onNavigateToTest: (String) -> Unit = {},
    onNavigateToSource: (fileName: String, lineNumber: Int) -> Unit = { _, _ -> },
    clientProvider: (() -> AutoMobileClient)? = null,
    dataSourceMode: DataSourceMode = DataSourceMode.Fake,
    modifier: Modifier = Modifier,
) {

    // Retry counter - incrementing triggers LaunchedEffect to reload
    var retryCounter by remember { mutableIntStateOf(0) }

    // Create data sources
    val mockDataSource = remember { MockFailuresDataSource() }
    val mcpDataSource = remember(clientProvider) {
        clientProvider?.let { McpFailuresDataSource(it) }
    }
    val emptyDataSource = remember { EmptyFailuresDataSource() }

    val currentDataSource: FailuresDataSource = when {
        dataSourceMode == DataSourceMode.Fake -> mockDataSource
        mcpDataSource != null -> mcpDataSource
        else -> emptyDataSource  // Show empty data in Real mode when MCP not available
    }

    // Data state
    var failureGroups by remember { mutableStateOf<List<FailureGroup>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    var selectedFailure by remember { mutableStateOf<FailureGroup?>(null) }
    var filterType by remember { mutableStateOf<FailureType?>(null) }

    // Load data when data source changes or retry is triggered
    LaunchedEffect(currentDataSource, dataSourceMode, retryCounter) {
        isLoading = true
        errorMessage = null
        when (val result = currentDataSource.getFailureGroups()) {
            is DataSourceResult.Success -> {
                failureGroups = result.data
                isLoading = false
            }
            is DataSourceResult.Error -> {
                errorMessage = result.message
                isLoading = false
            }
        }
    }

    Column(modifier = modifier.fillMaxSize().padding(16.dp)) {
        if (selectedFailure != null) {
            FailureDetailView(
                failure = selectedFailure!!,
                onBack = { selectedFailure = null },
                onNavigateToScreen = onNavigateToScreen,
                onNavigateToTest = onNavigateToTest,
                onNavigateToSource = onNavigateToSource,
            )
        } else {
            FailureListView(
                failures = failureGroups,
                filterType = filterType,
                onFilterChanged = { filterType = it },
                onFailureSelected = { selectedFailure = it },
                isLoading = isLoading,
                errorMessage = errorMessage,
                onRetry = { retryCounter++ },
                dataSource = currentDataSource,
                dataSourceMode = dataSourceMode,
            )
        }
    }
}

// Maximum number of buckets we can reasonably display
private const val MAX_DISPLAYABLE_BUCKETS = 100

/**
 * Get valid aggregation options for a date range
 * Must produce at least 2 buckets and no more than MAX_DISPLAYABLE_BUCKETS
 */
private fun getValidAggregations(dateRange: DateRange): List<TimeAggregation> {
    return TimeAggregation.entries.filter { agg ->
        val buckets = dateRange.durationMs / agg.durationMs
        buckets >= 2 && buckets <= MAX_DISPLAYABLE_BUCKETS
    }
}

/**
 * Get the next smaller date range for drill-down
 */
private fun getNextSmallerDateRange(current: DateRange): DateRange? {
    return when (current) {
        DateRange.ThirtyDays -> DateRange.SevenDays
        DateRange.SevenDays -> DateRange.ThreeDays
        DateRange.ThreeDays -> DateRange.TwentyFourHours
        DateRange.TwentyFourHours -> DateRange.OneHour
        DateRange.OneHour -> null // Can't go smaller
    }
}

/**
 * Get the best default aggregation for a date range
 */
private fun getBestAggregation(dateRange: DateRange, currentAgg: TimeAggregation): TimeAggregation {
    val valid = getValidAggregations(dateRange)
    // If current is valid, keep it
    if (currentAgg in valid) return currentAgg
    // Otherwise pick the coarsest (largest) valid granularity
    return valid.lastOrNull() ?: TimeAggregation.Minute
}

@Composable
private fun FailureListView(
    failures: List<FailureGroup>,
    filterType: FailureType?,
    onFilterChanged: (FailureType?) -> Unit,
    onFailureSelected: (FailureGroup) -> Unit,
    isLoading: Boolean,
    errorMessage: String?,
    onRetry: () -> Unit,
    dataSource: FailuresDataSource,
    dataSourceMode: DataSourceMode,
) {
    val colors = JewelTheme.globalColors
    val filteredFailures = if (filterType != null) {
        failures.filter { it.type == filterType }
    } else {
        failures
    }

    var dateRange by remember { mutableStateOf(DateRange.TwentyFourHours) }
    var timeAggregation by remember { mutableStateOf(TimeAggregation.Hour) }

    // Auto-switch aggregation when date range changes and current agg is invalid
    val validAggregations = remember(dateRange) { getValidAggregations(dateRange) }
    LaunchedEffect(dateRange) {
        val bestAgg = getBestAggregation(dateRange, timeAggregation)
        if (bestAgg != timeAggregation) {
            timeAggregation = bestAgg
        }
    }

    // Timeline data state
    var timelineData by remember { mutableStateOf<TimelineData?>(null) }
    var timelineLoading by remember { mutableStateOf(true) }

    // Load timeline data
    LaunchedEffect(dataSource, dateRange, timeAggregation) {
        timelineLoading = true
        when (val result = dataSource.getTimelineData(dateRange, timeAggregation)) {
            is DataSourceResult.Success -> {
                timelineData = result.data
                timelineLoading = false
            }
            is DataSourceResult.Error -> {
                timelineData = null
                timelineLoading = false
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
    ) {
        // Date range and aggregation selectors
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Date range selector
            Row(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier
                    .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(6.dp))
                    .padding(4.dp),
            ) {
                DateRange.entries.forEach { range ->
                    val isSelected = range == dateRange
                    Box(
                        modifier = Modifier
                            .background(
                                if (isSelected) colors.text.normal.copy(alpha = 0.15f) else Color.Transparent,
                                RoundedCornerShape(4.dp),
                            )
                            .clickable { dateRange = range }
                            .pointerHoverIcon(PointerIcon.Hand)
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    ) {
                        Text(
                            range.label,
                            fontSize = 10.sp,
                            color = if (isSelected) colors.text.normal else colors.text.normal.copy(alpha = 0.6f),
                        )
                    }
                }
            }

            // Aggregation selector (only show valid options)
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Group by:",
                    fontSize = 10.sp,
                    color = colors.text.normal.copy(alpha = 0.5f),
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier
                        .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(6.dp))
                        .padding(4.dp),
                ) {
                    validAggregations.forEach { agg ->
                        val isSelected = agg == timeAggregation
                        Box(
                            modifier = Modifier
                                .background(
                                    if (isSelected) colors.text.normal.copy(alpha = 0.15f) else Color.Transparent,
                                    RoundedCornerShape(4.dp),
                                )
                                .clickable { timeAggregation = agg }
                                .pointerHoverIcon(PointerIcon.Hand)
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                        ) {
                            Text(
                                agg.label,
                                fontSize = 10.sp,
                                color = if (isSelected) colors.text.normal else colors.text.normal.copy(alpha = 0.6f),
                            )
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        // Error banner
        if (errorMessage != null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFE53935).copy(alpha = 0.1f), RoundedCornerShape(8.dp))
                    .padding(12.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Failed to load data",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFFE53935),
                        )
                        Text(
                            errorMessage,
                            fontSize = 10.sp,
                            color = colors.text.normal.copy(alpha = 0.6f),
                        )
                    }
                    Text(
                        "Retry",
                        fontSize = 11.sp,
                        color = Color(0xFF2196F3),
                        modifier = Modifier
                            .clickable(onClick = onRetry)
                            .pointerHoverIcon(PointerIcon.Hand)
                            .padding(8.dp),
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
        }

        // Event Trends section
        val canDrillDown = getNextSmallerDateRange(dateRange) != null
        val currentTimelineData = timelineData
        if (currentTimelineData != null) {
            EventTrendsSection(
                data = currentTimelineData,
                dateRange = dateRange,
                aggregation = timeAggregation,
                onBarClick = if (canDrillDown) {
                    {
                        // Drill down to smaller time range
                        val nextRange = getNextSmallerDateRange(dateRange)
                        if (nextRange != null) {
                            dateRange = nextRange
                        }
                    }
                } else null,
            )
        } else if (timelineLoading) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(140.dp)
                    .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(8.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "Loading timeline...",
                    fontSize = 12.sp,
                    color = colors.text.normal.copy(alpha = 0.5f),
                )
            }
        }

        Spacer(Modifier.height(16.dp))

        // Filter chips
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(bottom = 12.dp),
        ) {
            FilterChip(
                label = "All",
                isSelected = filterType == null,
                onClick = { onFilterChanged(null) },
            )
            FailureType.entries.forEach { type ->
                FilterChip(
                    label = "${type.icon} ${type.label}",
                    isSelected = filterType == type,
                    onClick = { onFilterChanged(type) },
                )
            }
        }

        // Issues header
        Text(
            if (isLoading) "Issues (loading...)" else "Issues (${filteredFailures.size})",
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = colors.text.normal.copy(alpha = 0.7f),
            modifier = Modifier.padding(bottom = 8.dp),
        )

        // Failure list
        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (filteredFailures.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(32.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    if (dataSourceMode == DataSourceMode.Real && !isLoading) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                "No failures detected",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium,
                                color = colors.text.normal.copy(alpha = 0.7f),
                            )
                            Text(
                                "AutoMobile tracks crashes and ANRs via logcat and tool failures directly.",
                                fontSize = 11.sp,
                                color = colors.text.normal.copy(alpha = 0.5f),
                            )
                            Text(
                                "The SDK provides richer context and metadata but is not required.",
                                fontSize = 11.sp,
                                color = colors.text.normal.copy(alpha = 0.5f),
                            )
                        }
                    } else {
                        Text(
                            "No failures found",
                            color = colors.text.normal.copy(alpha = 0.5f),
                        )
                    }
                }
            } else {
                filteredFailures.forEach { failure ->
                    FailureListItem(
                        failure = failure,
                        onClick = { onFailureSelected(failure) },
                    )
                }
            }
        }
    }
}

@Composable
private fun FilterChip(
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val colors = JewelTheme.globalColors
    val bgColor = if (isSelected) colors.text.normal.copy(alpha = 0.15f) else Color.Transparent
    val borderColor = if (isSelected) colors.text.normal.copy(alpha = 0.3f) else colors.text.normal.copy(alpha = 0.2f)

    Box(
        modifier = Modifier
            .background(bgColor, RoundedCornerShape(4.dp))
            .border(1.dp, borderColor, RoundedCornerShape(4.dp))
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(label, fontSize = 11.sp, maxLines = 1)
    }
}

@Composable
private fun StatBox(
    label: String,
    value: String,
    color: Color,
    delta: String? = null,
    deltaPositive: Boolean = false,
) {
    val colors = JewelTheme.globalColors

    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            value,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = color,
        )
        if (delta != null) {
            Text(
                delta,
                fontSize = 9.sp,
                color = if (deltaPositive) Color(0xFF4CAF50) else Color(0xFFE53935),
            )
        }
        Text(
            label,
            fontSize = 10.sp,
            color = colors.text.normal.copy(alpha = 0.5f),
        )
    }
}

@Composable
private fun EventTrendsSection(
    data: TimelineData,
    dateRange: DateRange,
    aggregation: TimeAggregation,
    onBarClick: (() -> Unit)?,
) {
    val colors = JewelTheme.globalColors

    // Calculate totals for current period
    val totalCrashes = data.dataPoints.sumOf { it.crashes }
    val totalAnrs = data.dataPoints.sumOf { it.anrs }
    val totalToolFailures = data.dataPoints.sumOf { it.toolFailures }

    // Use previous period totals from data source
    val previousPeriodTotals = data.previousPeriodTotals
    val crashDelta = if (previousPeriodTotals.crashes > 0) {
        ((totalCrashes - previousPeriodTotals.crashes) * 100 / previousPeriodTotals.crashes)
    } else 0

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(8.dp))
            .padding(12.dp),
    ) {
        // Stats row
        Row(
            horizontalArrangement = Arrangement.SpaceEvenly,
            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
        ) {
            StatBox(
                label = "Crashes",
                value = formatNumber(totalCrashes),
                color = FailureType.Crash.color,
                delta = if (crashDelta != 0) "${if (crashDelta > 0) "+" else ""}$crashDelta%" else null,
                deltaPositive = crashDelta < 0,
            )
            StatBox(
                label = "ANRs",
                value = formatNumber(totalAnrs),
                color = FailureType.ANR.color,
            )
            StatBox(
                label = "Tool Errors",
                value = formatNumber(totalToolFailures),
                color = FailureType.ToolCallFailure.color,
            )
            StatBox(
                label = "Total",
                value = formatNumber(totalCrashes + totalAnrs + totalToolFailures),
                color = colors.text.normal,
            )
        }

        // Bar chart
        FailureBarChart(data = data.dataPoints, aggregation = aggregation, onBarClick = onBarClick)
    }
}

@Composable
private fun FailureBarChart(
    data: List<TimelineDataPoint>,
    aggregation: TimeAggregation,
    onBarClick: (() -> Unit)?,
) {
    val colors = JewelTheme.globalColors
    val maxValue = data.maxOfOrNull { it.total } ?: 1
    val chartHeight = 80.dp

    Column {
        // Bars
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(chartHeight),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            data.forEach { point ->
                val barHeight = if (maxValue > 0) (point.total.toFloat() / maxValue) else 0f

                Column(
                    modifier = Modifier
                        .weight(1f)
                        .height(chartHeight)
                        .then(
                            if (onBarClick != null) {
                                Modifier
                                    .clickable(onClick = onBarClick)
                                    .pointerHoverIcon(PointerIcon.Hand)
                            } else Modifier
                        ),
                    verticalArrangement = Arrangement.Bottom,
                ) {
                    // Stacked bar: crashes (red) + ANRs (orange) + tool failures (purple)
                    if (point.total > 0) {
                        val crashHeight = point.crashes.toFloat() / point.total * barHeight
                        val anrHeight = point.anrs.toFloat() / point.total * barHeight
                        val toolHeight = point.toolFailures.toFloat() / point.total * barHeight

                        if (point.toolFailures > 0) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height((chartHeight.value * toolHeight).dp)
                                    .background(
                                        FailureType.ToolCallFailure.color.copy(alpha = 0.8f),
                                        RoundedCornerShape(topStart = 2.dp, topEnd = 2.dp),
                                    ),
                            )
                        }
                        if (point.anrs > 0) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height((chartHeight.value * anrHeight).dp)
                                    .background(FailureType.ANR.color.copy(alpha = 0.8f)),
                            )
                        }
                        if (point.crashes > 0) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height((chartHeight.value * crashHeight).dp)
                                    .background(
                                        FailureType.Crash.color.copy(alpha = 0.8f),
                                        RoundedCornerShape(bottomStart = 2.dp, bottomEnd = 2.dp),
                                    ),
                            )
                        }
                    }
                }
            }
        }

        // X-axis labels (show every few labels to avoid crowding)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            val labelStep = when {
                data.size <= 7 -> 1
                data.size <= 14 -> 2
                data.size <= 24 -> 4
                else -> 10
            }
            data.filterIndexed { index, _ -> index % labelStep == 0 || index == data.lastIndex }
                .forEach { point ->
                    Text(
                        point.label,
                        fontSize = 8.sp,
                        color = colors.text.normal.copy(alpha = 0.4f),
                    )
                }
        }
    }
}

@Composable
private fun FailureListItem(
    failure: FailureGroup,
    onClick: () -> Unit,
) {
    val colors = JewelTheme.globalColors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(6.dp))
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Type icon and severity indicator
        Box(
            modifier = Modifier
                .size(36.dp)
                .background(failure.type.color.copy(alpha = 0.15f), RoundedCornerShape(6.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text(failure.type.icon, fontSize = 16.sp)
        }

        Spacer(Modifier.width(12.dp))

        // Failure info
        Column(modifier = Modifier.weight(1f)) {
            Text(
                failure.title,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                failure.signature,
                fontSize = 11.sp,
                color = colors.text.normal.copy(alpha = 0.5f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        Spacer(Modifier.width(12.dp))

        // Count and severity
        Column(horizontalAlignment = Alignment.End) {
            Text(
                "${failure.totalCount}x",
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = failure.severity.color,
            )
            Text(
                failure.severity.label,
                fontSize = 10.sp,
                color = failure.severity.color.copy(alpha = 0.7f),
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FailureDetailView(
    failure: FailureGroup,
    onBack: () -> Unit,
    onNavigateToScreen: (String) -> Unit,
    onNavigateToTest: (String) -> Unit,
    onNavigateToSource: (fileName: String, lineNumber: Int) -> Unit,
) {
    val colors = JewelTheme.globalColors

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
    ) {
        // Back button
        Text(
            "← Back",
            fontSize = 12.sp,
            color = Color(0xFF2196F3),
            modifier = Modifier
                .clickable(onClick = onBack)
                .pointerHoverIcon(PointerIcon.Hand)
                .padding(bottom = 12.dp),
        )

        // Header with badges
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Badge(failure.type.icon + " " + failure.type.label, failure.type.color)
            Badge(failure.severity.label, failure.severity.color)
        }

        Text(
            failure.title,
            fontSize = 16.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(top = 8.dp),
        )

        // Summary stats row
        Row(
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.padding(top = 8.dp, bottom = 16.dp),
        ) {
            Text(
                "${failure.totalCount} occurrences",
                fontSize = 12.sp,
                color = colors.text.normal.copy(alpha = 0.6f),
            )
            Text(
                "${failure.uniqueSessions} sessions",
                fontSize = 12.sp,
                color = colors.text.normal.copy(alpha = 0.6f),
            )
        }

        // Captures gallery (if available)
        if (failure.recentCaptures.isNotEmpty()) {
            SectionHeader("Captures (${failure.recentCaptures.size})")
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.horizontalScroll(rememberScrollState()),
            ) {
                failure.recentCaptures.take(5).forEach { capture ->
                    CaptureCard(capture = capture)
                }
            }
            if (failure.recentCaptures.size > 5) {
                ViewAllLink("View all ${failure.recentCaptures.size} captures") { /* TODO: Show all captures */ }
            }
            Spacer(Modifier.height(16.dp))
        }

        // Error message
        SectionHeader("Error Message")
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(6.dp))
                .padding(12.dp),
        ) {
            Text(
                failure.message,
                fontSize = 12.sp,
                fontFamily = FontFamily.Monospace,
                color = Color(0xFFE53935),
            )
        }

        // Stack trace with clickable lines
        if (failure.stackTraceElements.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            SectionHeader("Stack Trace")
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(6.dp))
                    .padding(8.dp),
            ) {
                failure.stackTraceElements.forEach { element ->
                    StackTraceLine(element = element, onNavigateToSource = onNavigateToSource)
                }
            }
        }

        // Tool call info (for tool failures)
        if (failure.toolCallInfo != null) {
            Spacer(Modifier.height(16.dp))
            SectionHeader("Tool Call Details")
            ToolCallDetailsSection(toolCallInfo = failure.toolCallInfo)
        }

        // Screen breakdown histogram
        if (failure.screenBreakdown.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            SectionHeader("Screens Visited (across ${failure.totalCount} occurrences)")
            ScreenBreakdownSection(
                breakdown = failure.screenBreakdown.take(5),
                failureScreens = failure.failureScreens,
                onNavigateToScreen = onNavigateToScreen,
            )
            if (failure.screenBreakdown.size > 5) {
                ViewAllLink("View all ${failure.screenBreakdown.size} screens") { /* TODO: Show all screens */ }
            }
        }

        // Device breakdown
        if (failure.deviceBreakdown.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            SectionHeader("Devices (${failure.deviceBreakdown.size} models)")
            BreakdownList(
                items = failure.deviceBreakdown.take(5).map { device ->
                    BreakdownItem(
                        label = device.deviceModel,
                        sublabel = device.os,
                        count = device.count,
                        percentage = device.percentage,
                    )
                },
            )
            if (failure.deviceBreakdown.size > 5) {
                ViewAllLink("View all ${failure.deviceBreakdown.size} devices") { /* TODO: Show all devices */ }
            }
        }

        // Version breakdown
        if (failure.versionBreakdown.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            SectionHeader("App Versions (${failure.versionBreakdown.size})")
            BreakdownList(
                items = failure.versionBreakdown.take(5).map { version ->
                    BreakdownItem(
                        label = version.version,
                        sublabel = null,
                        count = version.count,
                        percentage = version.percentage,
                    )
                },
            )
            if (failure.versionBreakdown.size > 5) {
                ViewAllLink("View all ${failure.versionBreakdown.size} versions") { /* TODO: Show all versions */ }
            }
        }

        // Affected tests
        if (failure.affectedTests.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            SectionHeader("Affected Tests (${failure.affectedTests.size})")
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                failure.affectedTests.entries.sortedByDescending { it.value }.take(5).forEach { (testName, count) ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(6.dp))
                            .clickable { onNavigateToTest(testName) }
                            .pointerHoverIcon(PointerIcon.Hand)
                            .padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(testName, fontSize = 12.sp, modifier = Modifier.weight(1f))
                        Text(
                            "${count}x",
                            fontSize = 11.sp,
                            color = colors.text.normal.copy(alpha = 0.5f),
                            modifier = Modifier.padding(end = 8.dp),
                        )
                        Text("View →", fontSize = 11.sp, color = Color(0xFF2196F3))
                    }
                }
                if (failure.affectedTests.size > 5) {
                    ViewAllLink("View all ${failure.affectedTests.size} tests") { /* TODO: Show all tests */ }
                }
            }
        }

        // Recent occurrences for drill-down
        if (failure.sampleOccurrences.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            SectionHeader("Recent Occurrences")
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                failure.sampleOccurrences.take(5).forEach { occurrence ->
                    OccurrenceRow(occurrence = occurrence)
                }
                if (failure.sampleOccurrences.size > 5) {
                    ViewAllLink("View all ${failure.totalCount} occurrences") { /* TODO: Show all */ }
                }
            }
        }

        // Actions
        Spacer(Modifier.height(24.dp))
        SectionHeader("Actions")
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                ActionCard("📋", "Copy Logs", "All ${failure.totalCount} occurrences", Modifier.weight(1f)) {}
                ActionCard("📦", "Export Bundle", "Debug data package", Modifier.weight(1f)) {}
            }
            ActionCard("🔄", "Reproduce", "Replay test to failure point", Modifier.fillMaxWidth()) {}
        }

        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun Badge(text: String, color: Color) {
    Box(
        modifier = Modifier
            .background(color.copy(alpha = 0.15f), RoundedCornerShape(4.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp),
    ) {
        Text(text, fontSize = 11.sp, color = color)
    }
}

@Composable
private fun CaptureCard(capture: FailureCapture) {
    val colors = JewelTheme.globalColors
    val icon = if (capture.type == CaptureType.Video) "🎬" else "📸"

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .width(100.dp)
            .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(6.dp))
            .clickable { /* TODO: Open capture */ }
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(8.dp),
    ) {
        Text(icon, fontSize = 24.sp)
        Text(
            capture.deviceModel,
            fontSize = 9.sp,
            color = colors.text.normal.copy(alpha = 0.6f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

@Composable
private fun StackTraceLine(
    element: StackTraceElement,
    onNavigateToSource: (String, Int) -> Unit,
) {
    val colors = JewelTheme.globalColors
    val lineText = buildString {
        append("at ${element.className}.${element.methodName}")
        if (element.fileName != null && element.lineNumber != null) {
            append("(${element.fileName}:${element.lineNumber})")
        }
    }
    val isClickable = element.isAppCode && element.fileName != null && element.lineNumber != null

    Text(
        lineText,
        fontSize = 11.sp,
        fontFamily = FontFamily.Monospace,
        color = if (element.isAppCode) Color(0xFF2196F3) else colors.text.normal.copy(alpha = 0.6f),
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (isClickable) Modifier
                    .clickable { onNavigateToSource(element.fileName!!, element.lineNumber!!) }
                    .pointerHoverIcon(PointerIcon.Hand)
                else Modifier
            )
            .padding(vertical = 2.dp, horizontal = 4.dp),
    )
}

@Composable
private fun ToolCallDetailsSection(toolCallInfo: AggregatedToolCallInfo) {
    val colors = JewelTheme.globalColors

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(6.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        DetailRow("Tool", toolCallInfo.toolName)

        // Error codes breakdown
        if (toolCallInfo.errorCodes.isNotEmpty()) {
            Text("Error Codes:", fontSize = 11.sp, color = colors.text.normal.copy(alpha = 0.6f))
            val sortedCodes = toolCallInfo.errorCodes.entries.sortedByDescending { it.value }
            sortedCodes.take(5).forEach { (code, count) ->
                Row(modifier = Modifier.padding(start = 8.dp)) {
                    Text(code, fontSize = 11.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(1f))
                    Text("${count}x", fontSize = 10.sp, color = colors.text.normal.copy(alpha = 0.5f))
                }
            }
            if (sortedCodes.size > 5) {
                ViewAllLink("View all ${sortedCodes.size} error codes") { /* TODO: Show all error codes */ }
            }
        }

        // Duration stats
        if (toolCallInfo.durationStats != null) {
            Text("Duration:", fontSize = 11.sp, color = colors.text.normal.copy(alpha = 0.6f))
            Row(
                horizontalArrangement = Arrangement.SpaceEvenly,
                modifier = Modifier.fillMaxWidth(),
            ) {
                DurationStat("Min", toolCallInfo.durationStats.minMs)
                DurationStat("Avg", toolCallInfo.durationStats.avgMs)
                DurationStat("P95", toolCallInfo.durationStats.p95Ms)
                DurationStat("Max", toolCallInfo.durationStats.maxMs)
            }
        }

        // Parameter variants
        if (toolCallInfo.parameterVariants.isNotEmpty()) {
            Text("Parameters:", fontSize = 11.sp, color = colors.text.normal.copy(alpha = 0.6f))
            val params = toolCallInfo.parameterVariants.entries.toList()
            params.take(5).forEach { (param, values) ->
                Row(modifier = Modifier.padding(start = 8.dp)) {
                    Text("$param: ", fontSize = 11.sp, color = colors.text.normal.copy(alpha = 0.5f))
                    Text(
                        if (values.size == 1) values.first() else "${values.size} variants",
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                    )
                }
            }
            if (params.size > 5) {
                ViewAllLink("View all ${params.size} parameters") { /* TODO: Show all parameters */ }
            }
        }
    }
}

@Composable
private fun DurationStat(label: String, ms: Long) {
    val colors = JewelTheme.globalColors
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text("${ms}ms", fontSize = 12.sp, fontWeight = FontWeight.Medium)
        Text(label, fontSize = 9.sp, color = colors.text.normal.copy(alpha = 0.5f))
    }
}

@Composable
private fun ScreenBreakdownSection(
    breakdown: List<ScreenBreakdown>,
    failureScreens: Map<String, Int>,
    onNavigateToScreen: (String) -> Unit,
) {
    val colors = JewelTheme.globalColors
    val maxVisits = breakdown.maxOfOrNull { it.visitCount } ?: 1

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(6.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        breakdown.sortedByDescending { it.visitCount }.forEach { screen ->
            val failureCount = failureScreens[screen.screenName] ?: 0
            val isFailureScreen = failureCount > 0

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onNavigateToScreen(screen.screenName) }
                    .pointerHoverIcon(PointerIcon.Hand),
            ) {
                // Screen name with failure indicator
                Row(modifier = Modifier.width(100.dp)) {
                    if (isFailureScreen) {
                        Text("💥 ", fontSize = 10.sp)
                    }
                    Text(
                        screen.screenName,
                        fontSize = 11.sp,
                        color = if (isFailureScreen) Color(0xFFE53935) else colors.text.normal,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                // Bar
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(16.dp)
                        .padding(horizontal = 8.dp),
                ) {
                    // Visit bar
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(screen.visitCount.toFloat() / maxVisits)
                            .height(16.dp)
                            .background(
                                if (isFailureScreen) Color(0xFFE53935).copy(alpha = 0.3f)
                                else colors.text.normal.copy(alpha = 0.15f),
                                RoundedCornerShape(2.dp),
                            ),
                    )
                }

                // Count
                Text(
                    "${screen.visitCount}",
                    fontSize = 10.sp,
                    color = colors.text.normal.copy(alpha = 0.6f),
                    modifier = Modifier.width(40.dp),
                )
            }
        }
    }
}

private data class BreakdownItem(
    val label: String,
    val sublabel: String?,
    val count: Int,
    val percentage: Float,
)

@Composable
private fun BreakdownList(items: List<BreakdownItem>) {
    val colors = JewelTheme.globalColors

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(6.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items.sortedByDescending { it.count }.forEach { item ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.width(120.dp)) {
                    Text(item.label, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (item.sublabel != null) {
                        Text(
                            item.sublabel,
                            fontSize = 9.sp,
                            color = colors.text.normal.copy(alpha = 0.5f),
                        )
                    }
                }

                // Bar
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(12.dp)
                        .padding(horizontal = 8.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(item.percentage / 100f)
                            .height(12.dp)
                            .background(Color(0xFF2196F3).copy(alpha = 0.4f), RoundedCornerShape(2.dp)),
                    )
                }

                Text(
                    "${item.count} (${item.percentage.toInt()}%)",
                    fontSize = 10.sp,
                    color = colors.text.normal.copy(alpha = 0.6f),
                )
            }
        }
    }
}

@Composable
private fun OccurrenceRow(occurrence: FailureOccurrence) {
    val colors = JewelTheme.globalColors
    val timeAgo = formatTimeAgo(occurrence.timestamp)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.03f), RoundedCornerShape(6.dp))
            .clickable { /* TODO: Show occurrence detail */ }
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(occurrence.deviceModel, fontSize = 11.sp)
            Text(
                "${occurrence.appVersion} • ${occurrence.screenAtFailure ?: "Unknown screen"}",
                fontSize = 10.sp,
                color = colors.text.normal.copy(alpha = 0.5f),
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(timeAgo, fontSize = 10.sp, color = colors.text.normal.copy(alpha = 0.5f))
            if (occurrence.capturePath != null) {
                Text(
                    if (occurrence.captureType == CaptureType.Video) "🎬" else "📸",
                    fontSize = 12.sp,
                )
            }
        }
    }
}

private val numberFormat = java.text.NumberFormat.getNumberInstance()

private fun formatNumber(value: Int): String = numberFormat.format(value)

internal fun formatTimeAgo(timestamp: Long, clock: Clock = SystemClock): String {
    val diff = clock.nowMs() - timestamp
    return when {
        diff < 60_000 -> "Just now"
        diff < 3600_000 -> "${diff / 60_000}m ago"
        diff < 86400_000 -> "${diff / 3600_000}h ago"
        else -> "${diff / 86400_000}d ago"
    }
}

@Composable
private fun SectionHeader(title: String) {
    val colors = JewelTheme.globalColors
    Text(
        title,
        fontSize = 13.sp,
        fontWeight = FontWeight.Medium,
        color = colors.text.normal.copy(alpha = 0.7f),
        modifier = Modifier.padding(bottom = 8.dp),
    )
}

@Composable
private fun ViewAllLink(
    text: String,
    onClick: () -> Unit,
) {
    Text(
        "$text →",
        fontSize = 11.sp,
        color = Color(0xFF2196F3),
        modifier = Modifier
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(top = 8.dp, bottom = 4.dp),
    )
}

@Composable
private fun DetailRow(label: String, value: String) {
    val colors = JewelTheme.globalColors
    Row {
        Text(
            "$label: ",
            fontSize = 11.sp,
            color = colors.text.normal.copy(alpha = 0.5f),
        )
        Text(
            value,
            fontSize = 11.sp,
            color = colors.text.normal.copy(alpha = 0.9f),
        )
    }
}

@Composable
private fun ScreenChip(
    name: String,
    isHighlighted: Boolean,
    onClick: () -> Unit,
) {
    val colors = JewelTheme.globalColors
    val bgColor = if (isHighlighted) Color(0xFFE53935).copy(alpha = 0.15f) else colors.text.normal.copy(alpha = 0.08f)
    val borderColor = if (isHighlighted) Color(0xFFE53935).copy(alpha = 0.5f) else colors.text.normal.copy(alpha = 0.2f)
    val textColor = if (isHighlighted) Color(0xFFE53935) else colors.text.normal

    Box(
        modifier = Modifier
            .background(bgColor, RoundedCornerShape(4.dp))
            .border(1.dp, borderColor, RoundedCornerShape(4.dp))
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
        Text(name, fontSize = 12.sp, color = textColor)
    }
}

@Composable
private fun ActionCard(
    icon: String,
    title: String,
    description: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val colors = JewelTheme.globalColors

    Row(
        modifier = modifier
            .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(icon, fontSize = 24.sp)
        Spacer(Modifier.width(12.dp))
        Column {
            Text(
                title,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                description,
                fontSize = 10.sp,
                color = colors.text.normal.copy(alpha = 0.5f),
            )
        }
    }
}
