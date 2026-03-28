package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.window.FrameWindowScope

private const val APP_NAME = "AutoMobile"

/**
 * Dynamically updates the AWT window title to reflect the active device and foreground app.
 *
 * Formats:
 * - Both present: "AutoMobile — Pixel 8 API 35 — com.example.app"
 * - Device only:  "AutoMobile — Pixel 8 API 35"
 * - Neither:      "AutoMobile"
 *
 * Place this composable inside the [Window] content block (within a [FrameWindowScope]).
 */
@Composable
fun FrameWindowScope.WindowSubtitle(
    deviceName: String?,
    foregroundApp: String?,
) {
    val title = buildString {
        append(APP_NAME)
        if (!deviceName.isNullOrBlank()) {
            append(" \u2014 ")
            append(deviceName)
        }
        if (!foregroundApp.isNullOrBlank()) {
            append(" \u2014 ")
            append(foregroundApp)
        }
    }

    LaunchedEffect(title) {
        window.title = title
    }
}
