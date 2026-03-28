package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * Three icon buttons for toggling the left sidebar, right inspector, and bottom timeline panes.
 * Matches the Xcode top-right pane toggle pattern.
 */
@Composable
fun PaneToggleToolbar(
    showLeftPane: Boolean,
    onToggleLeft: () -> Unit,
    showRightPane: Boolean,
    onToggleRight: () -> Unit,
    showBottomPane: Boolean,
    onToggleBottom: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PaneToggleButton(symbol = "\u25EB", selected = showLeftPane, onClick = onToggleLeft)
        PaneToggleButton(symbol = "\u2B13", selected = showBottomPane, onClick = onToggleBottom)
        PaneToggleButton(symbol = "\u25E8", selected = showRightPane, onClick = onToggleRight)
    }
}

@Composable
private fun PaneToggleButton(
    symbol: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val colors = SharedTheme.globalColors
    val interactionSource = remember { MutableInteractionSource() }
    val isHovered by interactionSource.collectIsHoveredAsState()

    val bgAlpha = when {
        selected -> 0.15f
        isHovered -> 0.1f
        else -> 0f
    }

    Box(
        modifier = Modifier
            .size(24.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(colors.text.normal.copy(alpha = bgAlpha))
            .hoverable(interactionSource)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            )
            .pointerHoverIcon(PointerIcon.Hand),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = symbol,
            fontSize = 14.sp,
            color = if (selected) {
                colors.text.info
            } else {
                colors.text.normal.copy(alpha = 0.6f)
            },
            lineHeight = 14.sp,
        )
    }
}
