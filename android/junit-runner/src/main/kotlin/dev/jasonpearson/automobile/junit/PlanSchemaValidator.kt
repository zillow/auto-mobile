package dev.jasonpearson.automobile.junit

import dev.jasonpearson.automobile.validation.TestPlanValidator
import dev.jasonpearson.automobile.validation.ValidationSeverity

/** Result of plan validation (backward-compatible wrapper) */
data class PlanValidationResult(val valid: Boolean, val errors: List<ValidationError> = emptyList())

/** Structured validation error (backward-compatible wrapper) */
data class ValidationError(
    val field: String,
    val message: String,
    val line: Int? = null,
    val column: Int? = null,
)

/**
 * Validates AutoMobile test plan YAML files against JSON schema. This is a backward-compatible
 * wrapper around the shared validation module.
 */
object PlanSchemaValidator {
  /**
   * Validate YAML content against the test plan schema
   *
   * @param yamlContent YAML string to validate
   * @return Validation result with errors if invalid
   */
  fun validateYaml(yamlContent: String): PlanValidationResult {
    // Delegate to shared validator
    val result = TestPlanValidator.validateYaml(yamlContent)

    // Convert to backward-compatible format (filter out warnings, keep only errors)
    val errors =
        result.errors
            .filter { it.severity == ValidationSeverity.ERROR }
            .map { sharedError ->
              ValidationError(
                  field = sharedError.field,
                  message = sharedError.message,
                  line = sharedError.line,
                  column = sharedError.column,
              )
            }

    return PlanValidationResult(valid = result.valid, errors = errors)
  }
}
