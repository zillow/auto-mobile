package dev.jasonpearson.automobile.desktop.core.platform

/**
 * Platform-agnostic file save operation. The IDE plugin provides an IntelliJ implementation; the
 * desktop app can use a Swing/AWT file dialog.
 */
fun interface FileSaver {
  /**
   * Present a save dialog for the given file name and content. Calls [onSuccess] with the saved
   * file path on success.
   */
  fun save(fileName: String, content: String, onSuccess: (String) -> Unit)
}

/** Default no-op file saver for environments without a file dialog. */
object NoOpFileSaver : FileSaver {
  override fun save(fileName: String, content: String, onSuccess: (String) -> Unit) {}
}

/**
 * Desktop file saver that uses Swing's JFileChooser. Suitable for standalone desktop applications.
 */
object SwingFileSaver : FileSaver {
  override fun save(fileName: String, content: String, onSuccess: (String) -> Unit) {
    try {
      val chooser = javax.swing.JFileChooser()
      chooser.selectedFile = java.io.File(fileName)
      val result = chooser.showSaveDialog(null)
      if (result == javax.swing.JFileChooser.APPROVE_OPTION) {
        val file = chooser.selectedFile
        file.writeText(content, Charsets.UTF_8)
        onSuccess(file.absolutePath)
      }
    } catch (_: Exception) {}
  }
}
