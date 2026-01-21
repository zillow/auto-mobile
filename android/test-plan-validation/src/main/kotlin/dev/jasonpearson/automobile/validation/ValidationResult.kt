package dev.jasonpearson.automobile.validation

/** Severity level for validation errors */
enum class ValidationSeverity {
  ERROR,
  WARNING,
}

/** Result of test plan validation */
data class ValidationResult(val valid: Boolean, val errors: List<ValidationError> = emptyList())

/** Structured validation error with severity and location information */
data class ValidationError(
    val field: String,
    val message: String,
    val severity: ValidationSeverity = ValidationSeverity.ERROR,
    val line: Int? = null,
    val column: Int? = null,
)
