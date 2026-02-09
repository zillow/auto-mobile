package dev.jasonpearson.automobile.ide.yaml

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.vfs.VirtualFile

/**
 * Listens for file open/close events and attaches a [TestPlanDocumentListener] only to
 * test plan YAML files. This replaces the former [TestPlanValidationService] which registered
 * a global document listener via EditorFactory but was never instantiated (getInstance was
 * never called).
 *
 * Registered as a `projectListeners` entry in plugin.xml so the IntelliJ platform manages
 * its lifecycle automatically.
 */
class TestPlanFileEditorListener : FileEditorManagerListener {

    private val log = Logger.getInstance(TestPlanFileEditorListener::class.java)
    private val listeners = mutableMapOf<VirtualFile, TestPlanDocumentListener>()

    override fun fileOpened(source: FileEditorManager, file: VirtualFile) {
        if (!TestPlanDetector.isTestPlanFile(file)) return

        val document = FileDocumentManager.getInstance().getDocument(file) ?: return
        val project = source.project
        val validationTrigger = IntellijValidationTrigger(project)
        val listener = TestPlanDocumentListener(validationTrigger, project)
        document.addDocumentListener(listener)
        listeners[file] = listener
        log.info("Attached test plan document listener to ${file.name}")
    }

    override fun fileClosed(source: FileEditorManager, file: VirtualFile) {
        val listener = listeners.remove(file) ?: return
        listener.dispose()
        log.info("Removed test plan document listener from ${file.name}")
    }
}
