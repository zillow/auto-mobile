package dev.jasonpearson.automobile.ide.yaml
import dev.jasonpearson.automobile.validation.TestPlanValidator
import dev.jasonpearson.automobile.validation.ValidationResult as TestPlanValidationResult
import dev.jasonpearson.automobile.validation.ValidationError as TestPlanValidationError
import dev.jasonpearson.automobile.validation.ValidationSeverity

import dev.jasonpearson.automobile.ide.settings.AutoMobileSettings
import com.intellij.lang.annotation.AnnotationHolder
import com.intellij.lang.annotation.ExternalAnnotator
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiFile
import org.jetbrains.yaml.psi.YAMLFile

/**
 * External annotator that provides real-time YAML validation for AutoMobile test plans.
 * Runs asynchronously to avoid blocking the UI thread.
 */
class TestPlanExternalAnnotator : ExternalAnnotator<PsiFile, TestPlanValidationResult>() {

    /**
     * Collect information from the PSI file (runs on UI thread)
     */
    override fun collectInformation(file: PsiFile): PsiFile? {
        // Check if linting is enabled
        if (!AutoMobileSettings.getInstance().enableYamlLinting) {
            return null
        }

        // Only process YAML files
        if (file !is YAMLFile) {
            return null
        }

        // Check if this is a test plan file
        if (!TestPlanDetector.isTestPlanFile(file.virtualFile)) {
            return null
        }

        // Check if the file has minimum test plan structure
        if (!TestPlanDetector.hasMinimumTestPlanStructure(file.text)) {
            return null
        }

        return file
    }

    /**
     * Perform validation (runs on background thread)
     */
    override fun doAnnotate(file: PsiFile?): TestPlanValidationResult? {
        if (file == null) {
            return null
        }

        return TestPlanValidator.validateYaml(file.text)
    }

    /**
     * Apply annotations to the editor (runs on UI thread)
     */
    override fun apply(
        file: PsiFile,
        annotationResult: TestPlanValidationResult?,
        holder: AnnotationHolder
    ) {
        if (annotationResult == null || annotationResult.valid) {
            return
        }

        for (error in annotationResult.errors) {
            val range = findTextRange(file, error)
            val severity = when (error.severity) {
                ValidationSeverity.ERROR -> HighlightSeverity.ERROR
                ValidationSeverity.WARNING -> HighlightSeverity.WARNING
            }

            holder.newAnnotation(severity, error.message)
                .range(range)
                .create()
        }
    }

    /**
     * Find the text range for an error in the file
     */
    private fun findTextRange(file: PsiFile, error: TestPlanValidationError): TextRange {
        val document = file.viewProvider.document ?: return TextRange(0, 0)

        // If we have line/column information, use it
        val line = error.line
        if (line != null && line > 0) {
            val lineIndex = line - 1
            if (lineIndex < document.lineCount) {
                val lineStartOffset = document.getLineStartOffset(lineIndex)
                val lineEndOffset = document.getLineEndOffset(lineIndex)
                val lineText = document.getText(TextRange(lineStartOffset, lineEndOffset))

                // For tool name errors, highlight the tool value (e.g., "bop") not the key "tool"
                if (error.message.contains("Unknown tool")) {
                    val toolMatch = Regex("Unknown tool '([^']+)'").find(error.message)
                    val toolName = toolMatch?.groupValues?.getOrNull(1)
                    if (toolName != null) {
                        val toolIndex = lineText.indexOf(toolName)
                        if (toolIndex >= 0) {
                            val startOffset = lineStartOffset + toolIndex
                            val endOffset = startOffset + toolName.length
                            return TextRange(startOffset, endOffset)
                        }
                    }
                }

                // Find the field name in the line
                val fieldName = error.field.substringAfterLast('.').substringAfterLast(']')
                val fieldIndex = lineText.indexOf(fieldName)

                if (fieldIndex >= 0) {
                    val startOffset = lineStartOffset + fieldIndex
                    val endOffset = startOffset + fieldName.length
                    return TextRange(startOffset, endOffset)
                }

                // If we can't find the field, highlight the whole line (excluding whitespace)
                val trimmedStart = lineText.indexOfFirst { !it.isWhitespace() }
                if (trimmedStart >= 0) {
                    val startOffset = lineStartOffset + trimmedStart
                    return TextRange(startOffset, lineEndOffset)
                }

                return TextRange(lineStartOffset, lineEndOffset)
            }
        }

        // Fallback: highlight the first line
        if (document.lineCount > 0) {
            return TextRange(0, document.getLineEndOffset(0))
        }

        return TextRange(0, 0)
    }
}
