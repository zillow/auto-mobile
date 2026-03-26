package dev.jasonpearson.automobile.desktop.core.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import dev.jasonpearson.automobile.desktop.core.daemon.AutoMobileClient
import dev.jasonpearson.automobile.desktop.core.daemon.FeatureFlagState
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.jasonpearson.automobile.desktop.core.theme.SharedTheme

/**
 * Settings panel composable that can be shown inline or in a dialog.
 * Mirrors the IDE plugin's settings UI with Material3 styling.
 */
@Composable
fun SettingsPanel(
    settings: SettingsProvider,
    onClose: () -> Unit,
    clientProvider: (() -> AutoMobileClient)? = null,
    modifier: Modifier = Modifier,
) {
  val colors = SharedTheme.globalColors

  Column(
      modifier = modifier
          .fillMaxWidth()
          .background(MaterialTheme.colorScheme.surface)
          .padding(24.dp)
          .verticalScroll(rememberScrollState()),
  ) {
    // Header
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
      Text("Settings", fontSize = 20.sp, fontWeight = FontWeight.Bold)
      Box(
          modifier = Modifier
              .clickable(onClick = onClose)
              .pointerHoverIcon(PointerIcon.Hand)
              .background(colors.text.normal.copy(alpha = 0.08f), RoundedCornerShape(4.dp))
              .padding(horizontal = 12.dp, vertical = 6.dp),
      ) {
        Text("Close", fontSize = 13.sp)
      }
    }

    Spacer(Modifier.height(24.dp))

    // === IDE Preferences ===
    SectionHeader("IDE Preferences")
    Text(
        "Choose which application opens source files from stack traces.",
        fontSize = 12.sp,
        color = colors.text.normal.copy(alpha = 0.6f),
    )
    Spacer(Modifier.height(12.dp))

    var androidIde by remember { mutableStateOf(settings.androidIde) }
    var iosIde by remember { mutableStateOf(settings.iosIde) }

    IdeSelector(
        label = "Android / Kotlin / Java",
        value = androidIde,
        options = listOf("auto" to "Auto (Android Studio)", "android-studio" to "Android Studio", "intellij" to "IntelliJ IDEA", "vscode" to "VS Code"),
        onSelected = { androidIde = it; settings.androidIde = it },
    )
    Spacer(Modifier.height(8.dp))
    IdeSelector(
        label = "Swift / Objective-C",
        value = iosIde,
        options = listOf("auto" to "Auto (Xcode)", "xcode" to "Xcode", "vscode" to "VS Code"),
        onSelected = { iosIde = it; settings.iosIde = it },
    )

    Spacer(Modifier.height(24.dp))
    HorizontalDivider(color = colors.text.normal.copy(alpha = 0.1f))
    Spacer(Modifier.height(24.dp))

    // === Test Plan Authoring ===
    SectionHeader("Test Plan Authoring")

    var yamlLinting by remember { mutableStateOf(settings.enableYamlLinting) }
    Row(verticalAlignment = Alignment.CenterVertically) {
      Checkbox(
          checked = yamlLinting,
          onCheckedChange = { yamlLinting = it; settings.enableYamlLinting = it },
      )
      Text("Enable YAML validation for test plans", fontSize = 13.sp)
    }
    Text(
        "Validates test plan YAML files against the schema for immediate feedback on errors and deprecated fields.",
        fontSize = 12.sp,
        color = colors.text.normal.copy(alpha = 0.6f),
        modifier = Modifier.padding(start = 28.dp),
    )

    Spacer(Modifier.height(24.dp))
    HorizontalDivider(color = colors.text.normal.copy(alpha = 0.1f))
    Spacer(Modifier.height(24.dp))

    // === Recording ===
    SectionHeader("Recording")

    var outputDir by remember { mutableStateOf(settings.testPlanOutputDirectory) }
    Text(
        "Test plan output directory (relative to project root or absolute)",
        fontSize = 12.sp,
        color = colors.text.normal.copy(alpha = 0.6f),
    )
    Spacer(Modifier.height(4.dp))
    TextField(
        value = outputDir,
        onValueChange = { outputDir = it; settings.testPlanOutputDirectory = it },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
    Text(
        "New recordings are saved here and opened in the editor after stopping.",
        fontSize = 12.sp,
        color = colors.text.normal.copy(alpha = 0.5f),
    )

    Spacer(Modifier.height(24.dp))
    HorizontalDivider(color = colors.text.normal.copy(alpha = 0.1f))
    Spacer(Modifier.height(24.dp))

    // === Failures ===
    SectionHeader("Failures")

    var dateRange by remember { mutableStateOf(settings.failuresDateRange) }
    Text("Default date range", fontSize = 12.sp, color = colors.text.normal.copy(alpha = 0.6f))
    Spacer(Modifier.height(4.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
      listOf("1h", "24h", "3d", "7d", "30d").forEach { range ->
        Box(
            modifier = Modifier
                .clickable { dateRange = range; settings.failuresDateRange = range }
                .pointerHoverIcon(PointerIcon.Hand)
                .background(
                    if (dateRange == range) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                    else colors.text.normal.copy(alpha = 0.05f),
                    RoundedCornerShape(4.dp),
                )
                .padding(horizontal = 10.dp, vertical = 6.dp),
        ) {
          Text(
              range,
              fontSize = 12.sp,
              color = if (dateRange == range) MaterialTheme.colorScheme.primary else colors.text.normal,
          )
        }
      }
    }

    // === Feature Flags ===
    if (clientProvider != null) {
      Spacer(Modifier.height(24.dp))
      HorizontalDivider(color = colors.text.normal.copy(alpha = 0.1f))
      Spacer(Modifier.height(24.dp))

      FeatureFlagsSection(clientProvider = clientProvider)
    }
  }
}

// ── Feature Flags ────────────────────────────────────────────────────────

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
    _state.update { it.copy(statusText = "Loading feature flags...", errorText = null, isLoading = true) }
    scope.launch {
      try {
        val flags = client.listFeatureFlags()
        _state.update { it.copy(flags = flags, statusText = "Loaded ${flags.size} flags", errorText = null, isLoading = false) }
      } catch (error: Exception) {
        _state.update { it.copy(flags = emptyList(), statusText = "Unable to load feature flags", errorText = error.message, isLoading = false) }
      }
    }
  }

  fun toggleFlag(flag: FeatureFlagState, enabled: Boolean) {
    val previous = _state.value.flags
    _state.update { it.copy(flags = it.flags.map { e -> if (e.key == flag.key) e.copy(enabled = enabled) else e }, updatingKeys = it.updatingKeys + flag.key) }
    scope.launch {
      try {
        val updated = client.setFeatureFlag(flag.key, enabled)
        _state.update { it.copy(flags = it.flags.map { e -> if (e.key == flag.key) updated else e }, statusText = "Updated ${flag.label}", updatingKeys = it.updatingKeys - flag.key) }
      } catch (error: Exception) {
        _state.update { it.copy(flags = previous, statusText = "Update failed", errorText = error.message, updatingKeys = it.updatingKeys - flag.key) }
      }
    }
  }

  fun updateFlagConfig(flag: FeatureFlagState, config: JsonObject) {
    val previous = _state.value.flags
    _state.update { it.copy(flags = it.flags.map { e -> if (e.key == flag.key) e.copy(config = config) else e }, updatingKeys = it.updatingKeys + flag.key) }
    scope.launch {
      try {
        val updated = client.setFeatureFlag(flag.key, flag.enabled, config)
        _state.update { it.copy(flags = it.flags.map { e -> if (e.key == flag.key) updated else e }, statusText = "Updated ${flag.label}", updatingKeys = it.updatingKeys - flag.key) }
      } catch (error: Exception) {
        _state.update { it.copy(flags = previous, statusText = "Update failed", errorText = error.message, updatingKeys = it.updatingKeys - flag.key) }
      }
    }
  }

  fun dispose() { scope.cancel(); client.close() }
}

@Composable
private fun FeatureFlagsSection(clientProvider: () -> AutoMobileClient) {
  val colors = SharedTheme.globalColors
  val viewModel = remember { FeatureFlagsViewModel(clientProvider()) }
  val uiState by viewModel.state.collectAsState()

  DisposableEffect(Unit) { onDispose { viewModel.dispose() } }
  LaunchedEffect(Unit) { viewModel.loadFlags() }

  SectionHeader("Feature Flags")

  Row(
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    Text(uiState.statusText, fontSize = 13.sp, color = colors.text.normal.copy(alpha = 0.7f))
    Box(
        modifier = Modifier
            .clickable { viewModel.loadFlags() }
            .pointerHoverIcon(PointerIcon.Hand)
            .background(colors.text.normal.copy(alpha = 0.08f), RoundedCornerShape(4.dp))
            .padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
      Text("Refresh", fontSize = 12.sp)
    }
  }

  if (!uiState.errorText.isNullOrBlank()) {
    val errText = uiState.errorText ?: ""
    Text(errText, fontSize = 12.sp, color = colors.text.error)
  }

  Spacer(Modifier.height(8.dp))

  uiState.flags.forEach { flag ->
    FeatureFlagRow(
        flag = flag,
        isUpdating = uiState.updatingKeys.contains(flag.key),
        onToggle = { enabled -> viewModel.toggleFlag(flag, enabled) },
        onUpdateConfig = { config -> viewModel.updateFlagConfig(flag, config) },
    )
    Spacer(Modifier.height(8.dp))
  }
}

@Composable
private fun FeatureFlagRow(
    flag: FeatureFlagState,
    isUpdating: Boolean,
    onToggle: (Boolean) -> Unit,
    onUpdateConfig: (JsonObject) -> Unit,
) {
  val colors = SharedTheme.globalColors

  Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      Checkbox(
          checked = flag.enabled,
          onCheckedChange = { if (!isUpdating) onToggle(it) },
          enabled = !isUpdating,
      )
      Text(flag.label, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }

    val desc = flag.description
    if (!desc.isNullOrBlank()) {
      Text(desc, fontSize = 12.sp, color = colors.text.normal.copy(alpha = 0.6f), modifier = Modifier.padding(start = 28.dp))
    }

    if (flag.key == "accessibility-audit") {
      AccessibilityConfigPanel(flag = flag, isUpdating = isUpdating, onConfigChange = onUpdateConfig)
    }
  }
}

@Composable
private fun AccessibilityConfigPanel(
    flag: FeatureFlagState,
    isUpdating: Boolean,
    onConfigChange: (JsonObject) -> Unit,
) {
  val colors = SharedTheme.globalColors
  var level by remember { mutableStateOf(readConfigValue(flag.config, "level", "AA")) }
  var failureMode by remember { mutableStateOf(readConfigValue(flag.config, "failureMode", "report")) }
  var minSeverity by remember { mutableStateOf(readConfigValue(flag.config, "minSeverity", "warning")) }
  var useBaseline by remember { mutableStateOf(readConfigBoolean(flag.config, "useBaseline", false)) }

  LaunchedEffect(flag.config) {
    level = readConfigValue(flag.config, "level", "AA")
    failureMode = readConfigValue(flag.config, "failureMode", "report")
    minSeverity = readConfigValue(flag.config, "minSeverity", "warning")
    useBaseline = readConfigBoolean(flag.config, "useBaseline", false)
  }

  fun submit() {
    onConfigChange(buildJsonObject {
      put("level", JsonPrimitive(level))
      put("failureMode", JsonPrimitive(failureMode))
      put("minSeverity", JsonPrimitive(minSeverity))
      put("useBaseline", JsonPrimitive(useBaseline))
    })
  }

  Column(
      modifier = Modifier.padding(start = 28.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    Text("Accessibility audit settings", fontSize = 12.sp, color = colors.text.normal.copy(alpha = 0.6f))

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
      Text("Level", fontSize = 12.sp)
      OptionSelector(ACCESSIBILITY_LEVELS, level, isUpdating) { level = it; submit() }
      Text("Failure", fontSize = 12.sp)
      OptionSelector(ACCESSIBILITY_FAILURE_MODES, failureMode, isUpdating) { failureMode = it; submit() }
      Text("Min severity", fontSize = 12.sp)
      OptionSelector(ACCESSIBILITY_SEVERITIES, minSeverity, isUpdating) { minSeverity = it; submit() }
    }

    Row(verticalAlignment = Alignment.CenterVertically) {
      Checkbox(
          checked = useBaseline,
          onCheckedChange = { if (!isUpdating) { useBaseline = it; submit() } },
          enabled = !isUpdating,
      )
      Text("Use baseline", fontSize = 12.sp)
    }
  }
}

/** Simple option selector using chip-style buttons (replaces Jewel's ListComboBox). */
@Composable
private fun OptionSelector(
    options: List<String>,
    selected: String,
    isUpdating: Boolean,
    onSelect: (String) -> Unit,
) {
  Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
    options.forEach { option ->
      Box(
          modifier = Modifier
              .clickable(enabled = !isUpdating) { onSelect(option) }
              .pointerHoverIcon(PointerIcon.Hand)
              .background(
                  if (option == selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                  else SharedTheme.globalColors.text.normal.copy(alpha = 0.05f),
                  RoundedCornerShape(4.dp),
              )
              .padding(horizontal = 8.dp, vertical = 4.dp),
      ) {
        Text(
            option,
            fontSize = 11.sp,
            color = if (option == selected) MaterialTheme.colorScheme.primary else SharedTheme.globalColors.text.normal,
        )
      }
    }
  }
}

private fun readConfigValue(config: JsonObject?, key: String, fallback: String): String {
  val value = config?.get(key)
  return (value as? JsonPrimitive)?.content ?: fallback
}

private fun readConfigBoolean(config: JsonObject?, key: String, fallback: Boolean): Boolean {
  val value = config?.get(key)
  return (value as? JsonPrimitive)?.content?.toBooleanStrictOrNull() ?: fallback
}

@Composable
private fun SectionHeader(title: String) {
  Text(title, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
  Spacer(Modifier.height(8.dp))
}

@Composable
private fun IdeSelector(
    label: String,
    value: String,
    options: List<Pair<String, String>>,
    onSelected: (String) -> Unit,
) {
  val colors = SharedTheme.globalColors
  Row(
      modifier = Modifier.fillMaxWidth(),
      verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(label, fontSize = 13.sp, modifier = Modifier.width(200.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
      options.forEach { (key, displayName) ->
        Box(
            modifier = Modifier
                .clickable { onSelected(key) }
                .pointerHoverIcon(PointerIcon.Hand)
                .background(
                    if (value == key) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                    else colors.text.normal.copy(alpha = 0.05f),
                    RoundedCornerShape(4.dp),
                )
                .padding(horizontal = 10.dp, vertical = 6.dp),
        ) {
          Text(
              displayName,
              fontSize = 12.sp,
              color = if (value == key) MaterialTheme.colorScheme.primary else colors.text.normal,
          )
        }
      }
    }
  }
}
