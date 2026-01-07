package com.automobile.ide.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.options.SearchableConfigurable
import javax.swing.JComponent
import org.jetbrains.jewel.bridge.JewelComposePanel
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.Text

class AutoMobileSettingsConfigurable : SearchableConfigurable, Configurable.NoScroll {
  override fun getId(): String = "automobile.settings"

  override fun getDisplayName(): String = "AutoMobile"

  override fun createComponent(): JComponent = JewelComposePanel { AutoMobileSettingsContent() }

  override fun isModified(): Boolean = false

  override fun apply() {
    // Settings are applied immediately in child panels.
  }
}

@Composable
private fun AutoMobileSettingsContent() {
  val colors = JewelTheme.globalColors
  Column(
      modifier = Modifier.fillMaxSize().padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    Text("AutoMobile settings")
    Text(
        "Use Feature Flags to toggle experimental behavior and diagnostics.",
        color = colors.text.normal.copy(alpha = 0.7f),
    )
    Text(
        "Changes apply immediately and are shared across all projects.",
        color = colors.text.normal.copy(alpha = 0.7f),
    )
  }
}
