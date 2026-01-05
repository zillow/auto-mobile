package com.automobile.ide.settings

import com.intellij.openapi.options.SearchableConfigurable
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBPanel
import java.awt.BorderLayout
import javax.swing.JComponent

class AutoMobileSettingsConfigurable : SearchableConfigurable {
  private var panel: JBPanel<JBPanel<*>>? = null

  override fun getId(): String = "automobile.settings"

  override fun getDisplayName(): String = "AutoMobile"

  override fun createComponent(): JComponent {
    val root = JBPanel<JBPanel<*>>(BorderLayout())
    root.add(JBLabel("AutoMobile settings"), BorderLayout.NORTH)
    panel = root
    return root
  }

  override fun isModified(): Boolean = false

  override fun apply() {
    // Settings are applied immediately in child panels.
  }

  override fun disposeUIResources() {
    panel = null
  }
}
