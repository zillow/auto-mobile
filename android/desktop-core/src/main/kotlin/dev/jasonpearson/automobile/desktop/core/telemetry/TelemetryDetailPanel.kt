package dev.jasonpearson.automobile.desktop.core.telemetry

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.ImageBitmap

import dev.jasonpearson.automobile.desktop.core.navigation.ScreenshotLoader
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import androidx.compose.material3.Text
import java.text.SimpleDateFormat
import java.util.Date

/**
 * Detail panel for showing full event information when a row is clicked.
 *
 * Layout events with a hierarchy tree use a split layout: scrollable metadata
 * on top, and the full HierarchyTreeView filling the remaining space below
 * (it has its own internal LazyColumn and cannot nest inside verticalScroll).
 */
@Composable
fun TelemetryDetailPanel(
    event: TelemetryDisplayEvent,
    timeFormat: SimpleDateFormat,
    textColor: Color,
    onClose: () -> Unit,
    onOpenSource: ((String, Int, String) -> Unit)? = null,
    screenshotLoader: ScreenshotLoader? = null,
    rendererRegistry: CustomEventRendererRegistry? = null,
    modifier: Modifier = Modifier,
) {
    // Layout events with hierarchy need a split layout — scrollable metadata on top,
    // HierarchyTreeView (LazyColumn) filling remaining space below.
    val isLayoutWithHierarchy = event is TelemetryDisplayEvent.Layout &&
        event.subType == "hierarchy_change" && event.detailsJson != null

    Column(
        modifier = modifier
            .fillMaxHeight()
            .background(textColor.copy(alpha = 0.03f)),
    ) {
        Column(
            modifier = Modifier
                .then(if (isLayoutWithHierarchy) Modifier else Modifier.weight(1f))
                .verticalScroll(rememberScrollState())
                .padding(12.dp),
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    detailTitle(event),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = textColor,
                )
                Box(
                    modifier = Modifier
                        .background(textColor.copy(alpha = 0.1f), RoundedCornerShape(4.dp))
                        .clickable { onClose() }
                        .pointerHoverIcon(PointerIcon.Hand)
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                ) {
                    Text("\u2715", fontSize = 11.sp, color = textColor.copy(alpha = 0.6f)) // ✕
                }
            }

            Spacer(Modifier.height(4.dp))

            // Timestamp
            val formattedTime = remember(event.timestamp) { timeFormat.format(Date(event.timestamp)) }
            DetailRow("Time", formattedTime, textColor)

            Spacer(Modifier.height(8.dp))

            // Type-specific detail
            when (event) {
                is TelemetryDisplayEvent.Network -> NetworkDetail(event, textColor)
                is TelemetryDisplayEvent.Navigation -> NavigationDetail(event, textColor, screenshotLoader)
                is TelemetryDisplayEvent.Log -> LogDetail(event, textColor)
                is TelemetryDisplayEvent.Os -> OsDetail(event, textColor)
                is TelemetryDisplayEvent.Custom -> {
                    val config = rendererRegistry?.get(event.name)
                    CustomEventRenderedDetail(
                        event = event,
                        config = config,
                        textColor = textColor,
                    )
                }
                is TelemetryDisplayEvent.Failure -> FailureDetail(event, textColor, onOpenSource)
                is TelemetryDisplayEvent.Storage -> StorageDetail(event, textColor)
                is TelemetryDisplayEvent.Layout -> LayoutDetailMetadata(event, textColor)
                is TelemetryDisplayEvent.Performance -> PerformanceDetail(event, textColor)
                is TelemetryDisplayEvent.Memory -> MemoryDetail(event, textColor)
                is TelemetryDisplayEvent.ToolCall -> ToolCallDetail(event, textColor)
                is TelemetryDisplayEvent.Accessibility -> AccessibilityDetail(event, textColor)
            }
        }

        // Hierarchy tree fills remaining space (only for layout events with hierarchy data)
        if (event is TelemetryDisplayEvent.Layout && isLayoutWithHierarchy) {
            LayoutDetailHierarchy(event, modifier = Modifier.weight(1f))
        }
    }
}

private fun detailTitle(event: TelemetryDisplayEvent): String = when (event) {
    is TelemetryDisplayEvent.Network -> "Network Request"
    is TelemetryDisplayEvent.Navigation -> "Navigation"
    is TelemetryDisplayEvent.Log -> "Log Entry"
    is TelemetryDisplayEvent.Os -> "OS Event"
    is TelemetryDisplayEvent.Custom -> "Custom Event"
    is TelemetryDisplayEvent.Failure -> when (event.type) {
        "crash" -> "Crash"
        "anr" -> "ANR"
        else -> "Non-Fatal"
    }
    is TelemetryDisplayEvent.Storage -> "Storage Change"
    is TelemetryDisplayEvent.Layout -> "Layout Event"
    is TelemetryDisplayEvent.Performance -> "Performance"
    is TelemetryDisplayEvent.Memory -> "Memory Audit"
    is TelemetryDisplayEvent.ToolCall -> "Tool Call"
    is TelemetryDisplayEvent.Accessibility -> "Accessibility"
}

@Composable
private fun DetailRow(label: String, value: String, textColor: Color) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            label,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            color = textColor.copy(alpha = 0.5f),
            modifier = Modifier.padding(end = 4.dp),
        )
        Text(
            value,
            fontSize = 10.sp,
            fontFamily = FontFamily.Monospace,
            color = textColor.copy(alpha = 0.85f),
        )
    }
}

@Composable
private fun NetworkDetail(event: TelemetryDisplayEvent.Network, textColor: Color) {
    DetailRow("URL", event.url, textColor)
    DetailRow("Method", event.method, textColor)
    DetailRow("Status", "${event.statusCode}", textColor)
    event.host?.let { DetailRow("Host", it, textColor) }
    event.path?.let { DetailRow("Path", it, textColor) }
    DetailRow("Duration", "${event.durationMs}ms", textColor)
    event.error?.let { DetailRow("Error", it, textColor) }

    // Request/Response sizes
    val reqSize = (event.requestHeaders?.get("Content-Length")?.toLongOrNull()) ?: -1
    val respSize = (event.responseHeaders?.get("Content-Length")?.toLongOrNull()) ?: -1
    if (reqSize > 0) DetailRow("Request Size", formatByteSize(reqSize), textColor)
    if (respSize > 0) DetailRow("Response Size", formatByteSize(respSize), textColor)

    // Request Headers — data table with copy button
    Spacer(Modifier.height(8.dp))
    val reqHeadersCopy = remember(event.requestHeaders) {
        event.requestHeaders?.entries?.joinToString("\n") { "${it.key}: ${it.value}" }
    }
    CollapsibleSection(
        "Request Headers",
        textColor,
        defaultExpanded = !event.requestHeaders.isNullOrEmpty(),
        copyText = reqHeadersCopy,
    ) {
        val reqHeaders = event.requestHeaders
        if (!reqHeaders.isNullOrEmpty()) {
            HeaderDataTable(reqHeaders, textColor)
        } else {
            Text("No headers captured", fontSize = 9.sp, color = textColor.copy(alpha = 0.35f))
        }
    }

    // Request Body — content-type-aware rendering with copy
    Spacer(Modifier.height(4.dp))
    CollapsibleSection(
        "Request Body",
        textColor,
        defaultExpanded = !event.requestBody.isNullOrBlank(),
        copyText = event.requestBody,
    ) {
        NetworkBodyContent(
            body = event.requestBody,
            contentType = event.requestHeaders?.get("Content-Type"),
            bodySize = reqSize,
            textColor = textColor,
        )
    }

    // Response Headers — data table with copy
    Spacer(Modifier.height(4.dp))
    val respHeadersCopy = remember(event.responseHeaders) {
        event.responseHeaders?.entries?.joinToString("\n") { "${it.key}: ${it.value}" }
    }
    CollapsibleSection(
        "Response Headers",
        textColor,
        defaultExpanded = !event.responseHeaders.isNullOrEmpty(),
        copyText = respHeadersCopy,
    ) {
        val respHeaders = event.responseHeaders
        if (!respHeaders.isNullOrEmpty()) {
            HeaderDataTable(respHeaders, textColor)
        } else {
            Text("No headers captured", fontSize = 9.sp, color = textColor.copy(alpha = 0.35f))
        }
    }

    // Response Body — content-type-aware rendering with copy
    Spacer(Modifier.height(4.dp))
    CollapsibleSection(
        "Response Body",
        textColor,
        defaultExpanded = !event.responseBody.isNullOrBlank(),
        copyText = event.responseBody,
    ) {
        NetworkBodyContent(
            body = event.responseBody,
            contentType = event.contentType,
            bodySize = respSize,
            textColor = textColor,
        )
    }

    // cURL command
    Spacer(Modifier.height(8.dp))
    val curlCommand = remember(event) { generateCurlCommand(event) }
    CollapsibleSection("cURL", textColor, copyText = curlCommand) {
        MonospaceBlock(curlCommand, textColor)
    }

    // Run button — key on event to reset state when switching events
    Spacer(Modifier.height(8.dp))
    var replayResult by remember(event) { mutableStateOf<NetworkReplayResult?>(null) }
    var isRunning by remember(event) { mutableStateOf(false) }

    ActionButton(if (isRunning) "Running..." else "Run", textColor, enabled = !isRunning) {
        isRunning = true
        replayResult = null
        Thread {
            val result = NetworkRequestRunner.run(
                url = event.url,
                method = event.method,
                requestHeaders = event.requestHeaders,
                requestBody = event.requestBody,
            )
            javax.swing.SwingUtilities.invokeLater {
                replayResult = result
                isRunning = false
            }
        }.start()
    }

    // Replay result
    val result = replayResult
    if (result != null) {
        Spacer(Modifier.height(8.dp))
        Text(
            "Replay Result",
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            color = textColor.copy(alpha = 0.7f),
        )
        Spacer(Modifier.height(4.dp))
        DetailRow("Status", "${result.statusCode}", textColor)
        DetailRow("Duration", "${result.durationMs}ms", textColor)
        result.error?.let { DetailRow("Error", it, textColor) }
        val replayRespHeadersCopy = result.responseHeaders.entries.joinToString("\n") { "${it.key}: ${it.value}" }
        CollapsibleSection("Response Headers", textColor, defaultExpanded = false, copyText = replayRespHeadersCopy) {
            if (result.responseHeaders.isNotEmpty()) {
                HeaderDataTable(result.responseHeaders, textColor)
            } else {
                Text("No headers", fontSize = 9.sp, color = textColor.copy(alpha = 0.35f))
            }
        }
        CollapsibleSection("Response Body", textColor, copyText = result.responseBody) {
            NetworkBodyContent(
                body = result.responseBody,
                contentType = result.responseHeaders["content-type"],
                bodySize = result.responseBody?.length?.toLong() ?: -1,
                textColor = textColor,
            )
        }
    }
}

@Composable
private fun CollapsibleSection(
    title: String,
    textColor: Color,
    defaultExpanded: Boolean = true,
    copyText: String? = null,
    content: @Composable () -> Unit,
) {
    var expanded by remember { mutableStateOf(defaultExpanded) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { expanded = !expanded }
            .pointerHoverIcon(PointerIcon.Hand)
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (expanded) "\u25BE" else "\u25B8",
            fontSize = 9.sp,
            color = textColor.copy(alpha = 0.5f),
        )
        Spacer(Modifier.width(4.dp))
        Text(
            title,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            color = textColor.copy(alpha = 0.7f),
            modifier = Modifier.weight(1f),
        )
        if (copyText != null && expanded) {
            Box(
                modifier = Modifier
                    .clickable {
                        val clipboard = java.awt.Toolkit.getDefaultToolkit().systemClipboard
                        clipboard.setContents(java.awt.datatransfer.StringSelection(copyText), null)
                    }
                    .pointerHoverIcon(PointerIcon.Hand)
                    .padding(4.dp),
            ) {
                Text("\uD83D\uDCCB", fontSize = 10.sp) // 📋
            }
        }
    }
    if (expanded) {
        content()
    }
}

@Composable
private fun MonospaceBlock(text: String, textColor: Color) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(textColor.copy(alpha = 0.05f), RoundedCornerShape(4.dp))
            .padding(6.dp),
    ) {
        Text(
            text,
            fontSize = 9.sp,
            fontFamily = FontFamily.Monospace,
            color = textColor.copy(alpha = 0.8f),
        )
    }
}

@Composable
private fun ActionButton(
    label: String,
    textColor: Color,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .background(
                if (enabled) textColor.copy(alpha = 0.12f) else textColor.copy(alpha = 0.05f),
                RoundedCornerShape(4.dp),
            )
            .then(if (enabled) Modifier.clickable { onClick() }.pointerHoverIcon(PointerIcon.Hand) else Modifier)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(
            label,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (enabled) textColor.copy(alpha = 0.8f) else textColor.copy(alpha = 0.4f),
        )
    }
}

private fun generateCurlCommand(event: TelemetryDisplayEvent.Network): String {
    val sb = StringBuilder()
    sb.append("curl -X ${event.method}")
    event.requestHeaders?.forEach { (key, value) ->
        val displayValue = if (key.equals("Authorization", ignoreCase = true)) "[REDACTED]" else value
        sb.append(" \\\n  -H '${key}: ${displayValue.replace("'", "'\\''")}'")
    }
    val reqBody = event.requestBody
    if (!reqBody.isNullOrBlank()) {
        sb.append(" \\\n  -d '${reqBody.replace("'", "'\\''")}'")
    }
    sb.append(" \\\n  '${event.url}'")
    return sb.toString()
}

@Composable
private fun NavigationDetail(
    event: TelemetryDisplayEvent.Navigation,
    textColor: Color,
    screenshotLoader: ScreenshotLoader? = null,
) {
    DetailRow("Destination", event.destination, textColor)
    event.source?.let { DetailRow("Source", it, textColor) }
    event.triggeringInteraction?.let { DetailRow("Triggered by", it, textColor) }
    event.arguments?.forEach { (k, v) -> DetailRow("Arg: $k", v, textColor) }
    event.metadata?.forEach { (k, v) -> DetailRow("Meta: $k", v, textColor) }

    // Screenshot thumbnail — fixed-size box prevents layout re-measurement crashes
    val uri = event.screenshotUri
    if (uri != null && screenshotLoader != null) {
        Spacer(Modifier.height(8.dp))
        var bitmap by remember(uri) { mutableStateOf<ImageBitmap?>(null) }
        LaunchedEffect(uri) {
            bitmap = screenshotLoader.load(uri)
        }
        Box(
            modifier = Modifier
                .width(280.dp)
                .height(200.dp)
                .background(textColor.copy(alpha = 0.05f), RoundedCornerShape(4.dp)),
            contentAlignment = Alignment.Center,
        ) {
            val loadedBitmap = bitmap
            if (loadedBitmap != null) {
                Image(
                    bitmap = loadedBitmap,
                    contentDescription = "Screenshot of ${event.destination}",
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                Text(
                    "Loading...",
                    fontSize = 9.sp,
                    color = textColor.copy(alpha = 0.4f),
                )
            }
        }
    }
}

@Composable
private fun LogDetail(event: TelemetryDisplayEvent.Log, textColor: Color) {
    val levelName = when (event.level) {
        2 -> "VERBOSE"
        3 -> "DEBUG"
        4 -> "INFO"
        5 -> "WARN"
        6 -> "ERROR"
        7 -> "ASSERT"
        else -> "UNKNOWN"
    }
    DetailRow("Level", levelName, textColor)
    DetailRow("Tag", event.tag, textColor)
    Spacer(Modifier.height(4.dp))
    Text(
        event.message,
        fontSize = 10.sp,
        fontFamily = FontFamily.Monospace,
        color = textColor.copy(alpha = 0.85f),
    )
}

@Composable
private fun OsDetail(event: TelemetryDisplayEvent.Os, textColor: Color) {
    DetailRow("Category", event.category, textColor)
    DetailRow("Kind", event.kind, textColor)
    event.details?.forEach { (k, v) -> DetailRow(k, v, textColor) }
}

@Composable
private fun FailureDetail(event: TelemetryDisplayEvent.Failure, textColor: Color, onOpenSource: ((String, Int, String) -> Unit)?) {
    val severityColor = when (event.severity) {
        "critical" -> Color(0xFFFF4040)
        "high" -> Color(0xFFFF6B6B)
        "medium" -> Color(0xFFE0C040)
        else -> textColor.copy(alpha = 0.7f)
    }

    Row(
        modifier = Modifier.padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .background(severityColor.copy(alpha = 0.2f), RoundedCornerShape(3.dp))
                .padding(horizontal = 6.dp, vertical = 1.dp),
        ) {
            Text(
                event.severity.uppercase(),
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                color = severityColor,
            )
        }
    }

    DetailRow("Title", event.title, textColor)
    event.exceptionType?.let { DetailRow("Exception", it, textColor) }
    event.screen?.let { DetailRow("Screen", it, textColor) }
    DetailRow("Occurrence ID", event.occurrenceId, textColor)

    // Stack trace
    val frames = event.stackTrace
    if (!frames.isNullOrEmpty()) {
        Spacer(Modifier.height(8.dp))
        Text(
            "Stack Trace",
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            color = textColor.copy(alpha = 0.7f),
        )
        Spacer(Modifier.height(4.dp))

        for (frame in frames) {
            val location = buildString {
                append(frame.fileName ?: frame.className.substringAfterLast('.'))
                if (frame.lineNumber != null) append(":${frame.lineNumber}")
            }
            val frameText = "at ${frame.className}.${frame.methodName}($location)"

            val fName = frame.fileName
            val fLine = frame.lineNumber
            if (frame.isAppCode && onOpenSource != null && fName != null && fLine != null) {
                // Clickable app code frame
                Text(
                    frameText,
                    fontSize = 9.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.SemiBold,
                    color = textColor.copy(alpha = 0.9f),
                    modifier = Modifier
                        .clickable {
                            onOpenSource(fName, fLine, frame.className)
                        }
                        .pointerHoverIcon(PointerIcon.Hand)
                        .padding(vertical = 1.dp),
                )
            } else {
                // Non-clickable library/platform frame
                Text(
                    frameText,
                    fontSize = 9.sp,
                    fontFamily = FontFamily.Monospace,
                    color = textColor.copy(alpha = 0.4f),
                    modifier = Modifier.padding(vertical = 1.dp),
                )
            }
        }
    }
}

@Composable
private fun StorageDetail(event: TelemetryDisplayEvent.Storage, textColor: Color) {
    DetailRow("File", event.fileName, textColor)
    event.key?.let { DetailRow("Key", it, textColor) }
    DetailRow("Change Type", event.changeType, textColor)

    Spacer(Modifier.height(4.dp))

    val prevValue = event.previousValue
    val curValue = event.value
    when {
        // Value removed — show only the previous value
        curValue == null && event.changeType == "remove" && prevValue != null -> {
            Text(
                "Removed value:",
                fontSize = 9.sp,
                fontWeight = FontWeight.SemiBold,
                color = textColor.copy(alpha = 0.5f),
            )
            Text(
                prevValue,
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace,
                color = Color(0xFFFF6B6B).copy(alpha = 0.8f),
                modifier = Modifier.padding(vertical = 1.dp),
            )
        }
        // New key added — show only the new value
        prevValue == null && event.changeType == "add" -> {
            curValue?.let { v ->
                Text(
                    "New value:",
                    fontSize = 9.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = textColor.copy(alpha = 0.5f),
                )
                Text(
                    v,
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    color = Color(0xFF51CF66).copy(alpha = 0.8f),
                    modifier = Modifier.padding(vertical = 1.dp),
                )
            }
        }
        // Modified — show before/after
        prevValue != null && curValue != null -> {
            Text(
                "Previous:",
                fontSize = 9.sp,
                fontWeight = FontWeight.SemiBold,
                color = textColor.copy(alpha = 0.5f),
            )
            Text(
                prevValue,
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace,
                color = Color(0xFFFF6B6B).copy(alpha = 0.7f),
                modifier = Modifier.padding(vertical = 1.dp),
            )
            Spacer(Modifier.height(2.dp))
            Text(
                "New:",
                fontSize = 9.sp,
                fontWeight = FontWeight.SemiBold,
                color = textColor.copy(alpha = 0.5f),
            )
            Text(
                curValue,
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace,
                color = Color(0xFF51CF66).copy(alpha = 0.8f),
                modifier = Modifier.padding(vertical = 1.dp),
            )
        }
        // Fallback — just show value
        else -> {
            event.value?.let { DetailRow("Value", it, textColor) }
        }
    }

    event.valueType?.let { DetailRow("Value Type", it, textColor) }
}

/**
 * Metadata portion of layout detail (rendered in the scrollable section).
 */
@Composable
private fun LayoutDetailMetadata(event: TelemetryDisplayEvent.Layout, textColor: Color) {
    DetailRow("Sub-type", event.subType, textColor)
    event.screenName?.let { DetailRow("Screen", it, textColor) }
    event.composableName?.let { DetailRow("Composable", it, textColor) }
    event.recompositionCount?.let { DetailRow("Recomp/s", "$it", textColor) }
    event.durationMs?.let { DetailRow("Duration", "${it}ms", textColor) }
    event.likelyCause?.let { DetailRow("Likely Cause", it, textColor) }

    // Parse and display metadata from detailsJson (foreground activity, window count)
    val details = event.detailsJson
    if (details != null) {
        val metadata = remember(details) {
            try {
                val json = Json { ignoreUnknownKeys = true }
                val obj = json.parseToJsonElement(details).jsonObject
                val foreground = obj["foregroundActivity"]
                    ?.takeIf { it !is JsonNull }
                    ?.jsonPrimitive?.content
                val windowCount = obj["windowCount"]?.jsonPrimitive?.intOrNull
                Pair(foreground, windowCount)
            } catch (_: Exception) {
                null
            }
        }
        if (metadata != null) {
            Spacer(Modifier.height(4.dp))
            metadata.first?.let { DetailRow("Foreground Activity", it, textColor) }
            metadata.second?.let { DetailRow("Windows", "$it", textColor) }
        }
    }
}

/**
 * Hierarchy tree portion of layout detail. Rendered outside the verticalScroll
 * container so HierarchyTreeView's internal LazyColumn works correctly.
 */
@Composable
private fun LayoutDetailHierarchy(event: TelemetryDisplayEvent.Layout, modifier: Modifier = Modifier) {
    val details = event.detailsJson ?: return
    val parsed = remember(details) {
        try {
            val json = Json { ignoreUnknownKeys = true }
            val obj = json.parseToJsonElement(details).jsonObject
            obj["hierarchy"]?.let { hierarchyElement ->
                dev.jasonpearson.automobile.desktop.core.layout.parseHierarchyFromJson(
                    buildJsonObject { put("hierarchy", hierarchyElement) }
                )
            }
        } catch (_: Exception) {
            null
        }
    }
    val hierarchy = parsed ?: return

    dev.jasonpearson.automobile.desktop.core.layout.HierarchyTreeView(
        hierarchy = hierarchy.root,
        selectedElementId = null,
        hoveredElementId = null,
        onElementSelected = {},
        onElementHovered = {},
        parentMap = hierarchy.parentMap,
        modifier = modifier,
    )
}

@Composable
private fun PerformanceDetail(event: TelemetryDisplayEvent.Performance, textColor: Color) {
    val healthColor = when (event.health) {
        "critical" -> Color(0xFFFF4040)
        "warning" -> Color(0xFFFFA94D)
        else -> Color(0xFF51CF66)
    }

    Row(
        modifier = Modifier.padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .background(healthColor.copy(alpha = 0.2f), RoundedCornerShape(3.dp))
                .padding(horizontal = 6.dp, vertical = 1.dp),
        ) {
            Text(
                event.health.uppercase(),
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                color = healthColor,
            )
        }
    }

    if (event.changedMetrics.isNotEmpty()) {
        DetailRow("Changed", event.changedMetrics.joinToString(", "), textColor)
    }

    Spacer(Modifier.height(4.dp))
    event.fps?.let { DetailRow("Frame Rate", "${it.toInt()} fps", textColor) }
    event.frameTimeMs?.let { DetailRow("Frame Time", "${it.toInt()} ms", textColor) }
    event.jankFrames?.let { DetailRow("Jank Frames", "$it", textColor) }
    event.touchLatencyMs?.let { DetailRow("Touch Latency", "${it.toInt()} ms", textColor) }
    event.memoryUsageMb?.let { DetailRow("Memory", "${it.toInt()} MB", textColor) }
    event.cpuUsagePercent?.let { DetailRow("CPU", "${"%.1f".format(it)}%", textColor) }
}

@Composable
private fun MemoryDetail(event: TelemetryDisplayEvent.Memory, textColor: Color) {
    val resultColor = if (event.passed) Color(0xFF51CF66) else Color(0xFFFF6B6B)
    Row(
        modifier = Modifier.padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .background(resultColor.copy(alpha = 0.2f), RoundedCornerShape(3.dp))
                .padding(horizontal = 6.dp, vertical = 1.dp),
        ) {
            Text(
                if (event.passed) "PASSED" else "FAILED",
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                color = resultColor,
            )
        }
    }
    DetailRow("Package", event.packageName, textColor)
    event.javaHeapGrowthMb?.let { DetailRow("Java Heap Growth", "${"%.2f".format(it)} MB", textColor) }
    event.nativeHeapGrowthMb?.let { DetailRow("Native Heap Growth", "${"%.2f".format(it)} MB", textColor) }
    event.gcCount?.let { DetailRow("GC Count", "$it", textColor) }
    event.gcDurationMs?.let { DetailRow("GC Duration", "${it}ms", textColor) }
    event.unreachableObjects?.let { DetailRow("Unreachable Objects", "$it", textColor) }
    if (event.violations.isNotEmpty()) {
        Spacer(Modifier.height(4.dp))
        DetailRow("Violations", event.violations.joinToString(", "), textColor)
    }
}

@Composable
private fun ToolCallDetail(event: TelemetryDisplayEvent.ToolCall, textColor: Color) {
    DetailRow("Tool", event.toolName, textColor)
    DetailRow("Duration", "${event.durationMs}ms", textColor)
    DetailRow("Success", if (event.success) "Yes" else "No", textColor)
    event.error?.let { DetailRow("Error", it, textColor) }
}

@Composable
private fun AccessibilityDetail(event: TelemetryDisplayEvent.Accessibility, textColor: Color) {
    DetailRow("Package", event.packageName, textColor)
    DetailRow("Screen", event.screenId, textColor)
    DetailRow("New Violations", "${event.newViolations}", textColor)
    DetailRow("Total Violations", "${event.totalViolations}", textColor)
    if (event.baselinedCount > 0) {
        DetailRow("Baselined", "${event.baselinedCount}", textColor)
    }

    if (event.violations.isNotEmpty()) {
        Spacer(Modifier.height(8.dp))
        for (v in event.violations) {
            val sevColor = when (v.severity) {
                "error" -> Color(0xFFFF6B6B)
                "warning" -> Color(0xFFFFA94D)
                else -> textColor.copy(alpha = 0.6f)
            }
            Row(modifier = Modifier.padding(vertical = 2.dp)) {
                Text(
                    "[${v.criterion}] ",
                    fontSize = 9.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.SemiBold,
                    color = sevColor,
                )
                Text(
                    "${v.type}: ${v.message}",
                    fontSize = 9.sp,
                    fontFamily = FontFamily.Monospace,
                    color = textColor.copy(alpha = 0.75f),
                )
            }
        }
    }
}

