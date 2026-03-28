package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import dev.jasonpearson.automobile.desktop.core.navigation.ScreenshotLoader
import dev.jasonpearson.automobile.desktop.core.telemetry.TelemetryDetailPanel
import dev.jasonpearson.automobile.desktop.core.telemetry.TelemetryDisplayEvent
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * Renders full detail for a selected telemetry event by delegating
 * to [TelemetryDetailPanel].
 */
@Composable
fun EventInspectorContent(
    event: TelemetryDisplayEvent,
    onClose: () -> Unit,
    onOpenSource: ((String, Int, String) -> Unit)? = null,
    screenshotLoader: ScreenshotLoader? = null,
    modifier: Modifier = Modifier,
) {
    val timeFormat = remember { SimpleDateFormat("HH:mm:ss.SSS", Locale.US) }
    val textColor = SharedTheme.globalColors.text.normal

    TelemetryDetailPanel(
        event = event,
        timeFormat = timeFormat,
        textColor = textColor,
        onClose = onClose,
        onOpenSource = onOpenSource,
        screenshotLoader = screenshotLoader,
        modifier = modifier,
    )
}
