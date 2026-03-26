package dev.jasonpearson.automobile.desktop.core.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * Shared search bar component used in View Hierarchy and Telemetry dashboards.
 */
@Composable
fun SearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    placeholder: String = "Search...",
    modifier: Modifier = Modifier,
) {
    val colors = SharedTheme.globalColors

    Row(
        modifier = modifier
            .height(28.dp)
            .background(colors.text.normal.copy(alpha = 0.05f), RoundedCornerShape(4.dp))
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "\uD83D\uDD0D", // 🔍
            fontSize = 12.sp,
            color = colors.text.normal.copy(alpha = 0.4f),
        )
        Spacer(Modifier.width(6.dp))
        BasicTextField(
            value = query,
            onValueChange = onQueryChange,
            textStyle = TextStyle(
                fontSize = 12.sp,
                color = colors.text.normal,
            ),
            cursorBrush = SolidColor(colors.text.normal),
            singleLine = true,
            modifier = Modifier.weight(1f),
            decorationBox = { innerTextField ->
                Box {
                    if (query.isEmpty()) {
                        Text(
                            placeholder,
                            fontSize = 12.sp,
                            color = colors.text.normal.copy(alpha = 0.4f),
                        )
                    }
                    innerTextField()
                }
            }
        )
        if (query.isNotEmpty()) {
            Text(
                "\u2715", // ✕
                fontSize = 10.sp,
                color = colors.text.normal.copy(alpha = 0.5f),
                modifier = Modifier
                    .clickable { onQueryChange("") }
                    .pointerHoverIcon(PointerIcon.Hand)
                    .padding(4.dp),
            )
        }
    }
}
