package dev.jasonpearson.automobile.ide.telemetry

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.intellij.ide.util.PropertiesComponent
import dev.jasonpearson.automobile.ide.components.SearchBar
import kotlinx.coroutines.delay
import dev.jasonpearson.automobile.ide.daemon.TelemetryConnectionState
import dev.jasonpearson.automobile.ide.daemon.TelemetryPushClient
import dev.jasonpearson.automobile.ide.datasource.DataSourceMode
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.Text
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val DETAIL_PANEL_WIDTH_KEY = "automobile.telemetry.detailPanelWidth"
private const val DETAIL_PANEL_WIDTH_DEFAULT = 320
private const val DETAIL_PANEL_WIDTH_MIN = 200
private const val DETAIL_PANEL_WIDTH_MAX = 600

private const val MAX_EVENTS = 1000

private enum class CategoryFilter(val label: String, val icon: String) {
    All("All", "\uD83D\uDCE1"),       // 📡
    Network("Network", "\uD83C\uDF10"), // 🌐
    Navigation("Nav", "\uD83E\uDDED"),  // 🧭
    Logs("Logs", "\uD83D\uDCDD"),      // 📝
    Os("OS", "\u2699\uFE0F"),           // ⚙️
    Custom("Custom", "\uD83C\uDFF7\uFE0F"), // 🏷️
    Failures("Failures", "\uD83D\uDCA5"), // 💥 (crashes + ANRs + non-fatals)
    Storage("Storage", "\uD83D\uDDC4\uFE0F"), // 🗄️
    Layout("Layout", "\uD83C\uDFD7\uFE0F"), // 🏗️
    Performance("Perf", "\uD83D\uDCCA"),     // 📊
    ToolCalls("Tools", "\uD83D\uDD27"),   // 🔧
}

/**
 * Telemetry dashboard showing a real-time scrollable event list
 * with category filtering (Network, Logs, OS, Custom).
 */
@Composable
fun TelemetryDashboard(
    telemetryPushClient: TelemetryPushClient?,
    dataSourceMode: DataSourceMode,
    project: com.intellij.openapi.project.Project? = null,
    screenshotLoader: dev.jasonpearson.automobile.ide.navigation.ScreenshotLoader? = null,
    modifier: Modifier = Modifier,
) {
    val colors = JewelTheme.globalColors
    val events = remember { mutableStateListOf<TelemetryDisplayEvent>() }
    var selectedFilter by remember { mutableStateOf(CategoryFilter.All) }
    var connectionState by remember { mutableStateOf<TelemetryConnectionState?>(null) }
    var selectedEvent by remember { mutableStateOf<TelemetryDisplayEvent?>(null) }
    val listState = rememberLazyListState()
    val timeFormat = remember { SimpleDateFormat("HH:mm:ss.SSS", Locale.US) }

    // Search and severity filter state
    var searchQuery by remember { mutableStateOf("") }
    var debouncedQuery by remember { mutableStateOf("") }
    var enabledSeverities by remember { mutableStateOf(EventSeverity.entries.toSet()) }

    LaunchedEffect(searchQuery) {
        delay(150)
        debouncedQuery = searchQuery
    }

    // Collect telemetry events from the push client
    LaunchedEffect(telemetryPushClient) {
        val client = telemetryPushClient ?: return@LaunchedEffect
        client.telemetryEvents.collect { event ->
            events.add(0, event)
            // Cap at MAX_EVENTS
            while (events.size > MAX_EVENTS) {
                events.removeAt(events.size - 1)
            }
        }
    }

    // Collect connection state
    LaunchedEffect(telemetryPushClient) {
        val client = telemetryPushClient ?: return@LaunchedEffect
        client.connectionState.collect { state ->
            connectionState = state
        }
    }

    // Generate fake events in Fake mode
    LaunchedEffect(dataSourceMode) {
        if (dataSourceMode != DataSourceMode.Fake) return@LaunchedEffect
        val fakeEvents = generateFakeEvents()
        events.addAll(0, fakeEvents)
    }

    // Filtered events — chains category, severity, and text search filters.
    // derivedStateOf tracks SnapshotStateList mutations correctly.
    val filteredEvents by remember(selectedFilter, debouncedQuery, enabledSeverities) {
        derivedStateOf {
            var result: List<TelemetryDisplayEvent> = events.toList()

            // Category filter
            if (selectedFilter != CategoryFilter.All) {
                result = result.filter { event ->
                    when (selectedFilter) {
                        CategoryFilter.All -> true
                        CategoryFilter.Network -> event is TelemetryDisplayEvent.Network
                        CategoryFilter.Navigation -> event is TelemetryDisplayEvent.Navigation
                        CategoryFilter.Logs -> event is TelemetryDisplayEvent.Log
                        CategoryFilter.Os -> event is TelemetryDisplayEvent.Os
                        CategoryFilter.Custom -> event is TelemetryDisplayEvent.Custom
                        CategoryFilter.Failures -> event is TelemetryDisplayEvent.Failure
                        CategoryFilter.Storage -> event is TelemetryDisplayEvent.Storage
                        CategoryFilter.Layout -> event is TelemetryDisplayEvent.Layout
                        CategoryFilter.Performance -> event is TelemetryDisplayEvent.Performance
                        // Touch, Gesture, Input, Memory events appear in All but have no dedicated tab
                        CategoryFilter.ToolCalls -> event is TelemetryDisplayEvent.ToolCall
                    }
                }
            }

            // Severity filter
            if (enabledSeverities.size < EventSeverity.entries.size) {
                result = result.filter { it.eventSeverity in enabledSeverities }
            }

            // Text search filter
            if (debouncedQuery.isNotEmpty()) {
                result = result.filter { it.matchesSearch(debouncedQuery) }
            }

            result
        }
    }

    // Category counts
    val counts by remember {
        derivedStateOf {
            mapOf(
                CategoryFilter.All to events.size,
                CategoryFilter.Network to events.count { it is TelemetryDisplayEvent.Network },
                CategoryFilter.Navigation to events.count { it is TelemetryDisplayEvent.Navigation },
                CategoryFilter.Logs to events.count { it is TelemetryDisplayEvent.Log },
                CategoryFilter.Os to events.count { it is TelemetryDisplayEvent.Os },
                CategoryFilter.Custom to events.count { it is TelemetryDisplayEvent.Custom },
                CategoryFilter.Failures to events.count { it is TelemetryDisplayEvent.Failure },
                CategoryFilter.Storage to events.count { it is TelemetryDisplayEvent.Storage },
                CategoryFilter.Layout to events.count { it is TelemetryDisplayEvent.Layout },
                CategoryFilter.Performance to events.count { it is TelemetryDisplayEvent.Performance },
                CategoryFilter.ToolCalls to events.count { it is TelemetryDisplayEvent.ToolCall },
            )
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        // Search bar + severity toggle row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            SearchBar(
                query = searchQuery,
                onQueryChange = { searchQuery = it },
                placeholder = "Filter events...",
                modifier = Modifier.weight(1f),
            )
            // Severity toggle chips
            EventSeverity.entries.forEach { sev ->
                val isEnabled = sev in enabledSeverities
                Box(
                    modifier = Modifier
                        .background(
                            if (isEnabled) Color(sev.color).copy(alpha = 0.15f) else Color.Transparent,
                            RoundedCornerShape(4.dp),
                        )
                        .clickable {
                            enabledSeverities = if (isEnabled) enabledSeverities - sev else enabledSeverities + sev
                        }
                        .pointerHoverIcon(PointerIcon.Hand)
                        .padding(horizontal = 6.dp, vertical = 4.dp),
                ) {
                    Text(sev.icon, fontSize = 11.sp)
                }
            }
        }

        // Responsive category filter tabs
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 2.dp),
        ) {
            val tabCount = CategoryFilter.entries.size
            val tabsWithText = when {
                maxWidth >= 750.dp -> tabCount
                maxWidth >= 600.dp -> tabCount - 3
                maxWidth >= 450.dp -> tabCount - 6
                maxWidth >= 350.dp -> 3
                else -> 0
            }

            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CategoryFilter.entries.forEachIndexed { index, filter ->
                    val isSelected = filter == selectedFilter
                    val count = counts[filter] ?: 0
                    val showText = index < tabsWithText
                    Box(
                        modifier = Modifier
                            .background(
                                if (isSelected) colors.text.normal.copy(alpha = 0.12f) else Color.Transparent,
                                RoundedCornerShape(6.dp),
                            )
                            .clickable { selectedFilter = filter }
                            .pointerHoverIcon(PointerIcon.Hand)
                            .padding(horizontal = if (showText) 8.dp else 6.dp, vertical = 4.dp),
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(filter.icon, fontSize = 11.sp)
                            if (showText) {
                                Text(
                                    filter.label,
                                    fontSize = 11.sp,
                                    color = if (isSelected) colors.text.normal else colors.text.normal.copy(alpha = 0.6f),
                                )
                                if (count > 0) {
                                    Text(
                                        "$count",
                                        fontSize = 9.sp,
                                        color = colors.text.normal.copy(alpha = 0.4f),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Connection status bar (when disconnected)
        val state = connectionState
        if (state != null && state !is TelemetryConnectionState.Connected) {
            val statusText = when (state) {
                is TelemetryConnectionState.Connecting -> "Connecting..."
                is TelemetryConnectionState.Reconnecting -> "Reconnecting (attempt ${state.attempt})..."
                is TelemetryConnectionState.Disconnected -> "Disconnected${state.reason?.let { ": $it" } ?: ""}"
                is TelemetryConnectionState.Connected -> ""
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF5C4033).copy(alpha = 0.3f))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            ) {
                Text(
                    statusText,
                    fontSize = 10.sp,
                    color = Color(0xFFE0A040),
                )
            }
        }

        // Event list + detail panel
        Row(modifier = Modifier.fillMaxSize()) {
            // Event list (takes remaining space)
            Box(modifier = Modifier.weight(1f)) {
                if (filteredEvents.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            if (dataSourceMode == DataSourceMode.Real) "No telemetry events yet" else "No events",
                            fontSize = 12.sp,
                            color = colors.text.normal.copy(alpha = 0.4f),
                        )
                    }
                } else if (selectedFilter == CategoryFilter.Network) {
                    NetworkTable(
                        filteredEvents.filterIsInstance<TelemetryDisplayEvent.Network>(),
                        listState,
                        timeFormat,
                        colors.text.normal,
                        selectedEvent = selectedEvent,
                        onEventSelected = { selectedEvent = if (selectedEvent == it) null else it },
                    )
                } else {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        items(filteredEvents, key = { "${it.timestamp}_${System.identityHashCode(it)}" }) { event ->
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .then(
                                        if (event == selectedEvent) {
                                            Modifier.background(colors.text.normal.copy(alpha = 0.08f))
                                        } else {
                                            Modifier
                                        }
                                    )
                                    .clickable { selectedEvent = if (selectedEvent == event) null else event }
                                    .pointerHoverIcon(PointerIcon.Hand)
                            ) {
                                TelemetryEventRow(event, timeFormat, colors.text.normal)
                            }
                        }
                    }
                }
            }

            // Detail panel with draggable divider (shown when an event is selected)
            val selected = selectedEvent
            if (selected != null) {
                val density = LocalDensity.current
                var detailWidthDp by remember {
                    mutableStateOf(
                        PropertiesComponent.getInstance()
                            .getInt(DETAIL_PANEL_WIDTH_KEY, DETAIL_PANEL_WIDTH_DEFAULT)
                            .coerceIn(DETAIL_PANEL_WIDTH_MIN, DETAIL_PANEL_WIDTH_MAX)
                            .dp
                    )
                }

                // Draggable divider — 6dp hit target, 1px visual line
                Box(
                    modifier = Modifier
                        .width(6.dp)
                        .fillMaxHeight()
                        .pointerHoverIcon(PointerIcon(java.awt.Cursor(java.awt.Cursor.W_RESIZE_CURSOR)))
                        .pointerInput(Unit) {
                            detectDragGestures(
                                onDrag = { change, dragAmount ->
                                    change.consume()
                                    val deltaDp = with(density) { (-dragAmount.x).toDp() }
                                    detailWidthDp = (detailWidthDp + deltaDp)
                                        .coerceIn(DETAIL_PANEL_WIDTH_MIN.dp, DETAIL_PANEL_WIDTH_MAX.dp)
                                },
                                onDragEnd = {
                                    PropertiesComponent.getInstance()
                                        .setValue(DETAIL_PANEL_WIDTH_KEY, detailWidthDp.value.toInt(), DETAIL_PANEL_WIDTH_DEFAULT)
                                },
                            )
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        modifier = Modifier
                            .width(1.dp)
                            .fillMaxHeight()
                            .background(colors.text.normal.copy(alpha = 0.1f)),
                    )
                }

                TelemetryDetailPanel(
                    event = selected,
                    timeFormat = timeFormat,
                    textColor = colors.text.normal,
                    onClose = { selectedEvent = null },
                    project = project,
                    screenshotLoader = screenshotLoader,
                    modifier = Modifier.width(detailWidthDp),
                )
            }
        }
    }

    // Auto-scroll to top when new events arrive and user is near top
    LaunchedEffect(filteredEvents.size) {
        if (listState.firstVisibleItemIndex <= 2) {
            listState.animateScrollToItem(0)
        }
    }
}

@Composable
private fun TelemetryEventRow(
    event: TelemetryDisplayEvent,
    timeFormat: SimpleDateFormat,
    textColor: Color,
) {
    val formattedTime = remember(event.timestamp) {
        timeFormat.format(Date(event.timestamp))
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 2.dp),
        verticalAlignment = Alignment.Top,
    ) {
        // Timestamp
        Text(
            formattedTime,
            fontSize = 10.sp,
            fontFamily = FontFamily.Monospace,
            color = textColor.copy(alpha = 0.5f),
            maxLines = 1,
        )
        Spacer(Modifier.width(6.dp))

        // Category icon
        Text(
            when (event) {
                is TelemetryDisplayEvent.Network -> "\uD83C\uDF10"  // 🌐
                is TelemetryDisplayEvent.Navigation -> "\uD83E\uDDED" // 🧭
                is TelemetryDisplayEvent.Log -> "\uD83D\uDCDD"      // 📝
                is TelemetryDisplayEvent.Os -> "\u2699\uFE0F"       // ⚙️
                is TelemetryDisplayEvent.Custom -> "\uD83C\uDFF7\uFE0F" // 🏷️
                is TelemetryDisplayEvent.Failure -> when (event.type) {
                    "crash" -> "\uD83D\uDCA5"  // 💥
                    "anr" -> "\u231B"           // ⌛
                    else -> "\u26A0\uFE0F"     // ⚠️
                }
                is TelemetryDisplayEvent.Storage -> "\uD83D\uDDC4\uFE0F" // 🗄️
                is TelemetryDisplayEvent.Layout -> "\uD83C\uDFD7\uFE0F"  // 🏗️
                is TelemetryDisplayEvent.Performance -> "\uD83D\uDCCA" // 📊
                is TelemetryDisplayEvent.Interaction -> "\uD83D\uDC46" // 👆
                is TelemetryDisplayEvent.Gesture -> "\u270B" // ✋
                is TelemetryDisplayEvent.Input -> "\u2328\uFE0F" // ⌨️
                is TelemetryDisplayEvent.Memory -> "\uD83E\uDDE0" // 🧠
                is TelemetryDisplayEvent.ToolCall -> "\uD83D\uDD27" // 🔧
                is TelemetryDisplayEvent.Accessibility -> "\u267F" // ♿
            },
            fontSize = 10.sp,
        )
        Spacer(Modifier.width(4.dp))

        // Summary text
        when (event) {
            is TelemetryDisplayEvent.Network -> NetworkSummary(event, textColor)
            is TelemetryDisplayEvent.Navigation -> NavigationSummary(event, textColor)
            is TelemetryDisplayEvent.Log -> LogSummary(event, textColor)
            is TelemetryDisplayEvent.Custom -> CustomSummary(event, textColor)
            is TelemetryDisplayEvent.Os -> OsSummary(event, textColor)
            is TelemetryDisplayEvent.Failure -> FailureSummary(event, textColor)
            is TelemetryDisplayEvent.Storage -> StorageSummary(event, textColor)
            is TelemetryDisplayEvent.Layout -> LayoutSummary(event, textColor)
            is TelemetryDisplayEvent.Performance -> PerformanceSummary(event, textColor)
            is TelemetryDisplayEvent.Interaction -> InteractionSummary(event, textColor)
            is TelemetryDisplayEvent.Gesture -> GestureSummary(event, textColor)
            is TelemetryDisplayEvent.Input -> InputSummary(event, textColor)
            is TelemetryDisplayEvent.Memory -> MemorySummary(event, textColor)
            is TelemetryDisplayEvent.ToolCall -> ToolCallSummary(event, textColor)
            is TelemetryDisplayEvent.Accessibility -> A11ySummary(event, textColor)
        }
    }
}

private fun networkStatusColor(statusCode: Int, error: String?, textColor: Color): Color = when {
    error != null || statusCode == 0 -> Color(0xFFFF6B6B)      // Error / failed - bright red
    statusCode in 200..299 -> Color(0xFF51CF66)                 // 2xx success - bright green
    statusCode in 300..399 -> Color(0xFFFFD43B)                 // 3xx redirect - bright yellow
    statusCode >= 400 -> Color(0xFFFF6B6B)                      // 4xx/5xx - bright red
    else -> textColor.copy(alpha = 0.85f)
}

@Composable
private fun NetworkSummary(event: TelemetryDisplayEvent.Network, textColor: Color) {
    val color = networkStatusColor(event.statusCode, event.error, textColor)
    val displayPath = event.path ?: event.url

    Text(
        "${event.method} ${event.statusCode} $displayPath (${event.durationMs}ms)",
        fontSize = 11.sp,
        fontFamily = FontFamily.Monospace,
        color = color,
        maxLines = 1,
    )
}

private data class NetworkColumn(val label: String, val width: Int)

private val networkColumns = listOf(
    NetworkColumn("Time", 90),
    NetworkColumn("Method", 55),
    NetworkColumn("Status", 50),
    NetworkColumn("Host", 140),
    NetworkColumn("Path", 160),
    NetworkColumn("Duration", 70),
    NetworkColumn("Error", 180),
)

@Composable
private fun NetworkTable(
    events: List<TelemetryDisplayEvent.Network>,
    listState: androidx.compose.foundation.lazy.LazyListState,
    timeFormat: SimpleDateFormat,
    textColor: Color,
    selectedEvent: TelemetryDisplayEvent? = null,
    onEventSelected: (TelemetryDisplayEvent.Network) -> Unit = {},
) {
    val scrollState = rememberScrollState()

    Column(modifier = Modifier.fillMaxSize()) {
        // Header row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(textColor.copy(alpha = 0.05f))
                .horizontalScroll(scrollState)
                .padding(vertical = 6.dp),
        ) {
            networkColumns.forEach { col ->
                Box(modifier = Modifier.width(col.width.dp).padding(horizontal = 6.dp)) {
                    Text(
                        col.label,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold,
                        fontFamily = FontFamily.Monospace,
                        color = textColor,
                        maxLines = 1,
                    )
                }
            }
        }

        Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(textColor.copy(alpha = 0.1f)))

        // Data rows
        LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
            items(events, key = { "${it.timestamp}_${System.identityHashCode(it)}" }) { event ->
                val color = networkStatusColor(event.statusCode, event.error, textColor)
                val formattedTime = remember(event.timestamp) { timeFormat.format(Date(event.timestamp)) }
                val isSelected = event == selectedEvent

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .then(
                            if (isSelected) Modifier.background(textColor.copy(alpha = 0.08f))
                            else Modifier
                        )
                        .clickable { onEventSelected(event) }
                        .pointerHoverIcon(PointerIcon.Hand)
                        .horizontalScroll(scrollState)
                        .padding(vertical = 3.dp),
                ) {
                    // Time
                    Box(modifier = Modifier.width(networkColumns[0].width.dp).padding(horizontal = 6.dp)) {
                        Text(formattedTime, fontSize = 10.sp, fontFamily = FontFamily.Monospace, color = textColor.copy(alpha = 0.5f), maxLines = 1)
                    }
                    // Method
                    Box(modifier = Modifier.width(networkColumns[1].width.dp).padding(horizontal = 6.dp)) {
                        Text(event.method, fontSize = 10.sp, fontFamily = FontFamily.Monospace, color = color, maxLines = 1)
                    }
                    // Status
                    Box(modifier = Modifier.width(networkColumns[2].width.dp).padding(horizontal = 6.dp)) {
                        Text("${event.statusCode}", fontSize = 10.sp, fontFamily = FontFamily.Monospace, color = color, maxLines = 1)
                    }
                    // Host
                    Box(modifier = Modifier.width(networkColumns[3].width.dp).padding(horizontal = 6.dp)) {
                        Text(event.host ?: "", fontSize = 10.sp, fontFamily = FontFamily.Monospace, color = textColor.copy(alpha = 0.85f), maxLines = 1)
                    }
                    // Path
                    Box(modifier = Modifier.width(networkColumns[4].width.dp).padding(horizontal = 6.dp)) {
                        Text(event.path ?: event.url, fontSize = 10.sp, fontFamily = FontFamily.Monospace, color = textColor.copy(alpha = 0.85f), maxLines = 1)
                    }
                    // Duration
                    Box(modifier = Modifier.width(networkColumns[5].width.dp).padding(horizontal = 6.dp)) {
                        Text("${event.durationMs}ms", fontSize = 10.sp, fontFamily = FontFamily.Monospace, color = textColor.copy(alpha = 0.7f), maxLines = 1)
                    }
                    // Error
                    Box(modifier = Modifier.width(networkColumns[6].width.dp).padding(horizontal = 6.dp)) {
                        Text(event.error ?: "", fontSize = 10.sp, fontFamily = FontFamily.Monospace, color = Color(0xFFE06060), maxLines = 1)
                    }
                }
            }
        }
    }
}

@Composable
private fun LogSummary(event: TelemetryDisplayEvent.Log, textColor: Color) {
    val levelLetter = when (event.level) {
        2 -> "V"
        3 -> "D"
        4 -> "I"
        5 -> "W"
        6 -> "E"
        7 -> "A"
        else -> "?"
    }
    val color = when (event.level) {
        2 -> textColor.copy(alpha = 0.4f)    // Verbose
        3 -> textColor.copy(alpha = 0.6f)    // Debug
        4 -> textColor.copy(alpha = 0.85f)   // Info
        5 -> Color(0xFFE0C040)               // Warning - yellow
        6 -> Color(0xFFE06060)               // Error - red
        7 -> Color(0xFFFF4040)               // Assert - bright red
        else -> textColor.copy(alpha = 0.6f)
    }

    Text(
        "$levelLetter [${event.tag}] ${event.message}",
        fontSize = 11.sp,
        fontFamily = FontFamily.Monospace,
        color = color,
        maxLines = 1,
    )
}

@Composable
private fun CustomSummary(event: TelemetryDisplayEvent.Custom, textColor: Color) {
    val propsText = if (event.properties.isNotEmpty()) {
        " {${event.properties.entries.joinToString(", ") { "${it.key}:${it.value}" }}}"
    } else {
        ""
    }

    Text(
        "${event.name}$propsText",
        fontSize = 11.sp,
        fontFamily = FontFamily.Monospace,
        color = textColor.copy(alpha = 0.85f),
        maxLines = 1,
    )
}

@Composable
private fun NavigationSummary(event: TelemetryDisplayEvent.Navigation, textColor: Color) {
    val argsText = event.arguments?.entries?.joinToString(", ") { "${it.key}=${it.value}" }
    val suffix = if (argsText != null) " ($argsText)" else ""

    Text(
        "${event.destination}$suffix",
        fontSize = 11.sp,
        fontFamily = FontFamily.Monospace,
        color = Color(0xFF74C0FC),  // light blue
        maxLines = 1,
    )
}

@Composable
private fun OsSummary(event: TelemetryDisplayEvent.Os, textColor: Color) {
    val detailsText = if (event.details != null && event.details.isNotEmpty()) {
        " ${event.details.entries.joinToString(", ") { "${it.key}:${it.value}" }}"
    } else {
        ""
    }
    val color = when (event.kind) {
        "foreground" -> Color(0xFF51CF66)                   // green
        "background" -> Color(0xFFFFA94D)                   // orange
        "connectivity_change" -> {
            val connected = event.details?.get("connected")
            if (connected == "true") Color(0xFF51CF66) else Color(0xFFFF6B6B)
        }
        "screen_off" -> textColor.copy(alpha = 0.4f)
        else -> textColor.copy(alpha = 0.85f)
    }

    Text(
        "[${event.category}] ${event.kind}$detailsText",
        fontSize = 11.sp,
        fontFamily = FontFamily.Monospace,
        color = color,
        maxLines = 1,
    )
}

@Composable
private fun FailureSummary(event: TelemetryDisplayEvent.Failure, textColor: Color) {
    val color = when (event.severity) {
        "critical" -> Color(0xFFFF4040)  // bright red
        "high" -> Color(0xFFFF6B6B)      // red
        "medium" -> Color(0xFFE0C040)    // yellow
        "low" -> textColor.copy(alpha = 0.7f)
        else -> textColor.copy(alpha = 0.85f)
    }
    val typeLabel = when (event.type) {
        "crash" -> "CRASH"
        "anr" -> "ANR"
        "nonfatal" -> "NON-FATAL"
        else -> event.type.uppercase()
    }
    val screenSuffix = event.screen?.let { " @ $it" } ?: ""

    Text(
        "[$typeLabel] ${event.title}$screenSuffix",
        fontSize = 11.sp,
        fontFamily = FontFamily.Monospace,
        color = color,
        maxLines = 1,
    )
}

@Composable
private fun StorageSummary(event: TelemetryDisplayEvent.Storage, textColor: Color) {
    val changeLabel = event.changeType.uppercase()
    val keyPart = event.key?.let { ":$it" } ?: ""
    val valuePart = event.value?.let { " = $it" } ?: ""

    Text(
        "[$changeLabel] ${event.fileName}$keyPart$valuePart",
        fontSize = 11.sp,
        fontFamily = FontFamily.Monospace,
        color = textColor.copy(alpha = 0.85f),
        maxLines = 1,
    )
}

@Composable
private fun LayoutSummary(event: TelemetryDisplayEvent.Layout, textColor: Color) {
    val text = when (event.subType) {
        "excessive_recomposition" -> {
            val name = event.composableName ?: "unknown"
            val count = event.recompositionCount?.let { "${it}/s" } ?: ""
            val cause = event.likelyCause?.let { " ($it)" } ?: ""
            "RECOMP $name $count$cause"
        }
        "recomposition" -> {
            val name = event.composableName ?: "unknown"
            val count = event.recompositionCount?.let { "${it}/s" } ?: ""
            "recomp $name $count"
        }
        "hierarchy_change" -> "Hierarchy update"
        else -> event.subType
    }
    val color = when (event.subType) {
        "excessive_recomposition" -> Color(0xFFFFA94D) // orange
        "recomposition" -> Color(0xFF74C0FC) // light blue
        else -> textColor.copy(alpha = 0.7f)
    }

    Text(
        text,
        fontSize = 11.sp,
        fontFamily = FontFamily.Monospace,
        color = color,
        maxLines = 1,
    )
}

@Composable
private fun PerformanceSummary(event: TelemetryDisplayEvent.Performance, textColor: Color) {
    val changed = event.changedMetrics.joinToString(", ")
    val metrics = buildString {
        event.fps?.let { append("${it.toInt()}fps ") }
        event.frameTimeMs?.let { append("${it.toInt()}ms ") }
        event.jankFrames?.let { if (it > 0) append("${it}jank ") }
        event.memoryUsageMb?.let { append("${it.toInt()}MB ") }
    }.trim()
    val text = "[${event.health.uppercase()}] $metrics ($changed)"
    val color = when (event.health) {
        "critical" -> Color(0xFFFF4040)
        "warning" -> Color(0xFFFFA94D)
        else -> Color(0xFF51CF66)
    }

    Text(
        text,
        fontSize = 11.sp,
        fontFamily = FontFamily.Monospace,
        color = color,
        maxLines = 1,
    )
}

@Composable
private fun InteractionSummary(event: TelemetryDisplayEvent.Interaction, textColor: Color) {
    val target = event.elementText
        ?: event.elementResourceId?.substringAfterLast('/')
        ?: event.elementContentDesc
        ?: event.screenClassName?.substringAfterLast('.')
        ?: ""
    val text = "${event.interactionType}${if (target.isNotEmpty()) " '$target'" else ""}"
    Text(text, fontSize = 11.sp, fontFamily = FontFamily.Monospace, color = Color(0xFF74C0FC), maxLines = 1)
}

@Composable
private fun GestureSummary(event: TelemetryDisplayEvent.Gesture, textColor: Color) {
    val status = if (event.success) "${event.totalTimeMs}ms" else "FAILED"
    val text = "${event.gestureType} $status"
    val color = when {
        !event.success -> Color(0xFFFF6B6B)
        event.totalTimeMs > 1000 -> Color(0xFFFFA94D)
        else -> Color(0xFF51CF66)
    }
    Text(text, fontSize = 11.sp, fontFamily = FontFamily.Monospace, color = color, maxLines = 1)
}

@Composable
private fun InputSummary(event: TelemetryDisplayEvent.Input, textColor: Color) {
    val status = if (event.success) "${event.totalTimeMs}ms" else "FAILED"
    val actionSuffix = event.action?.let { " ($it)" } ?: ""
    val text = "${event.inputType}$actionSuffix $status"
    val color = if (event.success) textColor.copy(alpha = 0.85f) else Color(0xFFFF6B6B)
    Text(text, fontSize = 11.sp, fontFamily = FontFamily.Monospace, color = color, maxLines = 1)
}

@Composable
private fun MemorySummary(event: TelemetryDisplayEvent.Memory, textColor: Color) {
    val status = if (event.passed) "PASS" else "FAIL"
    val growth = event.javaHeapGrowthMb?.let { "+${"%.1f".format(it)}MB" } ?: ""
    val text = "[$status] ${event.packageName.substringAfterLast('.')} $growth"
    val color = if (event.passed) Color(0xFF51CF66) else Color(0xFFFF6B6B)
    Text(text, fontSize = 11.sp, fontFamily = FontFamily.Monospace, color = color, maxLines = 1)
}

@Composable
private fun ToolCallSummary(event: TelemetryDisplayEvent.ToolCall, textColor: Color) {
    val status = if (event.success) "${event.durationMs}ms" else "FAILED"
    val errorSuffix = if (!event.success && event.error != null) " (${event.error.take(30)})" else ""
    val color = when {
        !event.success -> Color(0xFFFF6B6B)
        event.durationMs > 5000 -> Color(0xFFFFA94D)
        else -> Color(0xFF51CF66)
    }
    Text(
        "${event.toolName} $status$errorSuffix",
        fontSize = 11.sp, fontFamily = FontFamily.Monospace, color = color, maxLines = 1,
    )
}

@Composable
private fun A11ySummary(event: TelemetryDisplayEvent.Accessibility, textColor: Color) {
    val color = if (event.newViolations > 0) Color(0xFFFFA94D) else Color(0xFF51CF66)
    val text = "${event.newViolations} violations (${event.packageName.substringAfterLast('.')})"
    Text(text, fontSize = 11.sp, fontFamily = FontFamily.Monospace, color = color, maxLines = 1)
}

/**
 * Generates sample telemetry events for Fake/development mode.
 */
private fun generateFakeEvents(): List<TelemetryDisplayEvent> {
    val now = System.currentTimeMillis()
    return listOf(
        TelemetryDisplayEvent.Network(
            timestamp = now - 500,
            method = "GET",
            statusCode = 200,
            url = "https://api.example.com/users",
            durationMs = 42,
            host = "api.example.com",
            path = "/users",
            error = null,
            requestHeaders = mapOf("Accept" to "application/json", "Authorization" to "Bearer tok_xxx"),
            responseHeaders = mapOf("Content-Type" to "application/json", "X-Request-Id" to "abc-123"),
            requestBody = null,
            responseBody = """[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]""",
            contentType = "application/json",
        ),
        TelemetryDisplayEvent.Network(
            timestamp = now - 1200,
            method = "POST",
            statusCode = 500,
            url = "https://api.example.com/upload",
            durationMs = 1530,
            host = "api.example.com",
            path = "/upload",
            error = "Internal Server Error",
            requestHeaders = mapOf("Content-Type" to "application/json"),
            responseHeaders = null,
            requestBody = """{"file":"data.csv","size":1024}""",
            responseBody = null,
            contentType = null,
        ),
        TelemetryDisplayEvent.Log(
            timestamp = now - 2000,
            level = 4,
            tag = "MainActivity",
            message = "Activity resumed",
        ),
        TelemetryDisplayEvent.Log(
            timestamp = now - 2500,
            level = 5,
            tag = "NetworkManager",
            message = "Slow response detected: 1530ms",
        ),
        TelemetryDisplayEvent.Log(
            timestamp = now - 3000,
            level = 6,
            tag = "CrashReporter",
            message = "Unhandled exception in coroutine",
        ),
        TelemetryDisplayEvent.Os(
            timestamp = now - 4000,
            category = "lifecycle",
            kind = "foreground",
            details = null,
        ),
        TelemetryDisplayEvent.Os(
            timestamp = now - 5500,
            category = "broadcast",
            kind = "LOCALE_CHANGED",
            details = mapOf("locale" to "en_US"),
        ),
        TelemetryDisplayEvent.Navigation(
            timestamp = now - 5800,
            destination = "HomeScreen",
            source = "sdk",
            arguments = mapOf("tab" to "discover"),
            metadata = null,
            triggeringInteraction = "tap on 'Home'",
            screenshotUri = null,
        ),
        TelemetryDisplayEvent.Custom(
            timestamp = now - 6000,
            name = "button_click",
            properties = mapOf("screen" to "home", "button" to "refresh"),
        ),
        TelemetryDisplayEvent.Custom(
            timestamp = now - 7000,
            name = "purchase_completed",
            properties = mapOf("item" to "premium", "price" to "9.99"),
        ),
        TelemetryDisplayEvent.Network(
            timestamp = now - 8000,
            method = "GET",
            statusCode = 404,
            url = "https://api.example.com/missing",
            durationMs = 15,
            host = "api.example.com",
            path = "/missing",
            error = null,
            requestHeaders = null,
            responseHeaders = null,
            requestBody = null,
            responseBody = null,
            contentType = null,
        ),
        TelemetryDisplayEvent.Failure(
            timestamp = now - 9000,
            type = "crash",
            occurrenceId = "occ-001",
            severity = "critical",
            title = "NullPointerException at UserRepository.kt:42",
            exceptionType = "java.lang.NullPointerException",
            screen = "ProfileScreen",
            stackTrace = listOf(
                StackTraceFrame("com.example.app.UserRepository", "getUser", "UserRepository.kt", 42, true),
                StackTraceFrame("com.example.app.ProfileViewModel", "loadProfile", "ProfileViewModel.kt", 28, true),
                StackTraceFrame("androidx.lifecycle.ViewModel", "init", null, null, false),
            ),
        ),
        TelemetryDisplayEvent.Failure(
            timestamp = now - 10000,
            type = "anr",
            occurrenceId = "occ-002",
            severity = "high",
            title = "Main thread blocked in NetworkManager.fetch",
            exceptionType = null,
            screen = "HomeScreen",
            stackTrace = null,
        ),
        TelemetryDisplayEvent.Failure(
            timestamp = now - 11000,
            type = "nonfatal",
            occurrenceId = "occ-003",
            severity = "medium",
            title = "IOException at CacheManager.kt:88",
            exceptionType = "java.io.IOException",
            screen = "SettingsScreen",
            stackTrace = listOf(
                StackTraceFrame("com.example.app.CacheManager", "writeCache", "CacheManager.kt", 88, true),
                StackTraceFrame("java.io.FileOutputStream", "write", null, null, false),
            ),
        ),
        TelemetryDisplayEvent.Storage(
            timestamp = now - 12000,
            fileName = "user_prefs.xml",
            key = "dark_mode",
            value = "true",
            valueType = "BOOLEAN",
            changeType = "modify",
            previousValue = "false",
        ),
        TelemetryDisplayEvent.Storage(
            timestamp = now - 13000,
            fileName = "session.xml",
            key = "auth_token",
            value = null,
            valueType = null,
            changeType = "remove",
            previousValue = "eyJhbGciOiJIUzI1NiJ9...",
        ),
        TelemetryDisplayEvent.Layout(
            timestamp = now - 14000,
            subType = "excessive_recomposition",
            composableName = "AnimatedCounter",
            recompositionCount = 15,
            durationMs = 8,
            likelyCause = "unstable_lambda",
            screenName = "HomeScreen",
            detailsJson = null,
        ),
        TelemetryDisplayEvent.Layout(
            timestamp = now - 15000,
            subType = "hierarchy_change",
            composableName = null,
            recompositionCount = null,
            durationMs = null,
            likelyCause = null,
            screenName = "SettingsScreen",
            detailsJson = """{"screenName":"SettingsScreen","windowCount":3,"foregroundActivity":"com.example.app.SettingsActivity"}""",
        ),
    )
}
