package dev.jasonpearson.automobile.ide.tabs

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.Text

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
 */
@Composable
fun HorizontalTabBar(
    tabs: List<HorizontalTab>,
    selectedTabId: String?,
    onTabSelected: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = JewelTheme.globalColors

    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(colors.text.normal.copy(alpha = 0.02f))
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        tabs.forEach { tab ->
            val isSelected = tab.id == selectedTabId

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
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(tab.icon, fontSize = 12.sp)
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
