package dev.jasonpearson.automobile.ide.yaml

import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.RangeMarker
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.util.TextRange
import org.junit.After
import org.junit.Before
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TestPlanDocumentListenerTest {

    private lateinit var fakeValidationTrigger: FakeValidationTrigger
    private lateinit var listener: TestPlanDocumentListener
    private lateinit var testDisposable: com.intellij.openapi.Disposable
    private var lintingEnabled = true

    @Before
    fun setUp() {
        testDisposable = com.intellij.openapi.util.Disposer.newDisposable()
        fakeValidationTrigger = FakeValidationTrigger(testDisposable)
        listener = TestPlanDocumentListener(
            validationTrigger = fakeValidationTrigger,
            isLintingEnabled = { lintingEnabled },
            delayMs = 0 // No delay for tests
        )
    }

    @After
    fun tearDown() {
        listener.dispose()
        com.intellij.openapi.util.Disposer.dispose(testDisposable)
    }

    @Test
    fun `does not validate when linting is disabled`() {
        lintingEnabled = false
        val document = createTestDocument()
        val event = createDocumentEvent(document)

        listener.documentChanged(event)

        // Wait for debounce (no delay in tests, but give it a chance)
        Thread.sleep(50)

        assertEquals(0, fakeValidationTrigger.shouldValidateCalls.size)
        assertEquals(0, fakeValidationTrigger.triggerValidationCalls.size)
    }

    @Test
    fun `validates when linting is enabled and document should be validated`() {
        lintingEnabled = true
        fakeValidationTrigger.shouldValidateResult = true

        val document = createTestDocument()
        val event = createDocumentEvent(document)

        listener.documentChanged(event)

        // Wait for debounce
        Thread.sleep(50)

        assertEquals(1, fakeValidationTrigger.shouldValidateCalls.size)
        assertEquals(1, fakeValidationTrigger.triggerValidationCalls.size)
        assertEquals(document, fakeValidationTrigger.triggerValidationCalls[0])
    }

    @Test
    fun `does not trigger validation when shouldValidate returns false`() {
        lintingEnabled = true
        fakeValidationTrigger.shouldValidateResult = false

        val document = createTestDocument()
        val event = createDocumentEvent(document)

        listener.documentChanged(event)

        // Wait for debounce
        Thread.sleep(50)

        assertEquals(1, fakeValidationTrigger.shouldValidateCalls.size)
        assertEquals(0, fakeValidationTrigger.triggerValidationCalls.size,
            "triggerValidation should not be called when shouldValidate returns false")
    }

    @Test
    fun `debounces rapid changes`() {
        lintingEnabled = true
        fakeValidationTrigger.shouldValidateResult = true

        val document = createTestDocument()

        // Create listener with actual delay for debounce test
        val debounceDisposable = com.intellij.openapi.util.Disposer.newDisposable()
        val debounceTrigger = FakeValidationTrigger(debounceDisposable)
        debounceTrigger.shouldValidateResult = true

        val debouncingListener = TestPlanDocumentListener(
            validationTrigger = debounceTrigger,
            isLintingEnabled = { lintingEnabled },
            delayMs = 100 // 100ms delay
        )

        try {
            // Trigger multiple rapid changes
            repeat(5) {
                val event = createDocumentEvent(document)
                debouncingListener.documentChanged(event)
                Thread.sleep(20) // 20ms between changes
            }

            // Wait for debounce period
            Thread.sleep(150)

            // Should only trigger validation once due to debouncing
            assertTrue(debounceTrigger.triggerValidationCalls.size <= 2,
                "Debouncing should reduce validation calls. Got ${debounceTrigger.triggerValidationCalls.size}")
        } finally {
            debouncingListener.dispose()
            com.intellij.openapi.util.Disposer.dispose(debounceDisposable)
        }
    }

    @Test
    fun `cancels pending validations on dispose`() {
        lintingEnabled = true

        val disposeDisposable = com.intellij.openapi.util.Disposer.newDisposable()
        val disposeTrigger = FakeValidationTrigger(disposeDisposable)
        disposeTrigger.shouldValidateResult = true

        val debouncingListener = TestPlanDocumentListener(
            validationTrigger = disposeTrigger,
            isLintingEnabled = { lintingEnabled },
            delayMs = 500 // Long delay
        )

        val document = createTestDocument()
        val event = createDocumentEvent(document)

        debouncingListener.documentChanged(event)

        // Dispose immediately before debounce completes
        debouncingListener.dispose()

        // Wait for what would have been the debounce period
        Thread.sleep(600)

        // Validation should have been cancelled
        assertEquals(0, disposeTrigger.triggerValidationCalls.size,
            "Pending validations should be cancelled on dispose")

        com.intellij.openapi.util.Disposer.dispose(disposeDisposable)
    }

    @Test
    fun `handles multiple different documents`() {
        lintingEnabled = true
        fakeValidationTrigger.shouldValidateResult = true

        val doc1 = createTestDocument("content1")
        val doc2 = createTestDocument("content2")
        val doc3 = createTestDocument("content3")

        listener.documentChanged(createDocumentEvent(doc1))
        listener.documentChanged(createDocumentEvent(doc2))
        listener.documentChanged(createDocumentEvent(doc3))

        // Wait for debounce
        Thread.sleep(50)

        // Should have validated the last document (debouncing cancels earlier ones)
        assertTrue(fakeValidationTrigger.triggerValidationCalls.size >= 1)
    }

    // Helper methods and fakes

    private fun createTestDocument(content: String = "test content"): Document {
        return FakeDocument(content)
    }

    private fun createDocumentEvent(document: Document): DocumentEvent {
        return FakeDocumentEvent(document)
    }

    private class FakeDocument(private val content: String) : Document {
        override fun getText(): String = content
        override fun getText(range: TextRange): String = content
        override fun getCharsSequence(): CharSequence = content
        override fun getImmutableCharSequence(): CharSequence = content
        override fun getTextLength(): Int = content.length
        override fun getLineCount(): Int = content.count { it == '\n' } + 1
        override fun getLineNumber(offset: Int): Int = 0
        override fun getLineStartOffset(line: Int): Int = 0
        override fun getLineEndOffset(line: Int): Int = content.length
        override fun insertString(offset: Int, s: CharSequence) {}
        override fun deleteString(startOffset: Int, endOffset: Int) {}
        override fun replaceString(startOffset: Int, endOffset: Int, s: CharSequence) {}
        override fun setText(text: CharSequence) {}
        override fun isWritable(): Boolean = true
        override fun getModificationStamp(): Long = 0
        override fun fireReadOnlyModificationAttempt() {}
        override fun addDocumentListener(listener: com.intellij.openapi.editor.event.DocumentListener) {}
        override fun removeDocumentListener(listener: com.intellij.openapi.editor.event.DocumentListener) {}
        override fun createRangeMarker(startOffset: Int, endOffset: Int): RangeMarker = throw UnsupportedOperationException()
        override fun createRangeMarker(startOffset: Int, endOffset: Int, surviveOnExternalChange: Boolean): RangeMarker = throw UnsupportedOperationException()
        override fun createGuardedBlock(startOffset: Int, endOffset: Int): RangeMarker = throw UnsupportedOperationException()
        override fun removeGuardedBlock(block: RangeMarker) {}
        override fun getOffsetGuard(offset: Int): RangeMarker? = null
        override fun getRangeGuard(start: Int, end: Int): RangeMarker? = null
        override fun startGuardedBlockChecking() {}
        override fun stopGuardedBlockChecking() {}
        override fun setCyclicBufferSize(bufferSize: Int) {}
        override fun setReadOnly(isReadOnly: Boolean) {}
        override fun <T : Any?> putUserData(key: com.intellij.openapi.util.Key<T>, value: T?) {}
        override fun <T : Any?> getUserData(key: com.intellij.openapi.util.Key<T>): T? = null
        override fun isInBulkUpdate(): Boolean = false
        override fun setInBulkUpdate(value: Boolean) {}
    }

    private class FakeDocumentEvent(private val doc: Document) : DocumentEvent(doc) {
        override fun getDocument(): Document = doc
        override fun getOffset(): Int = 0
        override fun getOldLength(): Int = 0
        override fun getNewLength(): Int = doc.textLength
        override fun getOldFragment(): CharSequence = ""
        override fun getNewFragment(): CharSequence = doc.immutableCharSequence
        override fun getOldTimeStamp(): Long = 0
    }
}
