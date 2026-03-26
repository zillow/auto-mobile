package dev.jasonpearson.automobile.desktop.core.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color

/**
 * Compatibility layer that maps MaterialTheme colors to a structure matching the Jewel
 * globalColors API surface used throughout the shared dashboards.
 *
 * This lets both the IDE plugin (via Jewel theme) and the desktop app (via Material3 theme)
 * provide colors through a single abstraction.
 */
data class SharedTextColors(
    val normal: Color,
    val info: Color,
    val error: Color,
    val warning: Color,
)

data class SharedOutlineColors(
    val focused: Color,
)

data class SharedGlobalColors(
    val text: SharedTextColors,
    val outlines: SharedOutlineColors,
    val panelBackground: Color,
)

object SharedTheme {
  val globalColors: SharedGlobalColors
    @Composable @ReadOnlyComposable
    get() =
        SharedGlobalColors(
            text =
                SharedTextColors(
                    normal = MaterialTheme.colorScheme.onSurface,
                    info = MaterialTheme.colorScheme.primary,
                    error = MaterialTheme.colorScheme.error,
                    warning = MaterialTheme.colorScheme.tertiary,
                ),
            outlines =
                SharedOutlineColors(
                    focused = MaterialTheme.colorScheme.primary,
                ),
            panelBackground = MaterialTheme.colorScheme.surface,
        )
}
