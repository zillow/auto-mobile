package com.automobile.ide.yaml

import com.intellij.openapi.Disposable
import com.intellij.openapi.editor.Document

/**
 * Fake implementation of ValidationTrigger for testing.
 * Tracks calls and allows controlling validation behavior.
 */
class FakeValidationTrigger(
    private val parentDisposable: Disposable? = null
) : ValidationTrigger, Disposable {
    private val _shouldValidateCalls = mutableListOf<Document>()
    private val _triggerValidationCalls = mutableListOf<Document>()

    var shouldValidateResult: Boolean = true

    val shouldValidateCalls: List<Document> get() = _shouldValidateCalls
    val triggerValidationCalls: List<Document> get() = _triggerValidationCalls

    override fun shouldValidate(document: Document): Boolean {
        _shouldValidateCalls.add(document)
        return shouldValidateResult
    }

    override fun triggerValidation(document: Document) {
        _triggerValidationCalls.add(document)
    }

    fun reset() {
        _shouldValidateCalls.clear()
        _triggerValidationCalls.clear()
        shouldValidateResult = true
    }

    override fun dispose() {
        // No cleanup needed
    }
}
