package dev.jasonpearson.automobile.ide.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.util.xmlb.XmlSerializerUtil
import dev.jasonpearson.automobile.desktop.core.settings.SettingsProvider

@State(
    name = "com.automobile.ide.settings.AutoMobileSettings",
    storages = [Storage("AutoMobileSettings.xml")],
)
class AutoMobileSettings : PersistentStateComponent<AutoMobileSettings>, SettingsProvider {
  override var enableYamlLinting: Boolean = true
  override var testPlanOutputDirectory: String = "test/resources/test-plans"
  override var fogModeEnabled: Boolean = true
  override var autoFocusEnabled: Boolean = true
  override var failuresDateRange: String = "24h"  // Default to 24 hours
  override var androidIde: String = "auto"
  override var iosIde: String = "auto"

  override fun getState(): AutoMobileSettings = this

  override fun loadState(state: AutoMobileSettings) {
    XmlSerializerUtil.copyBean(state, this)
  }

  companion object {
    fun getInstance(): AutoMobileSettings =
        ApplicationManager.getApplication().getService(AutoMobileSettings::class.java)
  }
}
