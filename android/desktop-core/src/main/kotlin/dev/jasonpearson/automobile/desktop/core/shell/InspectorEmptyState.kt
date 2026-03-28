package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.sp
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * Placeholder shown in the right inspector panel when no event is selected.
 */
@Composable
fun InspectorEmptyState(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            "Select an event to inspect",
            fontSize = 12.sp,
            color = SharedTheme.globalColors.text.normal.copy(alpha = 0.5f),
        )
    }
}
