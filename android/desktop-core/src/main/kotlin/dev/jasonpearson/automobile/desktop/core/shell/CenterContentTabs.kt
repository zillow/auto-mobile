package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * Identifies a center-pane tab type.
 */
enum class CenterTabType(val title: String, val icon: String) {
    Layout("Layout", "\uD83D\uDCD0"),
    Navigation("Navigation", "\uD83E\uDDED"),
    Telemetry("Telemetry", "\uD83D\uDCE1"),
    Diagnostics("Diagnostics", "\uD83E\uDE7A"),
}

/**
 * Tab strip rendered at the top of the center pane.
 * Each tab can be closed (except when only one remains), and a "+" button
 * allows opening additional tab types.
 */
@Composable
fun CenterTabStrip(
    openTabs: List<CenterTabType>,
    selectedTab: CenterTabType,
    onSelectTab: (CenterTabType) -> Unit,
    onCloseTab: (CenterTabType) -> Unit,
    onAddTab: (CenterTabType) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = SharedTheme.globalColors
    var showAddMenu by remember { mutableStateOf(false) }

    Row(
        modifier = modifier
            .background(colors.panelBackground)
            .padding(horizontal = 4.dp, vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        openTabs.forEach { tab ->
            val isSelected = tab == selectedTab
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(
                        if (isSelected) colors.text.normal.copy(alpha = 0.1f)
                        else Color.Transparent,
                    )
                    .clickable { onSelectTab(tab) }
                    .pointerHoverIcon(PointerIcon.Hand)
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(tab.icon, fontSize = 11.sp)
                Text(
                    tab.title,
                    fontSize = 11.sp,
                    color = if (isSelected) colors.text.normal else colors.text.normal.copy(alpha = 0.6f),
                )
                // Close button (only if more than one tab open)
                if (openTabs.size > 1) {
                    Text(
                        "\u00D7",
                        fontSize = 12.sp,
                        color = colors.text.normal.copy(alpha = 0.4f),
                        modifier = Modifier
                            .clickable { onCloseTab(tab) }
                            .pointerHoverIcon(PointerIcon.Hand)
                            .padding(start = 2.dp),
                    )
                }
            }
        }

        // "+" button to add new tab types
        Box {
            Text(
                "+",
                fontSize = 13.sp,
                color = colors.text.normal.copy(alpha = 0.5f),
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .clickable { showAddMenu = !showAddMenu }
                    .pointerHoverIcon(PointerIcon.Hand)
                    .padding(horizontal = 6.dp, vertical = 4.dp),
            )
            if (showAddMenu) {
                AddTabMenu(
                    openTabs = openTabs,
                    onAdd = { tab ->
                        onAddTab(tab)
                        showAddMenu = false
                    },
                    onDismiss = { showAddMenu = false },
                )
            }
        }
    }
}

/**
 * Dropdown menu listing tab types not yet open.
 */
@Composable
private fun AddTabMenu(
    openTabs: List<CenterTabType>,
    onAdd: (CenterTabType) -> Unit,
    onDismiss: () -> Unit,
) {
    val colors = SharedTheme.globalColors
    val available = CenterTabType.entries.filter { it !in openTabs }

    if (available.isEmpty()) {
        LaunchedEffect(Unit) { onDismiss() }
        return
    }

    Box(
        modifier = Modifier
            .padding(top = 24.dp)
            .background(colors.panelBackground, RoundedCornerShape(4.dp))
            .padding(4.dp),
    ) {
        androidx.compose.foundation.layout.Column {
            available.forEach { tab ->
                Text(
                    "${tab.icon} ${tab.title}",
                    fontSize = 11.sp,
                    color = colors.text.normal,
                    modifier = Modifier
                        .clickable { onAdd(tab) }
                        .pointerHoverIcon(PointerIcon.Hand)
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
        }
    }
}
