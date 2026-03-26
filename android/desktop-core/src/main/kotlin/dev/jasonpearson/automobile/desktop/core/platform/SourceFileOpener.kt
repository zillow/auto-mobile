package dev.jasonpearson.automobile.desktop.core.platform

import dev.jasonpearson.automobile.desktop.core.logging.LoggerFactory
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

private val LOG = LoggerFactory.getLogger("SourceFileOpener")

/**
 * Opens a source file at a specific line in the user's preferred IDE.
 *
 * The filesystem walk runs on [Dispatchers.IO] so click handlers never block the Compose UI thread.
 * A simple cache avoids repeated walks for the same file.
 */
object SourceFileOpener {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  /** Well-known project root markers to search from. */
  private val PROJECT_ROOTS = listOf(
      System.getProperty("user.dir"),
      System.getenv("PROJECT_ROOT"),
  ).filterNotNull().distinct()

  /** Cache of (fileName, className) → resolved absolute path. */
  private val fileCache = ConcurrentHashMap<String, String?>()

  fun open(fileName: String, lineNumber: Int, className: String, androidIde: String = "auto", iosIde: String = "auto") {
    scope.launch {
      try {
        val cacheKey = "$className/$fileName"
        val path = fileCache.getOrPut(cacheKey) {
          findFile(fileName, className)?.absolutePath
        }

        if (path == null) {
          LOG.warn("Could not find source file: $fileName (class: $className)")
          return@launch
        }

        val ide = if (isSwiftOrObjC(fileName)) {
          resolveIde(iosIde, isIos = true)
        } else {
          resolveIde(androidIde, isIos = false)
        }

        openInIde(ide, path, lineNumber)
      } catch (e: Exception) {
        LOG.error("Failed to open source file: $fileName:$lineNumber", e)
      }
    }
  }

  private enum class Ide { AndroidStudio, IntelliJ, Xcode, VSCode }

  private fun resolveIde(setting: String, isIos: Boolean): Ide = when (setting.lowercase()) {
    "android-studio" -> Ide.AndroidStudio
    "intellij" -> Ide.IntelliJ
    "xcode" -> Ide.Xcode
    "vscode" -> Ide.VSCode
    else -> if (isIos) Ide.Xcode else Ide.AndroidStudio // "auto"
  }

  private fun isSwiftOrObjC(fileName: String): Boolean {
    val lower = fileName.lowercase()
    return lower.endsWith(".swift") || lower.endsWith(".m") || lower.endsWith(".mm") || lower.endsWith(".h")
  }

  private fun openInIde(ide: Ide, path: String, lineNumber: Int) {
    val commands: List<List<String>> = when (ide) {
      Ide.AndroidStudio -> listOf(
          listOf("studio", "--line", lineNumber.toString(), path),
          listOf("open", "-a", "Android Studio", path),
      )
      Ide.IntelliJ -> listOf(
          listOf("idea", "--line", lineNumber.toString(), path),
          listOf("open", "-a", "IntelliJ IDEA", path),
      )
      Ide.Xcode -> listOf(
          listOf("xed", "--line", lineNumber.toString(), path),
          listOf("open", "-a", "Xcode", path),
      )
      Ide.VSCode -> listOf(
          listOf("code", "--goto", "$path:$lineNumber"),
      )
    }

    for (cmd in commands) {
      try {
        ProcessBuilder(cmd).redirectErrorStream(true).start()
        LOG.info("Opening in ${ide.name}: ${cmd.joinToString(" ")}")
        return
      } catch (_: Exception) {
        // Try next command
      }
    }
    LOG.warn("Could not open file in ${ide.name} — no working command found")
  }

  private fun findFile(fileName: String, className: String): File? {
    val packagePath = className.substringBeforeLast('.').replace('.', '/')

    for (root in PROJECT_ROOTS) {
      val rootFile = File(root)
      if (!rootFile.isDirectory) continue

      // First: search by package path + file name (fast, precise)
      val byPackage = rootFile.walk()
          .filter { it.isFile && it.name == fileName && it.absolutePath.contains(packagePath) }
          .firstOrNull()
      if (byPackage != null) return byPackage

      // Fallback: match file name anywhere, skip build dirs
      val byName = rootFile.walk()
          .filter { it.isFile && it.name == fileName && !it.absolutePath.contains("/build/") }
          .firstOrNull()
      if (byName != null) return byName
    }
    return null
  }
}
