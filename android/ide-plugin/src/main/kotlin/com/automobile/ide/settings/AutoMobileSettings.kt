package com.automobile.ide.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.util.xmlb.XmlSerializerUtil

@State(
    name = "com.automobile.ide.settings.AutoMobileSettings",
    storages = [Storage("AutoMobileSettings.xml")]
)
class AutoMobileSettings : PersistentStateComponent<AutoMobileSettings> {
    var enableYamlLinting: Boolean = true

    override fun getState(): AutoMobileSettings = this

    override fun loadState(state: AutoMobileSettings) {
        XmlSerializerUtil.copyBean(state, this)
    }

    companion object {
        fun getInstance(): AutoMobileSettings =
            ApplicationManager.getApplication().getService(AutoMobileSettings::class.java)
    }
}
