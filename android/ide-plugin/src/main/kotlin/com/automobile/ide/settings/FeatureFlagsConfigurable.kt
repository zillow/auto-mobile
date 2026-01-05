package com.automobile.ide.settings

import com.automobile.ide.daemon.AutoMobileClient
import com.automobile.ide.daemon.FeatureFlagState
import com.automobile.ide.daemon.McpClientFactory
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.options.SearchableConfigurable
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBPanel
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.UIUtil
import java.awt.BorderLayout
import java.awt.FlowLayout
import javax.swing.JComponent
import javax.swing.JButton
import javax.swing.JComboBox
import javax.swing.JPanel
import javax.swing.SwingConstants
import javax.swing.border.EmptyBorder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

class FeatureFlagsConfigurable : SearchableConfigurable {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var client: AutoMobileClient? = null
  private var panel: JBPanel<JBPanel<*>>? = null
  private var statusLabel: JBLabel? = null
  private var errorLabel: JBLabel? = null
  private var listPanel: JPanel? = null
  private var isUpdatingUi = false
  private val accessibilityLevels = listOf("A", "AA", "AAA")
  private val accessibilityFailureModes = listOf("report", "threshold", "strict")
  private val accessibilitySeverities = listOf("error", "warning", "info")

  override fun getId(): String = "automobile.featureFlags"

  override fun getDisplayName(): String = "Feature Flags"

  override fun createComponent(): JComponent {
    client = McpClientFactory.createPreferred(null)

    val root = JBPanel<JBPanel<*>>(BorderLayout(0, 8))
    val header = JPanel(FlowLayout(FlowLayout.LEFT, 8, 0))
    statusLabel = JBLabel("Loading feature flags…")
    errorLabel = JBLabel("", SwingConstants.LEFT).apply {
      foreground = UIUtil.getErrorForeground()
    }

    val refreshButton = JButton("Refresh")
    refreshButton.addActionListener {
      loadFlags()
    }

    header.add(statusLabel)
    header.add(refreshButton)

    listPanel = JPanel().apply {
      layout = javax.swing.BoxLayout(this, javax.swing.BoxLayout.Y_AXIS)
      border = EmptyBorder(8, 0, 0, 0)
    }

    val scrollPane = JBScrollPane(listPanel)
    scrollPane.border = EmptyBorder(0, 0, 0, 0)

    val errorPanel = JPanel(BorderLayout())
    errorPanel.add(errorLabel, BorderLayout.CENTER)

    root.add(header, BorderLayout.NORTH)
    root.add(scrollPane, BorderLayout.CENTER)
    root.add(errorPanel, BorderLayout.SOUTH)
    panel = root

    loadFlags()
    return root
  }

  override fun isModified(): Boolean = false

  override fun apply() {
    // Changes apply immediately per toggle.
  }

  override fun reset() {
    loadFlags()
  }

  override fun disposeUIResources() {
    scope.cancel()
    client?.close()
    client = null
    panel = null
    statusLabel = null
    errorLabel = null
    listPanel = null
  }

  private fun loadFlags() {
    statusLabel?.text = "Loading feature flags…"
    errorLabel?.text = ""
    scope.launch {
      try {
        val flags = client?.listFeatureFlags().orEmpty()
        ApplicationManager.getApplication().invokeLater {
          renderFlags(flags)
          statusLabel?.text = "Loaded ${flags.size} flags"
        }
      } catch (error: Exception) {
        ApplicationManager.getApplication().invokeLater {
          statusLabel?.text = "Unable to load feature flags"
          errorLabel?.text = error.message ?: "Unknown error"
          renderFlags(emptyList())
        }
      }
    }
  }

  private fun renderFlags(flags: List<FeatureFlagState>) {
    val container = listPanel ?: return
    container.removeAll()

    for (flag in flags) {
      container.add(createFlagRow(flag))
    }

    container.revalidate()
    container.repaint()
  }

  private fun createFlagRow(flag: FeatureFlagState): JComponent {
    val row = JPanel()
    row.layout = javax.swing.BoxLayout(row, javax.swing.BoxLayout.Y_AXIS)
    row.border = EmptyBorder(0, 0, 12, 0)

    val checkbox = JBCheckBox(flag.label, flag.enabled)
    checkbox.toolTipText = flag.description
    checkbox.addActionListener {
      if (isUpdatingUi) {
        return@addActionListener
      }
      updateFlag(flag, checkbox)
    }

    row.add(checkbox)
    if (!flag.description.isNullOrBlank()) {
      val description = JBLabel(flag.description)
      description.foreground = UIUtil.getContextHelpForeground()
      row.add(description)
    }

    if (flag.key == "accessibility-audit") {
      row.add(createAccessibilityConfigPanel(flag, checkbox))
    }

    return row
  }

  private fun updateFlag(flag: FeatureFlagState, checkbox: JBCheckBox) {
    val desired = checkbox.isSelected
    checkbox.isEnabled = false
    statusLabel?.text = "Updating ${flag.label}…"
    errorLabel?.text = ""

    scope.launch {
      try {
        val updated = client?.setFeatureFlag(flag.key, desired)
        ApplicationManager.getApplication().invokeLater {
          isUpdatingUi = true
          checkbox.isSelected = updated?.enabled ?: desired
          isUpdatingUi = false
          checkbox.isEnabled = true
          statusLabel?.text = "Updated ${flag.label}"
        }
      } catch (error: Exception) {
        ApplicationManager.getApplication().invokeLater {
          isUpdatingUi = true
          checkbox.isSelected = !desired
          isUpdatingUi = false
          checkbox.isEnabled = true
          statusLabel?.text = "Update failed"
          errorLabel?.text = error.message ?: "Unknown error"
        }
      }
    }
  }

  private fun createAccessibilityConfigPanel(flag: FeatureFlagState, checkbox: JBCheckBox): JComponent {
    val panel = JPanel(FlowLayout(FlowLayout.LEFT, 8, 0))
    panel.border = EmptyBorder(4, 0, 0, 0)

    val levelValue = readConfigValue(flag.config, "level", "AA")
    val failureModeValue = readConfigValue(flag.config, "failureMode", "report")
    val minSeverityValue = readConfigValue(flag.config, "minSeverity", "warning")
    val useBaselineValue = readConfigBoolean(flag.config, "useBaseline", false)

    val levelBox = JComboBox(accessibilityLevels.toTypedArray())
    levelBox.selectedItem = levelValue
    val failureModeBox = JComboBox(accessibilityFailureModes.toTypedArray())
    failureModeBox.selectedItem = failureModeValue
    val minSeverityBox = JComboBox(accessibilitySeverities.toTypedArray())
    minSeverityBox.selectedItem = minSeverityValue
    val baselineCheck = JBCheckBox("Use baseline", useBaselineValue)

    fun onConfigChange() {
      if (isUpdatingUi) {
        return
      }

      val config = buildJsonObject {
        put("level", JsonPrimitive(levelBox.selectedItem as String))
        put("failureMode", JsonPrimitive(failureModeBox.selectedItem as String))
        put("minSeverity", JsonPrimitive(minSeverityBox.selectedItem as String))
        put("useBaseline", JsonPrimitive(baselineCheck.isSelected))
      }

      updateFlagConfig(flag, checkbox, config, listOf(levelBox, failureModeBox, minSeverityBox, baselineCheck))
    }

    levelBox.addActionListener { onConfigChange() }
    failureModeBox.addActionListener { onConfigChange() }
    minSeverityBox.addActionListener { onConfigChange() }
    baselineCheck.addActionListener { onConfigChange() }

    panel.add(JBLabel("Level"))
    panel.add(levelBox)
    panel.add(JBLabel("Failure"))
    panel.add(failureModeBox)
    panel.add(JBLabel("Min severity"))
    panel.add(minSeverityBox)
    panel.add(baselineCheck)

    return panel
  }

  private fun updateFlagConfig(
    flag: FeatureFlagState,
    checkbox: JBCheckBox,
    config: JsonObject,
    controls: List<JComponent>,
  ) {
    val enabled = checkbox.isSelected
    setControlsEnabled(controls, false)
    statusLabel?.text = "Updating ${flag.label}…"
    errorLabel?.text = ""

    scope.launch {
      try {
        val updated = client?.setFeatureFlag(flag.key, enabled, config)
        ApplicationManager.getApplication().invokeLater {
          isUpdatingUi = true
          checkbox.isSelected = updated?.enabled ?: enabled
          isUpdatingUi = false
          setControlsEnabled(controls, true)
          statusLabel?.text = "Updated ${flag.label}"
        }
      } catch (error: Exception) {
        ApplicationManager.getApplication().invokeLater {
          setControlsEnabled(controls, true)
          statusLabel?.text = "Update failed"
          errorLabel?.text = error.message ?: "Unknown error"
          loadFlags()
        }
      }
    }
  }

  private fun setControlsEnabled(controls: List<JComponent>, enabled: Boolean) {
    controls.forEach { it.isEnabled = enabled }
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
}
