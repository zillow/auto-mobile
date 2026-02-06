package dev.jasonpearson.automobile.ide.layout

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import org.jetbrains.jewel.foundation.theme.JewelTheme
import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.ObservationStreamClient
import dev.jasonpearson.automobile.ide.datasource.DataSourceMode
import dev.jasonpearson.automobile.ide.tabs.PanelHeader
import dev.jasonpearson.automobile.ide.tabs.VerticalCollapsibleTab

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
    observationStreamClient: ObservationStreamClient,  // Shared stream client (managed at app level)
    platform: String = "android",  // Device platform ("android" or "ios")
) {
    val state = rememberLayoutInspectorState()
    val colors = JewelTheme.globalColors

    // Logger for dashboard - initialized early
    val dashboardLog = com.intellij.openapi.diagnostic.Logger.getInstance("LayoutInspectorDashboard")

    val streamClient = observationStreamClient

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
                val dataSource = dev.jasonpearson.automobile.ide.datasource.DataSourceFactory.createLayoutDataSource(dataSourceMode, clientProvider, platform)
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

    // Reset Properties panel to collapsed when selection is cleared
    // This ensures it starts collapsed next time user selects an element
    LaunchedEffect(state.selectedElementId) {
        if (state.selectedElementId == null) {
            isPropertiesCollapsed = true
        }
    }

    // Flash state for highlighting element in device view on double-click
    var flashElementId by remember { mutableStateOf<String?>(null) }

    // Resizable panel widths (in pixels for precise drag handling)
    val density = LocalDensity.current
    var hierarchyWidthPx by remember { mutableFloatStateOf(with(density) { 420.dp.toPx() }) }  // 280 * 1.5
    var propertiesWidthPx by remember { mutableFloatStateOf(with(density) { 330.dp.toPx() }) }  // 220 * 1.5

    val minPanelWidthPx = with(density) { 225.dp.toPx() }  // 150 * 1.5
    val maxPanelWidthPx = with(density) { 500.dp.toPx() }

    // Refit trigger - changes when panel collapse states change or selection changes to recenter the device view
    val hasSelection = state.selectedElementId != null
    val refitTrigger = remember(isHierarchyCollapsed, isPropertiesCollapsed, hasSelection) {
        "$isHierarchyCollapsed-$isPropertiesCollapsed-$hasSelection-${System.currentTimeMillis()}"
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
                flashElementId = flashElementId,
                onFlashComplete = { flashElementId = null },
                onElementSelected = { state.selectElement(it) },
                onElementHovered = { state.hoverElement(it) },
                showTapTargetIssues = state.showTapTargetIssues,
                onToggleTapTargetIssues = { state.toggleTapTargetIssues() },
                modifier = Modifier.fillMaxSize(),
                refitTrigger = refitTrigger,  // Trigger refit when panels toggle
            )
        }

        // Center panel: View Hierarchy (collapsible + resizable)
        VerticalCollapsibleTab(
            title = "View Hierarchy",
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
                    onElementDoubleClicked = { elementId ->
                        // Select the element
                        state.selectElement(elementId)
                        // Flash highlight in the device view
                        flashElementId = elementId
                        // Open the properties panel
                        isPropertiesCollapsed = false
                    },
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }

        // Right panel: Properties (only shown when an element is selected)
        if (state.selectedElementId != null) {
            VerticalCollapsibleTab(
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
}

// ResizablePanel, ResizeHandle, and PanelHeader moved to dev.jasonpearson.automobile.ide.tabs package
