package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.rememberWindowState
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * Header bar for the right inspector pane with an optional "pop out" button.
 * When clicked, the parent should set the detached flag to open a separate window.
 */
@Composable
fun InspectorPaneHeader(
    title: String,
    isDetached: Boolean,
    onDetachToggle: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = SharedTheme.globalColors

    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(colors.panelBackground)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, fontSize = 12.sp, color = colors.text.normal)

        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Pop-out / dock button
            Text(
                text = if (isDetached) "\u2B73" else "\u2197",  // down-arrow or up-right arrow
                fontSize = 14.sp,
                color = colors.text.normal.copy(alpha = 0.6f),
                modifier = Modifier
                    .clickable(onClick = onDetachToggle)
                    .pointerHoverIcon(PointerIcon.Hand)
                    .background(colors.text.normal.copy(alpha = 0.06f), RoundedCornerShape(3.dp))
                    .padding(horizontal = 4.dp, vertical = 2.dp),
            )
            // Close button
            Text(
                "\u00D7",
                fontSize = 14.sp,
                color = colors.text.normal.copy(alpha = 0.5f),
                modifier = Modifier
                    .clickable(onClick = onClose)
                    .pointerHoverIcon(PointerIcon.Hand)
                    .padding(horizontal = 2.dp),
            )
        }
    }
}

/**
 * Opens the inspector content in a standalone Compose Desktop window.
 * When the user closes the detached window, [onReattach] is called to
 * return the content to the right pane.
 */
@Composable
fun DetachedInspectorWindow(
    title: String,
    onReattach: () -> Unit,
    content: @Composable () -> Unit,
) {
    val windowState = rememberWindowState(width = 400.dp, height = 600.dp)

    Window(
        onCloseRequest = onReattach,
        title = title,
        state = windowState,
    ) {
        val colors = SharedTheme.globalColors
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(colors.panelBackground),
        ) {
            content()
        }
    }
}
