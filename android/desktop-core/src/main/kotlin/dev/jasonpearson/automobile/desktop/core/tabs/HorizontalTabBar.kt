@file:OptIn(ExperimentalFoundationApi::class)

package dev.jasonpearson.automobile.desktop.core.tabs

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import androidx.compose.material3.Text
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme
import kotlin.math.roundToInt

/**
 * Horizontal tab representing a bottom panel option.
 */
data class HorizontalTab(
    val id: String,
    val title: String,
    val icon: String,
)

/**
 * Horizontal tab bar for bottom panels with drag-and-drop reordering.
 * Progressively hides text labels starting from rightmost tab as width decreases.
 */
@Composable
fun HorizontalTabBar(
    tabs: List<HorizontalTab>,
    selectedTabId: String?,
    onTabSelected: (String?) -> Unit,
    onTabsReordered: (List<HorizontalTab>) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val colors = SharedTheme.globalColors

    // Drag state
    var draggedTabId by remember { mutableStateOf<String?>(null) }
    var dragOffsetX by remember { mutableFloatStateOf(0f) }

    // Tab positions for hit-testing during drag
    val tabPositions = remember { mutableMapOf<String, Float>() }
    val tabWidths = remember { mutableMapOf<String, Float>() }

    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.02f))
            .padding(horizontal = 8.dp, vertical = 4.dp),
    ) {
        val availableWidth = maxWidth
        val tabsWithText = when {
            availableWidth >= 550.dp -> tabs.size
            availableWidth >= 450.dp -> tabs.size - 1
            availableWidth >= 360.dp -> tabs.size - 2
            availableWidth >= 280.dp -> tabs.size - 3
            else -> 0
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            tabs.forEachIndexed { index, tab ->
                val isSelected = tab.id == selectedTabId
                val showText = index < tabsWithText
                val isDragged = tab.id == draggedTabId

                Box(
                    modifier = Modifier
                        .then(if (isDragged) Modifier.zIndex(1f) else Modifier)
                        .then(
                            if (isDragged) Modifier.offset { IntOffset(dragOffsetX.roundToInt(), 0) }
                            else Modifier
                        )
                        .onGloballyPositioned { coordinates ->
                            tabPositions[tab.id] = coordinates.positionInParent().x
                            tabWidths[tab.id] = coordinates.size.width.toFloat()
                        }
                        .background(
                            when {
                                isDragged -> colors.text.normal.copy(alpha = 0.15f)
                                isSelected -> colors.text.normal.copy(alpha = 0.1f)
                                else -> Color.Transparent
                            },
                            RoundedCornerShape(6.dp),
                        )
                        .pointerInput(tab.id) {
                            detectDragGestures(
                                onDragStart = {
                                    draggedTabId = tab.id
                                    dragOffsetX = 0f
                                },
                                onDrag = { change, dragAmount ->
                                    change.consume()
                                    dragOffsetX += dragAmount.x

                                    // Determine if we should swap with a neighbor
                                    val currentPos = (tabPositions[tab.id] ?: 0f) + dragOffsetX
                                    val currentWidth = tabWidths[tab.id] ?: 0f
                                    val currentCenter = currentPos + currentWidth / 2

                                    val currentIndex = tabs.indexOfFirst { it.id == tab.id }
                                    if (currentIndex < 0) return@detectDragGestures

                                    // Check swap with right neighbor
                                    if (currentIndex < tabs.size - 1) {
                                        val rightTab = tabs[currentIndex + 1]
                                        val rightPos = tabPositions[rightTab.id] ?: 0f
                                        val rightWidth = tabWidths[rightTab.id] ?: 0f
                                        val rightCenter = rightPos + rightWidth / 2
                                        if (currentCenter > rightCenter) {
                                            val newTabs = tabs.toMutableList()
                                            newTabs[currentIndex] = rightTab
                                            newTabs[currentIndex + 1] = tab
                                            onTabsReordered(newTabs)
                                            dragOffsetX = 0f
                                        }
                                    }
                                    // Check swap with left neighbor
                                    if (currentIndex > 0) {
                                        val leftTab = tabs[currentIndex - 1]
                                        val leftPos = tabPositions[leftTab.id] ?: 0f
                                        val leftWidth = tabWidths[leftTab.id] ?: 0f
                                        val leftCenter = leftPos + leftWidth / 2
                                        if (currentCenter < leftCenter) {
                                            val newTabs = tabs.toMutableList()
                                            newTabs[currentIndex] = leftTab
                                            newTabs[currentIndex - 1] = tab
                                            onTabsReordered(newTabs)
                                            dragOffsetX = 0f
                                        }
                                    }
                                },
                                onDragEnd = {
                                    draggedTabId = null
                                    dragOffsetX = 0f
                                },
                                onDragCancel = {
                                    draggedTabId = null
                                    dragOffsetX = 0f
                                },
                            )
                        }
                        .clickable {
                            onTabSelected(if (isSelected) null else tab.id)
                        }
                        .pointerHoverIcon(PointerIcon.Hand)
                        .padding(horizontal = if (showText) 12.dp else 8.dp, vertical = 6.dp),
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(tab.icon, fontSize = 12.sp)
                        if (showText) {
                            Text(
                                tab.title,
                                fontSize = 11.sp,
                                maxLines = 1,
                                softWrap = false,
                                color = if (isSelected) colors.text.normal else colors.text.normal.copy(alpha = 0.6f),
                            )
                        }
                    }
                }
            }
        }
    }
}
