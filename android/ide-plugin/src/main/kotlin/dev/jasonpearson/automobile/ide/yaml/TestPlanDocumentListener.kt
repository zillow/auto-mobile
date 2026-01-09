package dev.jasonpearson.automobile.ide.yaml

import dev.jasonpearson.automobile.ide.settings.AutoMobileSettings
import com.intellij.openapi.editor.event.BulkAwareDocumentListener
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.util.Alarm

/**
 * Document listener that triggers validation for test plan YAML files on content changes.
 * This ensures error counts and highlights update in real-time without requiring file save.
 *
 * Performance characteristics:
 * - Debouncing (300ms) avoids excessive processing during rapid typing
 * - Lightweight checks run on pooled thread (not EDT)
 * - Validation trigger handles all async work off EDT
 */
class TestPlanDocumentListener(
    private val validationTrigger: ValidationTrigger,
    private val isLintingEnabled: () -> Boolean = { AutoMobileSettings.getInstance().enableYamlLinting },
    private val delayMs: Int = 300
) : BulkAwareDocumentListener {

    private val alarm = Alarm(Alarm.ThreadToUse.POOLED_THREAD, validationTrigger as? com.intellij.openapi.Disposable)

    override fun documentChanged(event: DocumentEvent) {
        if (!isLintingEnabled()) {
            return
        }

        // Debounce rapid changes to avoid excessive processing
        alarm.cancelAllRequests()
        alarm.addRequest({
            processDocumentChange(event)
        }, delayMs)
    }

    private fun processDocumentChange(event: DocumentEvent) {
        val document = event.document

        // Check if this document should be validated
        if (!validationTrigger.shouldValidate(document)) {
            return
        }

        // Trigger validation (handles async work internally)
        validationTrigger.triggerValidation(document)
    }

    fun dispose() {
        alarm.cancelAllRequests()
    }
}
