package dev.jasonpearson.automobile.ide

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import javax.swing.JPanel

class AutoMobileToolWindowFactory : ToolWindowFactory, DumbAware {
  override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
    val content = toolWindow.contentManager.factory.createContent(JPanel(), "", false)
    toolWindow.contentManager.addContent(content)
  }
}
