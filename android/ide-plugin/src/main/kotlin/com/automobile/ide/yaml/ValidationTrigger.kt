package com.automobile.ide.yaml

import com.intellij.openapi.editor.Document

/**
 * Interface for triggering validation on document changes.
 * Allows for testable implementations without coupling to IntelliJ Platform APIs.
 */
interface ValidationTrigger {
    /**
     * Check if validation should be triggered for this document
     */
    fun shouldValidate(document: Document): Boolean

    /**
     * Trigger validation for the document
     */
    fun triggerValidation(document: Document)
}
