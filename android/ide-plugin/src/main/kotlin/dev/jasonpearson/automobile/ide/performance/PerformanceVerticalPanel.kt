package dev.jasonpearson.automobile.ide.performance

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.ObservationStreamClient
import dev.jasonpearson.automobile.ide.datasource.DataSourceMode
import dev.jasonpearson.automobile.ide.tabs.PanelHeader
import dev.jasonpearson.automobile.ide.tabs.VerticalCollapsibleTab

/**
 * Vertical panel wrapper for PerformanceDashboard with collapse support.
 * Shows FPS/memory summary when collapsed.
 */
@Composable
fun PerformanceVerticalPanel(
    isCollapsed: Boolean,
    onToggle: () -> Unit,
    widthPx: Float,
    onWidthChange: (Float) -> Unit,
    currentFps: Float?,
    currentFrameTimeMs: Float?,
    currentJankFrames: Int?,
    currentMemoryMb: Float?,
    currentTouchLatencyMs: Float?,
    onNavigateToScreen: (String) -> Unit = {},
    onNavigateToTest: (String) -> Unit = {},
    dataSourceMode: DataSourceMode = DataSourceMode.Fake,
    clientProvider: (() -> AutoMobileClient)? = null,
    observationStreamClient: ObservationStreamClient? = null,
    modifier: Modifier = Modifier,
) {
    VerticalCollapsibleTab(
        title = "Performance",
        isCollapsed = isCollapsed,
        onToggle = onToggle,
        widthPx = widthPx,
        onWidthChange = onWidthChange,
        resizeHandleOnLeft = true,
        collapsedContent = {
            PerformanceSummary(
                currentFps = currentFps,
                currentFrameTimeMs = currentFrameTimeMs,
                currentJankFrames = currentJankFrames,
                currentMemoryMb = currentMemoryMb,
                currentTouchLatencyMs = currentTouchLatencyMs,
            )
        },
    ) {
        Column(modifier = modifier.fillMaxSize()) {
            PanelHeader(
                title = "Performance",
                onCollapse = onToggle,
            )
            PerformanceDashboard(
                onNavigateToScreen = onNavigateToScreen,
                onNavigateToTest = onNavigateToTest,
                dataSourceMode = dataSourceMode,
                clientProvider = clientProvider,
                observationStreamClient = observationStreamClient,
            )
        }
    }
}
