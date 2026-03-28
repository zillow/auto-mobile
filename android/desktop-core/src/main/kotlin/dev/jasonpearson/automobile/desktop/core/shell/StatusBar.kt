package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * Thin horizontal status bar showing failure counts, performance health, and connection status.
 */
@Composable
fun StatusBar(
    crashCount: Int,
    anrCount: Int,
    nonFatalCount: Int,
    toolFailureCount: Int,
    currentFps: Float?,
    currentMemoryMb: Float?,
    isDaemonConnected: Boolean,
    isStreamConnected: Boolean,
    modifier: Modifier = Modifier,
) {
    val colors = SharedTheme.globalColors
    val borderColor = colors.text.normal.copy(alpha = 0.15f)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(24.dp)
            .drawBehind {
                drawLine(
                    color = borderColor,
                    start = Offset(0f, 0f),
                    end = Offset(size.width, 0f),
                    strokeWidth = 1f,
                )
            }
            .background(colors.panelBackground.darken(0.05f))
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            StatusBarBadge(count = crashCount, label = "crash", color = Color(0xFFF44336))
            StatusBarBadge(count = anrCount, label = "ANR", color = Color(0xFFFF9800))
            StatusBarBadge(count = nonFatalCount, label = "non-fatal", color = Color(0xFFFFC107))
            StatusBarBadge(count = toolFailureCount, label = "tool", color = Color(0xFF9E9E9E))
        }

        Spacer(modifier = Modifier.weight(1f))

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (currentFps != null) {
                val fpsColor = when {
                    currentFps >= 55f -> Color(0xFF4CAF50)
                    currentFps >= 30f -> Color(0xFFFFC107)
                    else -> Color(0xFFF44336)
                }
                Text(
                    text = "${currentFps.toInt()} FPS",
                    fontSize = 10.sp,
                    color = fpsColor,
                    lineHeight = 10.sp,
                )
            }
            if (currentMemoryMb != null) {
                Text(
                    text = "${"%.0f".format(currentMemoryMb)} MB",
                    fontSize = 10.sp,
                    color = colors.text.normal.copy(alpha = 0.7f),
                    lineHeight = 10.sp,
                )
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ConnectionStatusIndicator(
                isConnected = isDaemonConnected,
                label = "Daemon",
            )
            ConnectionStatusIndicator(
                isConnected = isStreamConnected,
                label = "Stream",
            )
        }
    }
}

/** Darken a color by mixing it toward black by the given fraction. */
private fun Color.darken(fraction: Float): Color =
    Color(
        red = red * (1f - fraction),
        green = green * (1f - fraction),
        blue = blue * (1f - fraction),
        alpha = alpha,
    )
