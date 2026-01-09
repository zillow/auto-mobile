package dev.jasonpearson.automobile.ide.yaml

import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiDocumentManager
import org.jetbrains.yaml.psi.YAMLFile

/**
 * IntelliJ Platform implementation of ValidationTrigger.
 * Handles real-time validation updates with minimal EDT usage.
 */
class IntellijValidationTrigger(
    private val project: Project
) : ValidationTrigger {

    override fun shouldValidate(document: Document): Boolean {
        val virtualFile = FileDocumentManager.getInstance().getFile(document) ?: return false
        return TestPlanDetector.isTestPlanFile(virtualFile)
    }

    override fun triggerValidation(document: Document) {
        // Use non-blocking read action to check PSI off EDT
        ReadAction.nonBlocking<Boolean> {
            checkIfValidYamlFile(document)
        }
            .inSmartMode(project)
            .expireWith(project)
            .coalesceBy(this, document)
            .finishOnUiThread(com.intellij.openapi.application.ModalityState.nonModal()) { isValidYamlFile ->
                if (isValidYamlFile) {
                    commitDocument(document)
                }
            }
            .submit(com.intellij.util.concurrency.AppExecutorUtil.getAppExecutorService())
    }

    private fun checkIfValidYamlFile(document: Document): Boolean {
        val psiDocumentManager = PsiDocumentManager.getInstance(project)
        val psiFile = psiDocumentManager.getPsiFile(document)
        return psiFile is YAMLFile && psiFile.isValid
    }

    private fun commitDocument(document: Document) {
        if (!project.isDisposed) {
            PsiDocumentManager.getInstance(project).commitDocument(document)
        }
    }
}
