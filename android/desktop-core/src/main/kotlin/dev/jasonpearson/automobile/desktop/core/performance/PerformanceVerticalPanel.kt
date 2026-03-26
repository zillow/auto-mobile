package dev.jasonpearson.automobile.desktop.core.performance

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import dev.jasonpearson.automobile.desktop.core.daemon.AutoMobileClient
import dev.jasonpearson.automobile.desktop.core.daemon.ObservationStreamClient
import dev.jasonpearson.automobile.desktop.core.datasource.DataSourceMode
import dev.jasonpearson.automobile.desktop.core.tabs.PanelHeader
import dev.jasonpearson.automobile.desktop.core.tabs.VerticalCollapsibleTab

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
    currentRecompositionRate: Float? = null,
    updateCounter: Int = 0,
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
                currentRecompositionRate = currentRecompositionRate,
                updateCounter = updateCounter,
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
                initialFps = currentFps,
                initialFrameTimeMs = currentFrameTimeMs,
                initialJankFrames = currentJankFrames,
                initialMemoryMb = currentMemoryMb,
                initialTouchLatencyMs = currentTouchLatencyMs,
                initialRecompositionRate = currentRecompositionRate,
            )
        }
    }
}
