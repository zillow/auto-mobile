package com.automobile.ide

import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.awt.ComposePanel
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory

class AutoMobileToolWindowFactory : ToolWindowFactory, DumbAware {
  @OptIn(ExperimentalComposeUiApi::class)
  override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
    val panel = ComposePanel()
    panel.setContent {
      AutoMobileToolWindowContent()
    }

    val content = toolWindow.contentManager.factory.createContent(panel, "", false)
    toolWindow.contentManager.addContent(content)

    Disposer.register(content) {
      panel.dispose()
    }
  }
}
