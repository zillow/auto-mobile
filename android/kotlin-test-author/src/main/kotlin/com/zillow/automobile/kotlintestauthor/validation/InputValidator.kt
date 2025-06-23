package com.zillow.automobile.kotlintestauthor.validation

import com.zillow.automobile.kotlintestauthor.model.TestSpecification
import java.nio.file.Path
import kotlin.io.path.exists

/** Validates input parameters for test generation. */
class InputValidator {

  /** Validate a single test specification. */
  fun validateTestSpecification(spec: TestSpecification): ValidationResult {
    val errors = mutableListOf<String>()

    // Validate test name
    if (spec.name.isBlank()) {
      errors.add("Test name cannot be blank")
    } else if (!isValidKotlinIdentifier(spec.name)) {
      errors.add("Test name '${spec.name}' is not a valid Kotlin identifier")
    }

    // Validate plan path
    if (spec.plan.isBlank()) {
      errors.add("Plan path cannot be blank")
    } else if (!spec.plan.endsWith(".yaml") && !spec.plan.endsWith(".yml")) {
      errors.add("Plan path '${spec.plan}' must be a YAML file (.yaml or .yml extension)")
    }

    // Validate module path
    if (spec.modulePath.isBlank()) {
      errors.add("Module path cannot be blank")
    }

    // Validate optional numeric parameters
    spec.maxRetries?.let { maxRetries ->
      if (maxRetries < 0) {
        errors.add("maxRetries cannot be negative")
      }
    }

    spec.timeoutMs?.let { timeoutMs ->
      if (timeoutMs <= 0) {
        errors.add("timeoutMs must be positive")
      }
    }

    return if (errors.isEmpty()) {
      ValidationResult.Success
    } else {
      ValidationResult.Failure(errors)
    }
  }

  /** Validate that a file path exists and is readable. */
  fun validateFilePath(filePath: String): ValidationResult {
    return try {
      val path = Path.of(filePath)
      when {
        !path.exists() -> ValidationResult.Failure(listOf("File does not exist: $filePath"))
        !path.toFile().canRead() ->
            ValidationResult.Failure(listOf("File is not readable: $filePath"))
        else -> ValidationResult.Success
      }
    } catch (e: Exception) {
      ValidationResult.Failure(listOf("Invalid file path: $filePath - ${e.message}"))
    }
  }

  /** Validate output directory path. */
  fun validateOutputDirectory(outputDirectory: String): ValidationResult {
    return try {
      val outputPath = Path.of(outputDirectory)
      val errors = mutableListOf<String>()

      // Check if parent directory exists
      val parentDir = outputPath.parent
      if (parentDir != null && !parentDir.exists()) {
        errors.add("Parent directory does not exist: $parentDir")
      }

      // Check if directory exists and is writable
      if (outputPath.exists()) {
        val file = outputPath.toFile()
        if (!file.isDirectory()) {
          errors.add("Output path exists but is not a directory: $outputDirectory")
        } else if (!file.canWrite()) {
          errors.add("Output directory is not writable: $outputDirectory")
        }
      }

      if (errors.isEmpty()) {
        ValidationResult.Success
      } else {
        ValidationResult.Failure(errors)
      }
    } catch (e: Exception) {
      ValidationResult.Failure(listOf("Invalid output directory: $outputDirectory - ${e.message}"))
    }
  }

  /** Check if a string is a valid Kotlin identifier. */
  private fun isValidKotlinIdentifier(name: String): Boolean {
    if (name.isEmpty()) return false

    // Check first character
    if (!name.first().isLetter() && name.first() != '_') return false

    // Check remaining characters
    return name.all { it.isLetterOrDigit() || it == '_' }
  }
}

/** Represents the result of a validation operation. */
sealed class ValidationResult {
  object Success : ValidationResult()

  data class Failure(val errors: List<String>) : ValidationResult()

  val isSuccess: Boolean
    get() = this is Success

  val isFailure: Boolean
    get() = this is Failure
}
