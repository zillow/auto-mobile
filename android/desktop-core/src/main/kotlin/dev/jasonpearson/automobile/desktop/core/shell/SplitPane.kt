package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * A horizontal split pane with a draggable vertical divider between two content slots.
 *
 * @param first Content for the left pane.
 * @param second Content for the right pane.
 * @param firstPaneFraction Initial fraction of total width allocated to the first pane.
 * @param minFirstDp Minimum width of the first pane.
 * @param minSecondDp Minimum width of the second pane.
 * @param onFractionChanged Called when the user drags the divider, for persistence.
 * @param dividerWidth Width of the visible divider line.
 * @param dragHandleWidth Width of the invisible drag target area (centered on the divider).
 */
@Composable
fun HorizontalSplitPane(
    first: @Composable () -> Unit,
    second: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    firstPaneFraction: Float = 0.25f,
    minFirstDp: Dp = 100.dp,
    minSecondDp: Dp = 100.dp,
    onFractionChanged: ((Float) -> Unit)? = null,
    dividerWidth: Dp = 1.dp,
    dragHandleWidth: Dp = 8.dp,
) {
    val currentDensity by rememberUpdatedState(LocalDensity.current)
    val currentOnFractionChanged by rememberUpdatedState(onFractionChanged)
    var fraction by remember { mutableStateOf(firstPaneFraction) }
    var totalWidthPx by remember { mutableStateOf(0) }
    var isDragging by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val isHovered by interactionSource.collectIsHoveredAsState()

    LaunchedEffect(firstPaneFraction) {
        fraction = firstPaneFraction
    }

    val colors = SharedTheme.globalColors
    val dividerColor = if (isHovered || isDragging) {
        colors.text.normal.copy(alpha = 0.3f)
    } else {
        colors.text.normal.copy(alpha = 0.15f)
    }

    Row(
        modifier = modifier
            .fillMaxSize()
            .onSizeChanged { totalWidthPx = it.width },
    ) {
        Box(
            modifier = Modifier
                .weight(fraction.coerceIn(0.01f, 0.99f))
                .fillMaxHeight(),
        ) {
            first()
        }

        Box(
            modifier = Modifier
                .width(dragHandleWidth)
                .fillMaxHeight()
                .hoverable(interactionSource)
                .pointerHoverIcon(PointerIcon.Hand)
                .pointerInput(minFirstDp, minSecondDp, dragHandleWidth) {
                    detectDragGestures(
                        onDragStart = { isDragging = true },
                        onDragEnd = { isDragging = false },
                        onDragCancel = { isDragging = false },
                        onDrag = { change, dragAmount ->
                            change.consume()
                            if (totalWidthPx > 0) {
                                val minFirstPx = with(currentDensity) { minFirstDp.toPx() }
                                val minSecondPx = with(currentDensity) { minSecondDp.toPx() }
                                val handlePx = with(currentDensity) { dragHandleWidth.toPx() }
                                val usable = (totalWidthPx - handlePx)
                                    .coerceAtLeast(minFirstPx + minSecondPx)
                                if (usable <= 0f) return@detectDragGestures
                                val newFirstPx = (fraction * usable + dragAmount.x)
                                    .coerceIn(minFirstPx, (usable - minSecondPx).coerceAtLeast(minFirstPx))
                                val newFraction = (newFirstPx / usable)
                                    .coerceIn(0.01f, 0.99f)
                                fraction = newFraction
                                currentOnFractionChanged?.invoke(newFraction)
                            }
                        },
                    )
                },
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .width(dividerWidth)
                    .fillMaxHeight()
                    .background(dividerColor),
            )
        }

        Box(
            modifier = Modifier
                .weight((1f - fraction).coerceIn(0.01f, 0.99f))
                .fillMaxHeight(),
        ) {
            second()
        }
    }
}

/**
 * A vertical split pane with a draggable horizontal divider between two content slots.
 *
 * @param first Content for the top pane.
 * @param second Content for the bottom pane.
 * @param firstPaneFraction Initial fraction of total height allocated to the first pane.
 * @param minFirstDp Minimum height of the first pane.
 * @param minSecondDp Minimum height of the second pane.
 * @param onFractionChanged Called when the user drags the divider, for persistence.
 * @param dividerWidth Height of the visible divider line.
 * @param dragHandleWidth Height of the invisible drag target area (centered on the divider).
 */
@Composable
fun VerticalSplitPane(
    first: @Composable () -> Unit,
    second: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    firstPaneFraction: Float = 0.25f,
    minFirstDp: Dp = 100.dp,
    minSecondDp: Dp = 100.dp,
    onFractionChanged: ((Float) -> Unit)? = null,
    dividerWidth: Dp = 1.dp,
    dragHandleWidth: Dp = 8.dp,
) {
    val currentDensity by rememberUpdatedState(LocalDensity.current)
    val currentOnFractionChanged by rememberUpdatedState(onFractionChanged)
    var fraction by remember { mutableStateOf(firstPaneFraction) }
    var totalHeightPx by remember { mutableStateOf(0) }
    var isDragging by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val isHovered by interactionSource.collectIsHoveredAsState()

    LaunchedEffect(firstPaneFraction) {
        fraction = firstPaneFraction
    }

    val colors = SharedTheme.globalColors
    val dividerColor = if (isHovered || isDragging) {
        colors.text.normal.copy(alpha = 0.3f)
    } else {
        colors.text.normal.copy(alpha = 0.15f)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .onSizeChanged { totalHeightPx = it.height },
    ) {
        Box(
            modifier = Modifier
                .weight(fraction.coerceIn(0.01f, 0.99f))
                .fillMaxWidth(),
        ) {
            first()
        }

        Box(
            modifier = Modifier
                .height(dragHandleWidth)
                .fillMaxWidth()
                .hoverable(interactionSource)
                .pointerHoverIcon(PointerIcon.Hand)
                .pointerInput(minFirstDp, minSecondDp, dragHandleWidth) {
                    detectDragGestures(
                        onDragStart = { isDragging = true },
                        onDragEnd = { isDragging = false },
                        onDragCancel = { isDragging = false },
                        onDrag = { change, dragAmount ->
                            change.consume()
                            if (totalHeightPx > 0) {
                                val minFirstPx = with(currentDensity) { minFirstDp.toPx() }
                                val minSecondPx = with(currentDensity) { minSecondDp.toPx() }
                                val handlePx = with(currentDensity) { dragHandleWidth.toPx() }
                                val usable = (totalHeightPx - handlePx)
                                    .coerceAtLeast(minFirstPx + minSecondPx)
                                if (usable <= 0f) return@detectDragGestures
                                val newFirstPx = (fraction * usable + dragAmount.y)
                                    .coerceIn(minFirstPx, (usable - minSecondPx).coerceAtLeast(minFirstPx))
                                val newFraction = (newFirstPx / usable)
                                    .coerceIn(0.01f, 0.99f)
                                fraction = newFraction
                                currentOnFractionChanged?.invoke(newFraction)
                            }
                        },
                    )
                },
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .height(dividerWidth)
                    .fillMaxWidth()
                    .background(dividerColor),
            )
        }

        Box(
            modifier = Modifier
                .weight((1f - fraction).coerceIn(0.01f, 0.99f))
                .fillMaxWidth(),
        ) {
            second()
        }
    }
}
