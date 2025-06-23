package com.zillow.automobile.kotlintestauthor.generator

import com.squareup.kotlinpoet.FileSpec
import com.zillow.automobile.kotlintestauthor.model.TestSpecification
import java.io.File
import java.nio.file.Path
import kotlin.io.path.createDirectories
import kotlin.io.path.exists

/** Core code generation logic for converting test specifications to Kotlin test files. */
class CodeGenerator {

  /** Generate a test class from a single test specification. */
  fun generateSingleTest(
      spec: TestSpecification,
      className: String = "${spec.name.toCamelCase()}Test",
      packageName: String = "com.example.tests"
  ): FileSpec {
    return TestClassBuilder(className, packageName).addTestMethod(spec).buildFileSpec()
  }
}

/** Handles writing generated code to appropriate file locations. */
class FileWriter {

  /** Write the generated FileSpec to the specified output directory. */
  fun writeToFile(fileSpec: FileSpec, outputDirectory: String): File {
    val outputPath = Path.of(outputDirectory)

    // Create directories if they don't exist
    if (!outputPath.exists()) {
      outputPath.createDirectories()
    }

    val outputFile = outputPath.toFile()
    fileSpec.writeTo(outputFile)

    // Return the actual file that was written
    val packagePath = fileSpec.packageName.replace('.', File.separatorChar)
    val writtenFile = File(outputFile, "$packagePath${File.separator}${fileSpec.name}.kt")

    // Post-process the file to remove redundant public modifiers if configured
    if (shouldOmitPublicModifiers()) {
      removeRedundantPublicModifiers(writtenFile)
    }

    return writtenFile
  }

  /**
   * Check if public modifiers should be omitted based on configuration. Reads from Gradle
   * properties or environment variables. Default is true.
   */
  private fun shouldOmitPublicModifiers(): Boolean {
    val propertyName = "automobile.testauthoring.omitPublic"
    val envVarName = "AUTOMOBILE_TESTAUTHORING_OMITPUBLIC"

    // First check system properties (set by Gradle)
    System.getProperty(propertyName)?.let { value ->
      return value.toBoolean()
    }

    // Then check environment variables
    System.getenv(envVarName)?.let { value ->
      return value.toBoolean()
    }

    // Default to true
    return true
  }

  /**
   * Remove redundant public modifiers from generated Kotlin code. This is done as a post-processing
   * step since KotlinPoet adds explicit public modifiers for compatibility with explicit API mode.
   */
  fun removeRedundantPublicModifiers(file: File) {
    if (!file.exists()) return

    val content = file.readText()
    val modifiedContent =
        content
            .replace(Regex("^public class ", RegexOption.MULTILINE), "class ")
            .replace(Regex("^  public fun ", RegexOption.MULTILINE), "  fun ")

    file.writeText(modifiedContent)
  }

  /** Validate that the output directory is writable. */
  fun validateOutputDirectory(outputDirectory: String): Result<Unit> {
    return try {
      val outputPath = Path.of(outputDirectory)
      val parentDir = outputPath.parent

      if (parentDir != null && !parentDir.exists()) {
        Result.failure(IllegalArgumentException("Parent directory does not exist: $parentDir"))
      } else if (outputPath.exists() && !outputPath.toFile().canWrite()) {
        Result.failure(
            IllegalArgumentException("Output directory is not writable: $outputDirectory"))
      } else {
        Result.success(Unit)
      }
    } catch (e: Exception) {
      Result.failure(e)
    }
  }
}

/** Extension function to convert strings to CamelCase for class names. */
private fun String.toCamelCase(): String {
  return this.split(Regex("[^a-zA-Z0-9]+"))
      .filter { it.isNotEmpty() }
      .joinToString("") { word ->
        if (word.isNotEmpty()) {
          word.first().uppercaseChar() + word.drop(1).lowercase()
        } else {
          word
        }
      }
}
