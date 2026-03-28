package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * Reusable collapsible section header with chevron, title, and an optional trailing slot.
 */
@Composable
fun CollapsibleSectionHeader(
    title: String,
    expanded: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
    trailing: @Composable (() -> Unit)? = null,
) {
    val colors = SharedTheme.globalColors

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable { onToggle() }
            .pointerHoverIcon(PointerIcon.Hand),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                if (expanded) "\u25BE" else "\u25B8",
                fontSize = 11.sp,
                color = colors.text.normal.copy(alpha = 0.5f),
            )
            Text(
                title,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = colors.text.normal,
                maxLines = 1,
                softWrap = false,
            )
        }
        trailing?.invoke()
    }
}
