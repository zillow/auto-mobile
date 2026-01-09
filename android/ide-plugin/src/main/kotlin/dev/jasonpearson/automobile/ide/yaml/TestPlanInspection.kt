package dev.jasonpearson.automobile.ide.yaml
import dev.jasonpearson.automobile.validation.TestPlanValidator
import dev.jasonpearson.automobile.validation.ValidationResult as TestPlanValidationResult
import dev.jasonpearson.automobile.validation.ValidationError as TestPlanValidationError
import dev.jasonpearson.automobile.validation.ValidationSeverity

import dev.jasonpearson.automobile.ide.settings.AutoMobileSettings
import com.intellij.codeInspection.LocalInspectionTool
import com.intellij.codeInspection.ProblemHighlightType
import com.intellij.codeInspection.ProblemsHolder
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiElementVisitor
import org.jetbrains.yaml.psi.YAMLFile
import org.jetbrains.yaml.psi.YAMLKeyValue

/**
 * Inspection that validates AutoMobile test plan YAML files against the schema.
 * Can be run via Code → Inspect Code for batch validation.
 */
class TestPlanInspection : LocalInspectionTool() {

    override fun buildVisitor(holder: ProblemsHolder, isOnTheFly: Boolean): PsiElementVisitor {
        return object : PsiElementVisitor() {
            override fun visitElement(element: PsiElement) {
                // Only check the root element of the file
                if (element.parent != null) {
                    return
                }

                val file = element.containingFile
                if (file !is YAMLFile) {
                    return
                }

                // Check if linting is enabled
                if (!AutoMobileSettings.getInstance().enableYamlLinting) {
                    return
                }

                // Check if this is a test plan file
                if (!TestPlanDetector.isTestPlanFile(file.virtualFile)) {
                    return
                }

                // Check if the file has minimum test plan structure
                if (!TestPlanDetector.hasMinimumTestPlanStructure(file.text)) {
                    return
                }

                // Perform validation
                val result = TestPlanValidator.validateYaml(file.text)
                if (result.valid) {
                    return
                }

                // Register problems
                for (error in result.errors) {
                    val target = findTargetElement(file, error) ?: element
                    val highlightType = when (error.severity) {
                        ValidationSeverity.ERROR -> ProblemHighlightType.ERROR
                        ValidationSeverity.WARNING -> ProblemHighlightType.WARNING
                    }

                    val quickFixes = TestPlanQuickFixFactory.createQuickFixes(error)

                    if (quickFixes.isNotEmpty()) {
                        holder.registerProblem(
                            target,
                            error.message,
                            highlightType,
                            *quickFixes.toTypedArray()
                        )
                    } else {
                        holder.registerProblem(
                            target,
                            error.message,
                            highlightType
                        )
                    }
                }
            }
        }
    }

    /**
     * Find the PSI element that corresponds to the validation error
     */
    private fun findTargetElement(file: YAMLFile, error: TestPlanValidationError): PsiElement? {
        // For tool name errors, try to find the specific tool value element
        if (error.message.contains("Unknown tool")) {
            val toolMatch = Regex("Unknown tool '([^']+)'").find(error.message)
            val toolName = toolMatch?.groupValues?.getOrNull(1)
            if (toolName != null) {
                // Find the 'tool' key and then get its value
                val toolKeyValue = findKeyValue(file, "tool")
                if (toolKeyValue != null) {
                    // Get the value element (the tool name itself)
                    return toolKeyValue.value
                }
            }
        }

        // Try to find the element by field name
        val fieldName = error.field.substringAfterLast('.').substringAfterLast(']')

        // Search for YAML key-value pairs that match the field name
        return findKeyValue(file, fieldName)
    }

    /**
     * Recursively search for a YAML key-value pair with the given key
     */
    private fun findKeyValue(element: PsiElement, key: String): YAMLKeyValue? {
        if (element is YAMLKeyValue && element.keyText == key) {
            return element
        }

        for (child in element.children) {
            val found = findKeyValue(child, key)
            if (found != null) {
                return found
            }
        }

        return null
    }

    override fun getDisplayName(): String = "AutoMobile Test Plan Validation"

    override fun getGroupDisplayName(): String = "AutoMobile"

    override fun getShortName(): String = "AutoMobileTestPlanValidation"

    override fun isEnabledByDefault(): Boolean = true
}
