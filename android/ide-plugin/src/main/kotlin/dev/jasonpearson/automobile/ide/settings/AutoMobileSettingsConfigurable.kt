package dev.jasonpearson.automobile.ide.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.options.SearchableConfigurable
import dev.jasonpearson.automobile.ide.LabeledTextField
import javax.swing.JComponent
import org.jetbrains.jewel.bridge.JewelComposePanel
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.CheckboxRow
import org.jetbrains.jewel.ui.component.Text

class AutoMobileSettingsConfigurable : SearchableConfigurable, Configurable.NoScroll {
  private var modified = false

  override fun getId(): String = "automobile.settings"

  override fun getDisplayName(): String = "AutoMobile"

  override fun createComponent(): JComponent = JewelComposePanel { AutoMobileSettingsContent { modified = true } }

  override fun isModified(): Boolean = modified

  override fun apply() {
    modified = false
  }

  override fun reset() {
    modified = false
  }
}

@Composable
private fun AutoMobileSettingsContent(onModified: () -> Unit) {
  val colors = JewelTheme.globalColors
  val settings = AutoMobileSettings.getInstance()
  var enableYamlLinting by remember { mutableStateOf(settings.enableYamlLinting) }
  val outputDirectoryState = rememberTextFieldState(settings.testPlanOutputDirectory)
  val outputDirectoryValue = outputDirectoryState.text.toString()

  LaunchedEffect(outputDirectoryValue) {
    if (outputDirectoryValue != settings.testPlanOutputDirectory) {
      settings.testPlanOutputDirectory = outputDirectoryValue
      onModified()
    }
  }

  Column(
      modifier = Modifier.fillMaxSize().padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
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

    Column(
        modifier = Modifier.padding(top = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Text("Test Plan Authoring", fontSize = 14.sp)
      CheckboxRow(
          text = "Enable YAML validation for test plans",
          checked = enableYamlLinting,
          onCheckedChange = { enabled ->
            enableYamlLinting = enabled
            settings.enableYamlLinting = enabled
            onModified()
          },
      )
      Text(
          "Validates test plan YAML files against the schema for immediate feedback on errors and deprecated fields.",
          color = colors.text.normal.copy(alpha = 0.7f),
          fontSize = 12.sp,
          modifier = Modifier.padding(start = 28.dp),
      )
    }

    Column(
        modifier = Modifier.padding(top = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Text("Recording", fontSize = 14.sp)
      LabeledTextField(
          label = "Test plan output directory (relative to project root or absolute)",
          state = outputDirectoryState,
      )
      Text(
          "New recordings are saved here and opened in the editor after stopping.",
          color = colors.text.normal.copy(alpha = 0.7f),
          fontSize = 12.sp,
      )
    }
  }
}
