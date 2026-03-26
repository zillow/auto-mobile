package dev.jasonpearson.automobile.desktop.core.failures

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import dev.jasonpearson.automobile.desktop.core.daemon.AutoMobileClient
import dev.jasonpearson.automobile.desktop.core.daemon.FailuresPushSocketClient
import dev.jasonpearson.automobile.desktop.core.datasource.DataSourceMode
import dev.jasonpearson.automobile.desktop.core.tabs.PanelHeader
import dev.jasonpearson.automobile.desktop.core.tabs.VerticalCollapsibleTab

/**
 * Vertical panel wrapper for FailuresDashboard with collapse support.
 * Shows a badge with failure count when collapsed.
 */
@Composable
fun FailuresVerticalPanel(
    isCollapsed: Boolean,
    onToggle: () -> Unit,
    widthPx: Float,
    onWidthChange: (Float) -> Unit,
    dateRangeLabel: String,
    crashCount: Int,
    anrCount: Int,
    toolFailureCount: Int,
    nonFatalCount: Int,
    onNavigateToScreen: (String) -> Unit = {},
    onNavigateToTest: (String) -> Unit = {},
    onNavigateToSource: (fileName: String, lineNumber: Int) -> Unit = { _, _ -> },
    onNewFailureNotification: ((FailureNotification) -> Unit)? = null,
    initialSelectedFailureId: String? = null,
    onFailureSelected: (() -> Unit)? = null,
    onDateRangeChanged: ((DateRange) -> Unit)? = null,
    onFailureCountsChanged: ((crashCount: Int, anrCount: Int, toolFailureCount: Int, nonFatalCount: Int) -> Unit)? = null,
    initialDateRange: DateRange = DateRange.TwentyFourHours,
    dataSourceMode: DataSourceMode = DataSourceMode.Fake,
    clientProvider: (() -> AutoMobileClient)? = null,
    streamingDataSource: StreamingFailuresDataSourceInterface? = null,
    failuresPushClient: FailuresPushSocketClient? = null,
    modifier: Modifier = Modifier,
) {
    VerticalCollapsibleTab(
        title = "Failures",
        isCollapsed = isCollapsed,
        onToggle = onToggle,
        widthPx = widthPx,
        onWidthChange = onWidthChange,
        resizeHandleOnLeft = true,
        collapsedContent = {
            FailuresCollapsedContent(
                dateRangeLabel = dateRangeLabel,
                crashCount = crashCount,
                anrCount = anrCount,
                toolFailureCount = toolFailureCount,
                nonFatalCount = nonFatalCount,
            )
        },
    ) {
        Column(modifier = modifier.fillMaxSize()) {
            PanelHeader(
                title = "Failures",
                onCollapse = onToggle,
            )
            FailuresDashboard(
                onNavigateToScreen = onNavigateToScreen,
                onNavigateToTest = onNavigateToTest,
                onNavigateToSource = onNavigateToSource,
                onNewFailureNotification = onNewFailureNotification,
                initialSelectedFailureId = initialSelectedFailureId,
                onFailureSelected = onFailureSelected,
                initialDateRange = initialDateRange,
                onDateRangeChanged = onDateRangeChanged,
                onFailureCountsChanged = onFailureCountsChanged,
                dataSourceMode = dataSourceMode,
                clientProvider = clientProvider,
                streamingDataSource = streamingDataSource,
                failuresPushClient = failuresPushClient,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}
