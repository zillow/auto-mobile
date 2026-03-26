package dev.jasonpearson.automobile.desktop.core.platform

/** Platform-agnostic notification handler. IDE plugin provides IntelliJ impl; desktop app uses no-op. */
interface NotificationHandler {
  fun show(title: String, content: String, isWarning: Boolean = false)
}

/** No-op notification handler for desktop app and tests. */
object NoOpNotificationHandler : NotificationHandler {
  override fun show(title: String, content: String, isWarning: Boolean) {}
}
