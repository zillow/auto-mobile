package dev.jasonpearson.automobile.desktop.core.tabs

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * Horizontal tab representing a bottom panel option.
 */
data class HorizontalTab(
    val id: String,
    val title: String,
    val icon: String,
)

/**
 * Simple horizontal tab bar for bottom panels (no drag-and-drop).
 * Progressively hides text labels starting from rightmost tab as width decreases.
 */
@Composable
fun HorizontalTabBar(
    tabs: List<HorizontalTab>,
    selectedTabId: String?,
    onTabSelected: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = SharedTheme.globalColors

    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.02f))
            .padding(horizontal = 8.dp, vertical = 4.dp),
    ) {
        // Calculate how many tabs can show text based on available width
        // Each tab with text needs ~100dp, icon-only needs ~40dp
        // Progressively hide text from rightmost tab first
        val availableWidth = maxWidth
        val tabsWithText = when {
            availableWidth >= 550.dp -> tabs.size      // All tabs show text
            availableWidth >= 450.dp -> tabs.size - 1  // Hide rightmost (Telemetry)
            availableWidth >= 360.dp -> tabs.size - 2  // Hide 2 rightmost (Diagnostics, Telemetry)
            availableWidth >= 280.dp -> tabs.size - 3  // Hide 3 rightmost (Storage, Diagnostics, Telemetry)
            else -> 0                                   // All icon-only
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            tabs.forEachIndexed { index, tab ->
                val isSelected = tab.id == selectedTabId
                val showText = index < tabsWithText

                Box(
                    modifier = Modifier
                        .background(
                            if (isSelected) colors.text.normal.copy(alpha = 0.1f) else Color.Transparent,
                            RoundedCornerShape(6.dp),
                        )
                        .clickable {
                            // Toggle selection - clicking selected tab deselects it
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
