package dev.jasonpearson.automobile.ide.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.FeatureFlagState
import dev.jasonpearson.automobile.ide.daemon.McpClientFactory
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.options.SearchableConfigurable
import javax.swing.JComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import org.jetbrains.jewel.bridge.JewelComposePanel
import org.jetbrains.jewel.foundation.theme.JewelTheme
import org.jetbrains.jewel.ui.component.CheckboxRow
import org.jetbrains.jewel.ui.component.ListComboBox
import org.jetbrains.jewel.ui.component.OutlinedButton
import org.jetbrains.jewel.ui.component.Text

class FeatureFlagsConfigurable : SearchableConfigurable, Configurable.NoScroll {
  private var viewModel: FeatureFlagsViewModel? = null

  override fun getId(): String = "automobile.featureFlags"

  override fun getDisplayName(): String = "Feature Flags"

  override fun createComponent(): JComponent {
    val client = McpClientFactory.createPreferred(null)
    val viewModel = FeatureFlagsViewModel(client)
    this.viewModel = viewModel
    viewModel.loadFlags()
    return JewelComposePanel { FeatureFlagsSettingsContent(viewModel) }
  }

  override fun isModified(): Boolean = false

  override fun apply() {
    // Changes apply immediately per toggle.
  }

  override fun reset() {
    viewModel?.loadFlags()
  }

  override fun disposeUIResources() {
    viewModel?.dispose()
    viewModel = null
  }
}

private val ACCESSIBILITY_LEVELS = listOf("A", "AA", "AAA")
private val ACCESSIBILITY_FAILURE_MODES = listOf("report", "threshold", "strict")
private val ACCESSIBILITY_SEVERITIES = listOf("error", "warning", "info")

private data class FeatureFlagsUiState(
    val statusText: String = "Loading feature flags...",
    val errorText: String? = null,
    val flags: List<FeatureFlagState> = emptyList(),
    val updatingKeys: Set<String> = emptySet(),
    val isLoading: Boolean = true,
)

private class FeatureFlagsViewModel(private val client: AutoMobileClient) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val _state = MutableStateFlow(FeatureFlagsUiState())
  val state: StateFlow<FeatureFlagsUiState> = _state.asStateFlow()

  fun loadFlags() {
    _state.update {
      it.copy(
          statusText = "Loading feature flags...",
          errorText = null,
          isLoading = true,
      )
    }
    scope.launch {
      try {
        val flags = client.listFeatureFlags()
        _state.update {
          it.copy(
              flags = flags,
              statusText = "Loaded ${flags.size} flags",
              errorText = null,
              isLoading = false,
          )
        }
      } catch (error: Exception) {
        _state.update {
          it.copy(
              flags = emptyList(),
              statusText = "Unable to load feature flags",
              errorText = error.message ?: "Unknown error",
              isLoading = false,
          )
        }
      }
    }
  }

  fun toggleFlag(flag: FeatureFlagState, enabled: Boolean) {
    val previousFlags = _state.value.flags
    _state.update {
      it.copy(
          flags =
              it.flags.map { entry ->
                if (entry.key == flag.key) entry.copy(enabled = enabled) else entry
              },
          statusText = "Updating ${flag.label}...",
          errorText = null,
          updatingKeys = it.updatingKeys + flag.key,
      )
    }
    scope.launch {
      try {
        val updated = client.setFeatureFlag(flag.key, enabled)
        _state.update {
          it.copy(
              flags =
                  it.flags.map { entry -> if (entry.key == flag.key) updated else entry },
              statusText = "Updated ${flag.label}",
              updatingKeys = it.updatingKeys - flag.key,
          )
        }
      } catch (error: Exception) {
        _state.update {
          it.copy(
              flags = previousFlags,
              statusText = "Update failed",
              errorText = error.message ?: "Unknown error",
              updatingKeys = it.updatingKeys - flag.key,
          )
        }
      }
    }
  }

  fun updateFlagConfig(flag: FeatureFlagState, config: JsonObject) {
    val previousFlags = _state.value.flags
    _state.update {
      it.copy(
          flags =
              it.flags.map { entry ->
                if (entry.key == flag.key) entry.copy(config = config) else entry
              },
          statusText = "Updating ${flag.label}...",
          errorText = null,
          updatingKeys = it.updatingKeys + flag.key,
      )
    }
    scope.launch {
      try {
        val updated = client.setFeatureFlag(flag.key, flag.enabled, config)
        _state.update {
          it.copy(
              flags =
                  it.flags.map { entry -> if (entry.key == flag.key) updated else entry },
              statusText = "Updated ${flag.label}",
              updatingKeys = it.updatingKeys - flag.key,
          )
        }
      } catch (error: Exception) {
        _state.update {
          it.copy(
              flags = previousFlags,
              statusText = "Update failed",
              errorText = error.message ?: "Unknown error",
              updatingKeys = it.updatingKeys - flag.key,
          )
        }
      }
    }
  }

  fun dispose() {
    scope.cancel()
    client.close()
  }
}

@Composable
private fun FeatureFlagsSettingsContent(viewModel: FeatureFlagsViewModel) {
  val uiState by viewModel.state.collectAsState()
  val colors = JewelTheme.globalColors

  Column(
      modifier = Modifier.fillMaxSize().padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Text("Feature flags")
      OutlinedButton(
          onClick = { viewModel.loadFlags() },
          enabled = !uiState.isLoading,
      ) {
        Text("Refresh")
      }
    }

    Text(uiState.statusText, color = colors.text.normal)
    if (!uiState.errorText.isNullOrBlank()) {
      Text(uiState.errorText ?: "", color = colors.text.error)
    }

    if (uiState.flags.isEmpty() && !uiState.isLoading) {
      Text(
          "No feature flags available.",
          color = colors.text.normal.copy(alpha = 0.7f),
      )
    } else {
      LazyColumn(
          modifier = Modifier.fillMaxSize(),
          verticalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        items(uiState.flags, key = { it.key }) { flag ->
          FeatureFlagRow(
              flag = flag,
              isUpdating = uiState.updatingKeys.contains(flag.key),
              onToggle = { enabled -> viewModel.toggleFlag(flag, enabled) },
              onUpdateConfig = { config -> viewModel.updateFlagConfig(flag, config) },
          )
        }
      }
    }
  }
}

@Composable
private fun FeatureFlagRow(
    flag: FeatureFlagState,
    isUpdating: Boolean,
    onToggle: (Boolean) -> Unit,
    onUpdateConfig: (JsonObject) -> Unit,
) {
  val colors = JewelTheme.globalColors

  Column(
      modifier = Modifier.fillMaxWidth(),
      verticalArrangement = Arrangement.spacedBy(6.dp),
  ) {
    CheckboxRow(
        text = flag.label,
        checked = flag.enabled,
        onCheckedChange = { enabled ->
          if (!isUpdating) {
            onToggle(enabled)
          }
        },
        enabled = !isUpdating,
    )

    if (!flag.description.isNullOrBlank()) {
      Text(
          flag.description,
          color = colors.text.normal.copy(alpha = 0.7f),
          fontSize = 12.sp,
      )
    }

    if (flag.key == "accessibility-audit") {
      AccessibilityConfigPanel(
          flag = flag,
          isUpdating = isUpdating,
          onConfigChange = onUpdateConfig,
      )
    }
  }
}

@Composable
private fun AccessibilityConfigPanel(
    flag: FeatureFlagState,
    isUpdating: Boolean,
    onConfigChange: (JsonObject) -> Unit,
) {
  val colors = JewelTheme.globalColors

  var level by remember { mutableStateOf(readConfigValue(flag.config, "level", "AA")) }
  var failureMode by
      remember { mutableStateOf(readConfigValue(flag.config, "failureMode", "report")) }
  var minSeverity by
      remember { mutableStateOf(readConfigValue(flag.config, "minSeverity", "warning")) }
  var useBaseline by remember { mutableStateOf(readConfigBoolean(flag.config, "useBaseline", false)) }

  LaunchedEffect(flag.config) {
    level = readConfigValue(flag.config, "level", "AA")
    failureMode = readConfigValue(flag.config, "failureMode", "report")
    minSeverity = readConfigValue(flag.config, "minSeverity", "warning")
    useBaseline = readConfigBoolean(flag.config, "useBaseline", false)
  }

  fun submit() {
    val config = buildJsonObject {
      put("level", JsonPrimitive(level))
      put("failureMode", JsonPrimitive(failureMode))
      put("minSeverity", JsonPrimitive(minSeverity))
      put("useBaseline", JsonPrimitive(useBaseline))
    }
    onConfigChange(config)
  }

  Column(
      modifier = Modifier.fillMaxWidth().padding(start = 28.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    Text(
        "Accessibility audit settings",
        color = colors.text.normal.copy(alpha = 0.7f),
        fontSize = 12.sp,
    )

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
      Text("Level", fontSize = 12.sp)
      ListComboBox(
          ACCESSIBILITY_LEVELS,
          ACCESSIBILITY_LEVELS.indexOf(level).coerceAtLeast(0),
          { index ->
            if (!isUpdating) {
              level = ACCESSIBILITY_LEVELS.getOrNull(index) ?: level
              submit()
            }
          },
          enabled = !isUpdating,
          modifier = Modifier.width(90.dp),
      )

      Text("Failure", fontSize = 12.sp)
      ListComboBox(
          ACCESSIBILITY_FAILURE_MODES,
          ACCESSIBILITY_FAILURE_MODES.indexOf(failureMode).coerceAtLeast(0),
          { index ->
            if (!isUpdating) {
              failureMode = ACCESSIBILITY_FAILURE_MODES.getOrNull(index) ?: failureMode
              submit()
            }
          },
          enabled = !isUpdating,
          modifier = Modifier.width(120.dp),
      )

      Text("Min severity", fontSize = 12.sp)
      ListComboBox(
          ACCESSIBILITY_SEVERITIES,
          ACCESSIBILITY_SEVERITIES.indexOf(minSeverity).coerceAtLeast(0),
          { index ->
            if (!isUpdating) {
              minSeverity = ACCESSIBILITY_SEVERITIES.getOrNull(index) ?: minSeverity
              submit()
            }
          },
          enabled = !isUpdating,
          modifier = Modifier.width(110.dp),
      )
    }

    CheckboxRow(
        text = "Use baseline",
        checked = useBaseline,
        onCheckedChange = { enabled ->
          if (!isUpdating) {
            useBaseline = enabled
            submit()
          }
        },
        enabled = !isUpdating,
    )
  }
}

private fun readConfigValue(config: JsonObject?, key: String, fallback: String): String {
  val value = config?.get(key)
  return (value as? JsonPrimitive)?.content ?: fallback
}

private fun readConfigBoolean(config: JsonObject?, key: String, fallback: Boolean): Boolean {
  val value = config?.get(key)
  val content = (value as? JsonPrimitive)?.content
  return content?.toBooleanStrictOrNull() ?: fallback
}
