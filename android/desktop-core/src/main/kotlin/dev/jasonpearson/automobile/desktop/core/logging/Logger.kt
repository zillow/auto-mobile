package dev.jasonpearson.automobile.desktop.core.logging

/** Platform-agnostic logger interface to decouple from IntelliJ's Logger. */
interface Logger {
  fun info(message: String)
  fun warn(message: String)
  fun warn(message: String, throwable: Throwable)
  fun error(message: String)
  fun error(message: String, throwable: Throwable)
  fun debug(message: String)
}

/** Simple logger that writes to stderr — suitable for desktop and CLI usage. */
class StderrLogger(private val tag: String) : Logger {
  override fun info(message: String) {
    System.err.println("INFO [$tag] $message")
  }

  override fun warn(message: String) {
    System.err.println("WARN [$tag] $message")
  }

  override fun warn(message: String, throwable: Throwable) {
    System.err.println("WARN [$tag] $message")
    throwable.printStackTrace(System.err)
  }

  override fun error(message: String) {
    System.err.println("ERROR [$tag] $message")
  }

  override fun error(message: String, throwable: Throwable) {
    System.err.println("ERROR [$tag] $message")
    throwable.printStackTrace(System.err)
  }

  override fun debug(message: String) {
    System.err.println("DEBUG [$tag] $message")
  }
}

/** Factory for creating loggers. Can be overridden by IDE plugin to use IntelliJ's Logger. */
object LoggerFactory {
  @Volatile var factory: (String) -> Logger = { tag -> StderrLogger(tag) }

  fun getLogger(tag: String): Logger = factory(tag)

  fun getLogger(clazz: Class<*>): Logger = factory(clazz.simpleName ?: "Unknown")

  inline fun <reified T> getLogger(): Logger = getLogger(T::class.java)
}
