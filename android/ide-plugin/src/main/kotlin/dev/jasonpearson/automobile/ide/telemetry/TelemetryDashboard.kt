package dev.jasonpearson.automobile.ide.telemetry

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.jasonpearson.automobile.ide.daemon.TelemetryConnectionState
import dev.jasonpearson.automobile.ide.daemon.TelemetryPushClient
import dev.jasonpearson.automobile.ide.datasource.DataSourceMode
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.Text
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val MAX_EVENTS = 1000

private enum class CategoryFilter(val label: String, val icon: String) {
    All("All", "\uD83D\uDCE1"),       // 📡
    Network("Network", "\uD83C\uDF10"), // 🌐
    Logs("Logs", "\uD83D\uDCDD"),      // 📝
    Os("OS", "\u2699\uFE0F"),           // ⚙️
    Custom("Custom", "\uD83C\uDFF7\uFE0F"), // 🏷️
}

/**
 * Telemetry dashboard showing a real-time scrollable event list
 * with category filtering (Network, Logs, OS, Custom).
 */
@Composable
fun TelemetryDashboard(
    telemetryPushClient: TelemetryPushClient?,
    dataSourceMode: DataSourceMode,
    modifier: Modifier = Modifier,
) {
    val colors = JewelTheme.globalColors
    val events = remember { mutableStateListOf<TelemetryDisplayEvent>() }
    var selectedFilter by remember { mutableStateOf(CategoryFilter.All) }
    var connectionState by remember { mutableStateOf<TelemetryConnectionState?>(null) }
    val listState = rememberLazyListState()
    val timeFormat = remember { SimpleDateFormat("HH:mm:ss.SSS", Locale.US) }

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

    // Filtered events — derivedStateOf tracks SnapshotStateList mutations correctly,
    // unlike remember(events.size) which freezes once the list hits MAX_EVENTS cap.
    val filteredEvents by remember(selectedFilter) {
        derivedStateOf {
            if (selectedFilter == CategoryFilter.All) {
                events.toList()
            } else {
                events.filter { event ->
                    when (selectedFilter) {
                        CategoryFilter.All -> true
                        CategoryFilter.Network -> event is TelemetryDisplayEvent.Network
                        CategoryFilter.Logs -> event is TelemetryDisplayEvent.Log
                        CategoryFilter.Os -> event is TelemetryDisplayEvent.Os
                        CategoryFilter.Custom -> event is TelemetryDisplayEvent.Custom
                    }
                }
            }
        }
    }

    // Category counts
    val counts by remember {
        derivedStateOf {
            mapOf(
                CategoryFilter.All to events.size,
                CategoryFilter.Network to events.count { it is TelemetryDisplayEvent.Network },
                CategoryFilter.Logs to events.count { it is TelemetryDisplayEvent.Log },
                CategoryFilter.Os to events.count { it is TelemetryDisplayEvent.Os },
                CategoryFilter.Custom to events.count { it is TelemetryDisplayEvent.Custom },
            )
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        // Category filter row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CategoryFilter.entries.forEach { filter ->
                val isSelected = filter == selectedFilter
                val count = counts[filter] ?: 0
                Box(
                    modifier = Modifier
                        .background(
                            if (isSelected) colors.text.normal.copy(alpha = 0.12f) else Color.Transparent,
                            RoundedCornerShape(6.dp),
                        )
                        .clickable { selectedFilter = filter }
                        .pointerHoverIcon(PointerIcon.Hand)
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(filter.icon, fontSize = 11.sp)
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

        // Event list
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
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
            ) {
                items(filteredEvents, key = { "${it.timestamp}_${it.hashCode()}" }) { event ->
                    TelemetryEventRow(event, timeFormat, colors.text.normal)
                }
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
                is TelemetryDisplayEvent.Log -> "\uD83D\uDCDD"      // 📝
                is TelemetryDisplayEvent.Os -> "\u2699\uFE0F"       // ⚙️
                is TelemetryDisplayEvent.Custom -> "\uD83C\uDFF7\uFE0F" // 🏷️
            },
            fontSize = 10.sp,
        )
        Spacer(Modifier.width(4.dp))

        // Summary text
        when (event) {
            is TelemetryDisplayEvent.Network -> NetworkSummary(event, textColor)
            is TelemetryDisplayEvent.Log -> LogSummary(event, textColor)
            is TelemetryDisplayEvent.Custom -> CustomSummary(event, textColor)
            is TelemetryDisplayEvent.Os -> OsSummary(event, textColor)
        }
    }
}

@Composable
private fun NetworkSummary(event: TelemetryDisplayEvent.Network, textColor: Color) {
    val isError = event.statusCode >= 400 || event.error != null
    val color = if (isError) Color(0xFFE06060) else textColor.copy(alpha = 0.85f)
    val displayPath = event.path ?: event.url

    Text(
        "${event.method} ${event.statusCode} $displayPath (${event.durationMs}ms)",
        fontSize = 11.sp,
        fontFamily = FontFamily.Monospace,
        color = color,
        maxLines = 1,
    )
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
private fun OsSummary(event: TelemetryDisplayEvent.Os, textColor: Color) {
    val detailsText = if (event.details != null && event.details.isNotEmpty()) {
        " ${event.details.entries.joinToString(", ") { "${it.key}:${it.value}" }}"
    } else {
        ""
    }

    Text(
        "[${event.category}] ${event.kind}$detailsText",
        fontSize = 11.sp,
        fontFamily = FontFamily.Monospace,
        color = textColor.copy(alpha = 0.85f),
        maxLines = 1,
    )
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
        ),
    )
}
