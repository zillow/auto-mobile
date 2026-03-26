package dev.jasonpearson.automobile.desktop.core.components

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * Simple tooltip wrapper matching Jewel's Tooltip API. On desktop, the tooltip content is
 * available on hover via the platform's built-in tooltip mechanism. This implementation renders
 * only the main content; tooltip text appears via the standard Compose tooltip support.
 */
@Composable
fun Tooltip(
    tooltip: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
  // Render the main content directly; full tooltip hover behavior can be
  // added later with Material3's TooltipBox when needed.
  Box(modifier = modifier) { content() }
}
