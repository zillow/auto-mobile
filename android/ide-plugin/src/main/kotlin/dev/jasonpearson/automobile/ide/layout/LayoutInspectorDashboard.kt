package dev.jasonpearson.automobile.ide.layout

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.Text
import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.ObservationStreamClient
import dev.jasonpearson.automobile.ide.datasource.DataSourceMode

/**
 * Main Layout Inspector dashboard with 3-panel layout:
 * - Left: Device screen with screenshot and overlays (expands when panels collapse)
 * - Center: View hierarchy tree (collapsible)
 * - Right: Property inspector (collapsible)
 */
@Composable
fun LayoutInspectorDashboard(
    modifier: Modifier = Modifier,
    dataSourceMode: DataSourceMode = DataSourceMode.Fake,
    clientProvider: (() -> AutoMobileClient)? = null,  // MCP client for real data
    observationStreamClient: ObservationStreamClient? = null,  // Shared stream client (managed at app level)
) {
    val state = rememberLayoutInspectorState()
    val colors = JewelTheme.globalColors

    // Logger for dashboard - initialized early
    val dashboardLog = com.intellij.openapi.diagnostic.Logger.getInstance("LayoutInspectorDashboard")

    // Use provided stream client, or create a local one for backwards compatibility
    val streamClient = observationStreamClient ?: remember { ObservationStreamClient() }
    val isLocalClient = observationStreamClient == null

    // Log the client instance being used
    dashboardLog.info("Dashboard using streamClient: ${streamClient.hashCode()}, isLocalClient=$isLocalClient, observationStreamClient=${observationStreamClient?.hashCode()}")

    // Only manage connection if we created a local client
    if (isLocalClient) {
        DisposableEffect(Unit) {
            dashboardLog.info("Local client created, connecting...")
            streamClient.connect()
            onDispose {
                dashboardLog.info("Local client disposing, disconnecting...")
                streamClient.disconnect()
            }
        }
    }

    // Collect hierarchy updates from the stream
    LaunchedEffect(streamClient) {
        dashboardLog.info("Starting hierarchy updates collection from stream client: ${streamClient.hashCode()}")
        streamClient.hierarchyUpdates.collect { update ->
            dashboardLog.info("Received hierarchy update in dashboard - deviceId=${update.deviceId}, hasData=${update.data != null}")
            update.data?.let { hierarchyJson ->
                dashboardLog.info("Parsing hierarchy JSON...")
                val hierarchy = parseHierarchyFromJson(hierarchyJson)
                if (hierarchy != null) {
                    dashboardLog.info("Parsed hierarchy: root=${hierarchy.className}, children=${hierarchy.children.size}")
                    state.updateHierarchy(hierarchy)
                    dashboardLog.info("Updated state with new hierarchy")
                } else {
                    dashboardLog.warn("Failed to parse hierarchy from JSON")
                }
            }
        }
    }

    // Collect screenshot updates from the stream
    LaunchedEffect(streamClient) {
        dashboardLog.info("Starting screenshot updates collection from stream client: ${streamClient.hashCode()}")
        streamClient.screenshotUpdates.collect { update ->
            dashboardLog.info("Received screenshot update in dashboard - deviceId=${update.deviceId}, hasScreenshot=${update.screenshotBase64 != null}")
            update.screenshotBase64?.let { base64 ->
                // Decode base64 to byte array
                val screenshotData = java.util.Base64.getDecoder().decode(base64)
                dashboardLog.info("Decoded screenshot: ${screenshotData.size} bytes")
                state.updateScreenshot(
                    data = screenshotData,
                    width = update.screenWidth,
                    height = update.screenHeight,
                    timestamp = update.timestamp,
                )
                dashboardLog.info("Updated state with new screenshot")
            }
        }
    }

    // Initial fetch as fallback (in case stream hasn't pushed yet)
    LaunchedEffect(dataSourceMode, clientProvider) {
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            try {
                val dataSource = dev.jasonpearson.automobile.ide.datasource.DataSourceFactory.createLayoutDataSource(dataSourceMode, clientProvider)
                when (val result = dataSource.getObservation()) {
                    is dev.jasonpearson.automobile.ide.datasource.Result.Success -> {
                        val observation = result.data
                        state.updateHierarchy(observation.hierarchy)
                        observation.screenshotData?.let { screenshot ->
                            state.updateScreenshot(
                                data = screenshot,
                                width = observation.screenWidth,
                                height = observation.screenHeight,
                                timestamp = observation.timestamp,
                            )
                        }
                    }
                    is dev.jasonpearson.automobile.ide.datasource.Result.Error -> {
                        // Keep current state or show error
                    }
                    is dev.jasonpearson.automobile.ide.datasource.Result.Loading -> {
                        // Keep loading state
                    }
                }
            } catch (e: Exception) {
                // Keep current state or show error
            }
        }
    }

    // Panel collapse states - default to collapsed, remember user preference
    // TODO: Persist these to IDE preferences for remembering across sessions
    var isHierarchyCollapsed by remember { mutableStateOf(true) }
    var isPropertiesCollapsed by remember { mutableStateOf(true) }

    // Resizable panel widths (in pixels for precise drag handling)
    val density = LocalDensity.current
    var hierarchyWidthPx by remember { mutableFloatStateOf(with(density) { 280.dp.toPx() }) }
    var propertiesWidthPx by remember { mutableFloatStateOf(with(density) { 220.dp.toPx() }) }

    val minPanelWidthPx = with(density) { 150.dp.toPx() }
    val maxPanelWidthPx = with(density) { 500.dp.toPx() }

    // Refit trigger - changes when panel collapse states change to recenter the device view
    val refitTrigger = remember(isHierarchyCollapsed, isPropertiesCollapsed) {
        "$isHierarchyCollapsed-$isPropertiesCollapsed-${System.currentTimeMillis()}"
    }

    // Main content with 3 panels
    Row(modifier = modifier.fillMaxSize()) {
        // Left panel: Device Screen (flexible - expands when others collapse)
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .background(colors.text.normal.copy(alpha = 0.02f)),
        ) {
            DeviceScreenView(
                screenshotData = state.screenshotData,
                screenWidth = state.screenWidth,
                screenHeight = state.screenHeight,
                hierarchy = state.hierarchy,
                selectedElementId = state.selectedElementId,
                hoveredElementId = state.hoveredElementId,
                onElementSelected = { state.selectElement(it) },
                onElementHovered = { state.hoverElement(it) },
                modifier = Modifier.fillMaxSize(),
                refitTrigger = refitTrigger,  // Trigger refit when panels toggle
            )
        }

        // Center panel: View Hierarchy (collapsible + resizable)
        ResizablePanel(
            title = "Hierarchy",
            isCollapsed = isHierarchyCollapsed,
            onToggle = { isHierarchyCollapsed = !isHierarchyCollapsed },
            widthPx = hierarchyWidthPx,
            onWidthChange = { delta ->
                hierarchyWidthPx = (hierarchyWidthPx - delta).coerceIn(minPanelWidthPx, maxPanelWidthPx)
            },
            resizeHandleOnLeft = true,
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                PanelHeader(
                    title = "View Hierarchy",
                    onCollapse = { isHierarchyCollapsed = true },
                )
                HierarchyTreeView(
                    hierarchy = state.hierarchy,
                    selectedElementId = state.selectedElementId,
                    hoveredElementId = state.hoveredElementId,
                    onElementSelected = { state.selectElement(it) },
                    onElementHovered = { state.hoverElement(it) },
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }

        // Right panel: Properties (collapsible + resizable)
        ResizablePanel(
            title = "Properties",
            isCollapsed = isPropertiesCollapsed,
            onToggle = { isPropertiesCollapsed = !isPropertiesCollapsed },
            widthPx = propertiesWidthPx,
            onWidthChange = { delta ->
                propertiesWidthPx = (propertiesWidthPx - delta).coerceIn(minPanelWidthPx, maxPanelWidthPx)
            },
            resizeHandleOnLeft = true,
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                PanelHeader(
                    title = "Properties",
                    onCollapse = { isPropertiesCollapsed = true },
                )
                PropertyInspectorPanel(
                    element = state.selectedElement,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
}

@Composable
private fun ResizablePanel(
    title: String,
    isCollapsed: Boolean,
    onToggle: () -> Unit,
    widthPx: Float,
    onWidthChange: (Float) -> Unit,
    resizeHandleOnLeft: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colors = JewelTheme.globalColors
    val density = LocalDensity.current

    if (isCollapsed) {
        // Collapsed state: vertical tab aligned to top
        Box(
            modifier = Modifier
                .width(24.dp)
                .fillMaxHeight()
                .background(colors.text.normal.copy(alpha = 0.03f))
                .clickable(onClick = onToggle)
                .pointerHoverIcon(PointerIcon.Hand),
        ) {
            // Rotated text positioned at top - use a box with height to contain rotated text
            Box(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 12.dp)
                    .width(24.dp)
                    .height(100.dp),
                contentAlignment = Alignment.TopCenter,
            ) {
                Text(
                    title,
                    fontSize = 11.sp,
                    maxLines = 1,
                    softWrap = false,
                    color = colors.text.normal.copy(alpha = 0.6f),
                    modifier = Modifier.rotate(-90f),
                )
            }
        }
    } else {
        // Expanded state: panel with resize handle
        Row(
            modifier = Modifier
                .width(with(density) { widthPx.toDp() })
                .fillMaxHeight(),
        ) {
            if (resizeHandleOnLeft) {
                ResizeHandle(
                    onDrag = { delta -> onWidthChange(delta) },
                )
            }

            Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                content()
            }

            if (!resizeHandleOnLeft) {
                ResizeHandle(
                    onDrag = { delta -> onWidthChange(-delta) },
                )
            }
        }
    }
}

@Composable
private fun ResizeHandle(
    onDrag: (Float) -> Unit,
) {
    val colors = JewelTheme.globalColors
    var isDragging by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .width(4.dp)
            .fillMaxHeight()
            .background(
                if (isDragging) colors.text.normal.copy(alpha = 0.3f)
                else colors.text.normal.copy(alpha = 0.1f)
            )
            .pointerHoverIcon(PointerIcon.Crosshair)
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = { isDragging = true },
                    onDragEnd = { isDragging = false },
                    onDragCancel = { isDragging = false },
                    onDrag = { change, dragAmount ->
                        change.consume()
                        onDrag(dragAmount.x)
                    }
                )
            },
    )
}

@Composable
private fun PanelHeader(
    title: String,
    onCollapse: (() -> Unit)? = null,
) {
    val colors = JewelTheme.globalColors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.03f))
            .padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            fontSize = 11.sp,
            color = colors.text.normal.copy(alpha = 0.7f),
        )

        if (onCollapse != null) {
            Text(
                "«",
                fontSize = 12.sp,
                color = colors.text.normal.copy(alpha = 0.4f),
                modifier = Modifier
                    .clickable(onClick = onCollapse)
                    .pointerHoverIcon(PointerIcon.Hand)
                    .padding(horizontal = 4.dp),
            )
        }
    }
}
