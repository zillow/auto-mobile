package dev.jasonpearson.automobile.desktop.core.shell

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Utilities for macOS native title bar integration.
 *
 * Call [configure] before the `application {}` block in Main.kt to enable
 * a transparent, blended title bar with the traffic-light buttons overlaying content.
 */
object MacOSTitleBarConfig {
    val isMacOS: Boolean = DesktopPlatform.current == DesktopPlatform.MacOS

    /**
     * Sets AWT system properties for a transparent title bar on macOS.
     * No-op on other platforms.
     */
    fun configure() {
        if (!isMacOS) return
        System.setProperty("apple.awt.fullWindowContent", "true")
        System.setProperty("apple.awt.transparentTitleBar", "true")
    }
}

/**
 * Adds top padding so content doesn't render behind the native macOS title bar
 * traffic-light buttons (28 dp). No-op on other platforms.
 */
@Composable
fun MacOSTitleBarSpacer(modifier: Modifier = Modifier) {
    val height = if (MacOSTitleBarConfig.isMacOS) 28.dp else 0.dp
    if (height > 0.dp) {
        Spacer(modifier = modifier.height(height))
    }
}
