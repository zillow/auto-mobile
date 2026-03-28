package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import dev.jasonpearson.automobile.desktop.core.navigation.ScreenshotLoader
import dev.jasonpearson.automobile.desktop.core.telemetry.TelemetryDisplayEvent
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * Top-level right inspector pane that switches between an empty placeholder
 * and the event detail view based on the current selection.
 */
@Composable
fun RightInspectorPanel(
    selectedEvent: TelemetryDisplayEvent?,
    onClose: () -> Unit,
    onOpenSource: ((String, Int, String) -> Unit)? = null,
    screenshotLoader: ScreenshotLoader? = null,
    modifier: Modifier = Modifier,
) {
    val panelModifier = modifier
        .fillMaxSize()
        .background(SharedTheme.globalColors.panelBackground)

    if (selectedEvent == null) {
        InspectorEmptyState(modifier = panelModifier)
    } else {
        EventInspectorContent(
            event = selectedEvent,
            onClose = onClose,
            onOpenSource = onOpenSource,
            screenshotLoader = screenshotLoader,
            modifier = panelModifier,
        )
    }
}
