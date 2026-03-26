package dev.jasonpearson.automobile.ide

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import dev.jasonpearson.automobile.desktop.core.AutoMobileContent
import dev.jasonpearson.automobile.desktop.core.platform.NotificationHandler
import dev.jasonpearson.automobile.ide.settings.AutoMobileSettings
import dev.jasonpearson.automobile.ide.telemetry.SourceFileFinder
import org.jetbrains.jewel.bridge.JewelComposePanel

class AutoMobileToolWindowFactory : ToolWindowFactory, DumbAware {
  override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
    val panel = JewelComposePanel {
      AutoMobileContent(
          settingsProvider = AutoMobileSettings.getInstance(),
          notificationHandler = IntellijNotificationHandler,
          onOpenSource = { fileName, lineNumber, className ->
            SourceFileFinder.findAndOpen(project, fileName, lineNumber, className)
          },
      )
    }
    val content = toolWindow.contentManager.factory.createContent(panel, "", false)
    toolWindow.contentManager.addContent(content)
  }
}

/** Bridges desktop-core's NotificationHandler to IntelliJ's notification system. */
private object IntellijNotificationHandler : NotificationHandler {
  override fun show(title: String, content: String, isWarning: Boolean) {
    try {
      val type =
          if (isWarning) {
            com.intellij.notification.NotificationType.WARNING
          } else {
            com.intellij.notification.NotificationType.INFORMATION
          }
      com.intellij.notification.NotificationGroupManager.getInstance()
          .getNotificationGroup("AutoMobile")
          .createNotification(title, content, type)
          .notify(null)
    } catch (_: Exception) {}
  }
}
