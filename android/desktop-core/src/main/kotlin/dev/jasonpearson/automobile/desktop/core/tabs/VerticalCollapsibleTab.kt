package dev.jasonpearson.automobile.desktop.core.tabs

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.ui.layout.layout
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * A vertical collapsible panel that can show custom content when collapsed (e.g., badges, metrics).
 * When expanded, it shows a resizable panel with the main content.
 */
@Composable
fun VerticalCollapsibleTab(
    title: String,
    isCollapsed: Boolean,
    onToggle: () -> Unit,
    widthPx: Float,
    onWidthChange: (Float) -> Unit,
    resizeHandleOnLeft: Boolean = true,
    collapsedContent: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val colors = SharedTheme.globalColors
    val density = LocalDensity.current

    if (isCollapsed) {
        // Collapsed state: vertical tab aligned to top with optional content below
        Row(
            modifier = Modifier
                .width(28.dp)  // 24dp + 4dp padding
                .fillMaxHeight()
                .clickable(onClick = onToggle)
                .pointerHoverIcon(PointerIcon.Hand),
        ) {
            // Left edge indicator (2dp lighter color)
            Box(
                modifier = Modifier
                    .width(2.dp)
                    .fillMaxHeight()
                    .background(colors.text.normal.copy(alpha = 0.08f)),
            )
            // Main collapsed bar content with left padding
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .background(colors.text.normal.copy(alpha = 0.03f))
                    .padding(start = 4.dp),
            ) {
                Column(
                    modifier = Modifier.fillMaxHeight(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                // Rotated title text positioned at top
                // Use layout modifier to swap width/height for proper measurement of rotated text
                Text(
                    title,
                    fontSize = 11.sp,
                    color = colors.text.normal.copy(alpha = 0.6f),
                    modifier = Modifier
                        .padding(top = 12.dp)
                        .layout { measurable, constraints ->
                            // Measure with swapped constraints (width becomes height limit)
                            val placeable = measurable.measure(
                                constraints.copy(
                                    minWidth = 0,
                                    maxWidth = constraints.maxHeight,
                                    minHeight = 0,
                                    maxHeight = constraints.maxWidth,
                                )
                            )
                            // Layout with swapped dimensions
                            layout(placeable.height, placeable.width) {
                                // Place rotated: offset to account for rotation pivot
                                placeable.place(
                                    x = -(placeable.width - placeable.height) / 2,
                                    y = (placeable.width - placeable.height) / 2,
                                )
                            }
                        }
                        .rotate(-90f),
                )

                    // Custom collapsed content (badges, metrics, etc.)
                    if (collapsedContent != null) {
                        Box(
                            modifier = Modifier.padding(top = 8.dp),
                            contentAlignment = Alignment.TopCenter,
                        ) {
                            collapsedContent()
                        }
                    }
                }
            }
        }
    } else {
        // Expanded state: panel with resize handle
        Row(
            modifier = Modifier
                .width(with(density) { widthPx.toDp() })
                .fillMaxHeight(),
        ) {
            if (resizeHandleOnLeft) {
                ResizeHandle(
                    onDrag = { delta -> onWidthChange(delta) },
                )
            }

            Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                content()
            }

            if (!resizeHandleOnLeft) {
                ResizeHandle(
                    onDrag = { delta -> onWidthChange(-delta) },
                )
            }
        }
    }
}

@Composable
fun ResizeHandle(
    onDrag: (Float) -> Unit,
) {
    val colors = SharedTheme.globalColors
    var isDragging by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .width(4.dp)
            .fillMaxHeight()
            .background(
                if (isDragging) colors.text.normal.copy(alpha = 0.3f)
                else colors.text.normal.copy(alpha = 0.1f)
            )
            .pointerHoverIcon(PointerIcon.Crosshair)
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = { isDragging = true },
                    onDragEnd = { isDragging = false },
                    onDragCancel = { isDragging = false },
                    onDrag = { change, dragAmount ->
                        change.consume()
                        onDrag(dragAmount.x)
                    }
                )
            },
    )
}

@Composable
fun PanelHeader(
    title: String,
    onCollapse: (() -> Unit)? = null,
) {
    val colors = SharedTheme.globalColors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.03f))
            .padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            fontSize = 11.sp,
            color = colors.text.normal.copy(alpha = 0.7f),
        )

        if (onCollapse != null) {
            Text(
                "«",
                fontSize = 12.sp,
                color = colors.text.normal.copy(alpha = 0.4f),
                modifier = Modifier
                    .clickable(onClick = onCollapse)
                    .pointerHoverIcon(PointerIcon.Hand)
                    .padding(horizontal = 4.dp),
            )
        }
    }

}
