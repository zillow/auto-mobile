package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

enum class DesktopPlatform {
    MacOS,
    Windows,
    Linux;

    companion object {
        val current: DesktopPlatform by lazy {
            val os = System.getProperty("os.name")?.lowercase() ?: ""
            when {
                os.contains("mac") -> MacOS
                os.contains("win") -> Windows
                else -> Linux
            }
        }
    }
}

data class PlatformThemeValues(
    val dividerThickness: Dp,
    val cornerRadius: Dp,
    val sidebarBackground: Color,
    val titleBarHeight: Dp,
)

object PlatformTheme {
    val values: PlatformThemeValues
        @Composable @ReadOnlyComposable
        get() {
            val panelBg = SharedTheme.globalColors.panelBackground
            return when (DesktopPlatform.current) {
                DesktopPlatform.MacOS -> PlatformThemeValues(
                    dividerThickness = 1.dp,
                    cornerRadius = 6.dp,
                    sidebarBackground = panelBg.copy(alpha = 0.85f),
                    titleBarHeight = 28.dp,
                )
                DesktopPlatform.Windows -> PlatformThemeValues(
                    dividerThickness = 2.dp,
                    cornerRadius = 2.dp,
                    sidebarBackground = panelBg,
                    titleBarHeight = 0.dp,
                )
                DesktopPlatform.Linux -> PlatformThemeValues(
                    dividerThickness = 1.dp,
                    cornerRadius = 4.dp,
                    sidebarBackground = panelBg,
                    titleBarHeight = 0.dp,
                )
            }
        }
}
