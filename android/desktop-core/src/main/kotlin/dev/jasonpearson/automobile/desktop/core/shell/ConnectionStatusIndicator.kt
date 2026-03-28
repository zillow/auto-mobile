package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * Small colored dot indicating connection status with an optional label.
 */
@Composable
fun ConnectionStatusIndicator(
    isConnected: Boolean,
    isReconnecting: Boolean = false,
    label: String? = null,
    modifier: Modifier = Modifier,
) {
    val dotColor = when {
        isConnected -> Color(0xFF4CAF50) // green
        isReconnecting -> Color(0xFFFFC107) // yellow
        else -> Color(0xFFF44336) // red
    }
    val textColor = SharedTheme.globalColors.text.normal

    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(dotColor),
        )
        if (label != null) {
            Spacer(modifier = Modifier.width(3.dp))
            Text(
                text = label,
                fontSize = 10.sp,
                color = textColor.copy(alpha = 0.7f),
                lineHeight = 10.sp,
            )
        }
    }
}
