package com.zillow.automobile.kotlintestauthor

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.main
import com.github.ajalt.clikt.parameters.options.convert
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.options.required
import com.zillow.automobile.kotlintestauthor.generator.CodeGenerator
import com.zillow.automobile.kotlintestauthor.generator.FileWriter
import com.zillow.automobile.kotlintestauthor.model.TestSpecification
import com.zillow.automobile.kotlintestauthor.validation.InputValidator
import com.zillow.automobile.kotlintestauthor.validation.ValidationResult
import java.io.File
import kotlin.system.exitProcess

/**
 * Extract Android package name from build.gradle.kts content. Tries namespace first, then falls
 * back to applicationId.
 */
fun extractAndroidPackage(buildContent: String): String? {
  return try {
    // First try to find namespace
    val namespacePattern = Regex("""namespace\s*=\s*["']([^"']+)["']""")
    val namespaceMatch = namespacePattern.find(buildContent)
    if (namespaceMatch != null) {
      return namespaceMatch.groupValues[1]
    }

    // Fall back to applicationId
    val appIdPattern = Regex("""applicationId\s*=\s*["']([^"']+)["']""")
    val appIdMatch = appIdPattern.find(buildContent)
    if (appIdMatch != null) {
      return appIdMatch.groupValues[1]
    }

    null
  } catch (e: Exception) {
    null
  }
}

/** Main CLI application for AutoMobile Kotlin test generation. */
class AutoMobileTestAuthor : CliktCommand(name = "automobile-test-author") {
  private val testName by option("--test-name", "-n", help = "Name of the test method").required()
  private val planPath by option("--plan", "-p", help = "Path to YAML test plan").required()
  private val modulePath by option("--module-path", "-m", help = "Gradle module path").required()
  private val maxRetries by
      option("--max-retries", help = "Maximum retry attempts").convert { it.toInt() }
  private val aiAssistance by option("--ai-assistance", help = "Enable AI assistance").flag()
  private val timeoutMs by
      option("--timeout", help = "Timeout in milliseconds").convert { it.toLong() }

  override fun run() {
    try {
      // Create test specification from CLI parameters
      val spec =
          TestSpecification(
              name = testName,
              plan = planPath,
              modulePath = modulePath,
              maxRetries = maxRetries,
              aiAssistance = aiAssistance,
              timeoutMs = timeoutMs)

      // Validate the specification
      val validator = InputValidator()
      when (val result = validator.validateTestSpecification(spec)) {
        is ValidationResult.Failure -> {
          echo("❌ Validation failed:")
          result.errors.forEach { error -> echo("  • $error") }
          exitProcess(1)
        }

        ValidationResult.Success -> {
          // Generate the test code
          generateTest(spec)
        }
      }
    } catch (e: Exception) {
      echo("❌ Error: ${e.message}")
      exitProcess(1)
    }
  }

  private fun generateTest(spec: TestSpecification) {
    echo(
        "Generating single test: ${spec.name} with plan: ${spec.plan} in module: ${spec.modulePath}")

    echo("📊 Analyzing source packages in ${spec.modulePath}/src/main...")

    // Analyze source code to determine package structure
    val packagePath = packageNameAsPath(spec)
    val packageName = packagePath.replace('/', '.')
    val className = "${spec.name.replaceFirstChar { it.uppercaseChar() }}Test"

    // Calculate the correct output directory using project root
    val currentDir = System.getProperty("user.dir")
    val projectRoot =
        if (currentDir.endsWith("kotlin-test-author")) {
          File(currentDir).parent
        } else {
          currentDir
        }
    val outputDir = "$projectRoot/${spec.modulePath}/src/test/kotlin"

    echo("📦 Determined package: $packageName")
    echo("📁 Output directory: $outputDir")

    // Generate the test code
    val codeGenerator = CodeGenerator()
    val fileSpec = codeGenerator.generateSingleTest(spec, className, packageName)

    // Write to file
    val fileWriter = FileWriter()
    val writtenFile = fileWriter.writeToFile(fileSpec, outputDir)

    echo("✅ Test generation completed successfully!")
    echo("📁 Generated file: ${writtenFile.absolutePath}")
    echo("📦 Package: $packageName")
    echo("🏗️  Class: $className")

    if (spec.maxRetries != null) echo("🔄 Max retries: ${spec.maxRetries}")
    if (aiAssistance) echo("🤖 AI assistance enabled")
    if (spec.timeoutMs != null) echo("⏱️  Timeout: ${spec.timeoutMs}ms")
  }

  /**
   * Explore the existing source code package names, find the greatest common denominator package,
   * suffix with automobile. Use ripgrep if its installed, fallback to find. For Android modules
   * with no source files, parse build.gradle.kts for namespace/applicationId.
   */
  internal fun packageNameAsPath(spec: TestSpecification): String {
    return try {
      // Extract package path using the core logic
      packageNameAsPathCore(spec)
    } catch (e: Exception) {
      // Use echo in the main function since it's part of the CLI command
      echo("⚠️ Could not analyze source packages: ${e.message}")
      echo("📁 Using default: auto-mobile")
      "auto-mobile"
    }
  }

  /** Core logic for determining package path, extracted from packageNameAsPath to be testable. */
  internal fun packageNameAsPathCore(spec: TestSpecification): String {
    // When running from gradle, we need to go back to the project root
    val currentDir = System.getProperty("user.dir")
    val projectRoot =
        if (currentDir.endsWith("kotlin-test-author")) {
          File(currentDir).parent
        } else {
          currentDir
        }

    // Search source directories in priority order
    val sourceDirs =
        listOf(
            "${spec.modulePath}/src/main",
            "${spec.modulePath}/src/commonMain",
            "${spec.modulePath}/src/jvmMain",
            "${spec.modulePath}/src/androidMain")

    val allPackages = mutableSetOf<String>()

    for (sourceDir in sourceDirs) {
      val fullSourceDir = "$projectRoot/$sourceDir"
      if (File(fullSourceDir).exists()) {
        val packages = findPackageNames(fullSourceDir)
        allPackages.addAll(packages)
      }
    }

    if (allPackages.isEmpty()) {
      // Try to extract package from Android build.gradle.kts
      val androidPackage = extractAndroidPackageWithoutEcho(projectRoot, spec.modulePath)
      if (androidPackage != null) {
        val automobilePackage = "$androidPackage.automobile"
        return automobilePackage.replace('.', '/')
      }

      // Default fallback if no packages found
      return "auto-mobile"
    } else {
      val commonPackage = findGreatestCommonDenominator(allPackages)

      // Try to get the namespace from build.gradle.kts for comparison
      val androidPackage = extractAndroidPackageWithoutEcho(projectRoot, spec.modulePath)

      val finalPackage =
          if (androidPackage != null) {
            // Check if the common package matches or is a subpackage of the Android package
            if (commonPackage.startsWith(androidPackage)) {
              commonPackage
            } else if (androidPackage.startsWith(commonPackage) && commonPackage.isNotEmpty()) {
              androidPackage
            } else {
              commonPackage
            }
          } else {
            commonPackage
          }

      val automobilePackage =
          if (finalPackage.isNotEmpty()) {
            "$finalPackage.automobile"
          } else {
            "automobile"
          }

      return automobilePackage.replace('.', '/')
    }
  }

  private fun findPackageNames(sourceDir: String): Set<String> {
    return try {
      if (isCommandAvailable("rg")) {
        findPackagesWithRipgrep(sourceDir)
      } else {
        findPackagesWithFind(sourceDir)
      }
    } catch (e: Exception) {
      echo("⚠️ Error finding packages: ${e.message}")
      emptySet()
    }
  }

  internal fun isCommandAvailable(command: String): Boolean {
    return try {
      ProcessBuilder("which", command).start().waitFor() == 0
    } catch (e: Exception) {
      false
    }
  }

  private fun findPackagesWithRipgrep(sourceDir: String): Set<String> {
    val absoluteSourceDir = File(sourceDir).absolutePath
    echo("🔍 Searching for packages in: $absoluteSourceDir")

    // Check if source directory exists before running ripgrep
    val sourceDirFile = File(absoluteSourceDir)
    if (!sourceDirFile.exists()) {
      echo("📁 Source directory does not exist: $absoluteSourceDir")
      return emptySet()
    }

    val process =
        ProcessBuilder(
                "rg",
                "--type",
                "kotlin",
                "--type",
                "java",
                "^package\\s+([a-zA-Z0-9_.]+)",
                absoluteSourceDir,
                "--only-matching",
                "--replace",
                "\$1",
                "--no-filename")
            .start()

    val output = process.inputStream.bufferedReader().readText()
    val errorOutput = process.errorStream.bufferedReader().readText()

    val exitCode = process.waitFor()

    echo("📝 Ripgrep exit code: $exitCode")
    if (errorOutput.isNotEmpty()) {
      echo("⚠️ Ripgrep stderr: $errorOutput")
    }
    if (output.isNotEmpty()) {
      echo("📄 Ripgrep output: $output")
    }

    // Exit code 1 can mean "no matches found" which is not an error
    if (exitCode > 1) {
      echo("⚠️ Ripgrep failed with exit code: $exitCode")
      return emptySet()
    }

    val packages = output.lines().filter { it.isNotBlank() }.toSet()

    return packages
  }

  private fun findPackagesWithFind(sourceDir: String): Set<String> {
    val packages = mutableSetOf<String>()

    // Check if source directory exists before running find
    val sourceDirFile = File(sourceDir)
    if (!sourceDirFile.exists()) {
      echo("📁 Source directory does not exist: $sourceDir")
      return emptySet()
    }

    // Find all Kotlin and Java files
    val findProcess =
        ProcessBuilder("find", sourceDir, "-name", "*.kt", "-o", "-name", "*.java").start()

    val files = findProcess.inputStream.bufferedReader().readLines()
    val exitCode = findProcess.waitFor()

    if (exitCode != 0) {
      echo("⚠️ Find command failed with exit code: $exitCode")
      return emptySet()
    }

    echo("📄 Found ${files.size} source files to analyze")

    // Extract package declarations from each file
    files.forEach { filePath ->
      try {
        val file = File(filePath)
        if (file.exists()) {
          file.bufferedReader().use { reader ->
            reader
                .lineSequence()
                .take(10) // Only check first 10 lines for package declaration
                .forEach { line ->
                  val trimmed = line.trim()
                  if (trimmed.startsWith("package ")) {
                    val packageName =
                        trimmed
                            .removePrefix("package ")
                            .removeSuffix(";") // Remove semicolon if present (Java)
                            .trim()
                    if (packageName.isNotEmpty()) {
                      packages.add(packageName)
                    }
                  }
                }
          }
        }
      } catch (e: Exception) {
        // Skip files that can't be read
        echo("⚠️ Could not read file: $filePath - ${e.message}")
      }
    }

    return packages
  }

  private fun findGreatestCommonDenominator(packages: Set<String>): String {
    if (packages.isEmpty()) return ""
    if (packages.size == 1) return packages.first()

    val packageParts = packages.map { it.split('.') }
    val minLength = packageParts.minOf { it.size }

    val commonParts = mutableListOf<String>()

    for (i in 0 until minLength) {
      val firstPart = packageParts[0][i]
      if (packageParts.all { it[i] == firstPart }) {
        commonParts.add(firstPart)
      } else {
        break
      }
    }

    return commonParts.joinToString(".")
  }

  private fun extractAndroidPackage(projectRoot: String, modulePath: String): String? {
    return try {
      val buildFile = File("$projectRoot/$modulePath/build.gradle.kts")
      if (!buildFile.exists()) {
        echo("📄 build.gradle.kts not found at: ${buildFile.absolutePath}")
        return null
      }

      echo("📄 Reading Android configuration from: ${buildFile.absolutePath}")
      val buildContent = buildFile.readText()

      val result = extractAndroidPackage(buildContent)
      if (result != null) {
        // Determine if it's namespace or applicationId for logging
        val namespacePattern = Regex("""namespace\s*=\s*["']([^"']+)["']""")
        val hasNamespace = namespacePattern.find(buildContent) != null
        if (hasNamespace) {
          echo("🎯 Found namespace: $result")
        } else {
          echo("🎯 Found applicationId: $result")
        }
      } else {
        echo("⚠️ No namespace or applicationId found in build.gradle.kts")
      }

      result
    } catch (e: Exception) {
      echo("⚠️ Error reading Android build configuration: ${e.message}")
      null
    }
  }

  private fun extractAndroidPackageWithoutEcho(projectRoot: String, modulePath: String): String? {
    return try {
      val buildFile = File("$projectRoot/$modulePath/build.gradle.kts")
      if (!buildFile.exists()) {
        return null
      }

      val buildContent = buildFile.readText()

      val result = extractAndroidPackage(buildContent)
      result
    } catch (e: Exception) {
      null
    }
  }
}

fun main(args: Array<String>) {
  AutoMobileTestAuthor().main(args)
}
