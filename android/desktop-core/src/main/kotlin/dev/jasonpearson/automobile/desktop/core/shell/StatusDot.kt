package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

private val connectedColor = Color(0xFF4CAF50)
private val disconnectedColor = Color(0xFFE53935)

/**
 * Small colored circle indicating connected (green) or disconnected (red) state.
 */
@Composable
fun StatusDot(connected: Boolean, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(8.dp)
            .clip(CircleShape)
            .background(if (connected) connectedColor else disconnectedColor),
    )
}
