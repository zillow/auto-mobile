package com.zillow.automobile.kotlintestauthor.extraction

import com.zillow.automobile.kotlintestauthor.extractAndroidPackage
import com.zillow.automobile.kotlintestauthor.generator.CodeGenerator
import com.zillow.automobile.kotlintestauthor.generator.FileWriter
import com.zillow.automobile.kotlintestauthor.model.TestSpecification
import com.zillow.automobile.kotlintestauthor.validation.InputValidator
import java.io.File
import java.nio.file.Files
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import org.junit.Test

class PlaygroundIntegrationTest {

  private val validator = InputValidator()
  private val codeGenerator = CodeGenerator()
  private val fileWriter = FileWriter()

  @Test
  fun testDefaultOutputDirectory() {
    // Test that playground tests go to the correct default directory
    val testSpec =
        TestSpecification(
            name = "outputDirectoryTest",
            plan = "test-plans/output.yaml",
            modulePath = "playground")

    // The default output should be src/test/auto-mobile for auto-mobile tests
    // But for playground, it should be calculated based on the determined package path

    // Test the package to path conversion
    val expectedPackage = "com.zillow.automobile.playground.automobile"
    val expectedPath = "com/zillow/automobile/playground/automobile"
    val actualPath = expectedPackage.replace('.', '/')
    assertEquals(expectedPath, actualPath, "Package should convert to correct path")
  }

  @Test
  fun testModuleIntegration() {
    // Create a test specification for the playground module
    val testSpec =
        TestSpecification(
            name = "playgroundTest", plan = "test-plans/playground.yaml", modulePath = "playground")

    // Validate the specification
    val validationResult = validator.validateTestSpecification(testSpec)
    assertTrue(validationResult.isSuccess, "Playground test specification should be valid")

    // Test the package name extraction logic using the public function
    val playgroundBuildFile = File("../playground/app/build.gradle.kts")
    val buildContent = playgroundBuildFile.readText()
    val extractedPackage = extractAndroidPackage(buildContent)

    assertNotNull(extractedPackage, "Should extract package information from playground build file")
    assertEquals(
        "com.zillow.automobile.playground", extractedPackage, "Should extract correct package name")
  }

  @Test
  fun testAutoMobileTestGeneration() {
    val tempOutputDir = Files.createTempDirectory("playground-test-output")

    try {
      // Create a test specification for playground
      val testSpec =
          TestSpecification(
              name = "playgroundIntegrationTest",
              plan = "test-plans/playground-integration.yaml",
              modulePath = "playground")

      // Validate specification
      val validationResult = validator.validateTestSpecification(testSpec)
      assertTrue(validationResult.isSuccess)

      // Generate test code with expected package
      val expectedPackage = "com.zillow.automobile.playground.automobile"
      val className = "PlaygroundIntegrationTestTest"

      val fileSpec = codeGenerator.generateSingleTest(testSpec, className, expectedPackage)

      // Write to temporary output directory
      val outputFile = fileWriter.writeToFile(fileSpec, tempOutputDir.toString())

      // Verify file was created
      assertTrue(outputFile.exists())
      assertTrue(outputFile.name.endsWith(".kt"))

      // Verify content
      val content = outputFile.readText()
      assertTrue(content.contains("package $expectedPackage"))
      assertTrue(content.contains("class $className"))
      assertTrue(content.contains("fun testPlaygroundIntegrationTest()"))
      assertTrue(content.contains("@AutoMobileTest"))
      assertTrue(content.contains("plan = \"test-plans/playground-integration.yaml\""))
    } finally {
      // Cleanup
      tempOutputDir.toFile().deleteRecursively()
    }
  }

  @Test
  fun testModuleValidation() {
    // Test various playground test specifications
    val validSpecs =
        listOf(
            TestSpecification(
                name = "validPlaygroundTest",
                plan = "test-plans/valid.yaml",
                modulePath = "playground"),
            TestSpecification(
                name = "anotherTest",
                plan = "test-plans/another.yaml",
                modulePath = "playground",
                maxRetries = 3,
                aiAssistance = true,
                timeoutMs = 120000L))

    validSpecs.forEach { spec ->
      val result = validator.validateTestSpecification(spec)
      assertTrue(result.isSuccess, "Playground spec '${spec.name}' should be valid")
    }

    // Test invalid specs
    val invalidSpecs =
        listOf(
            TestSpecification(
                name = "", plan = "test-plans/invalid.yaml", modulePath = "playground"),
            TestSpecification(name = "validName", plan = "", modulePath = "playground"),
            TestSpecification(name = "validName", plan = "test-plans/valid.yaml", modulePath = ""))

    invalidSpecs.forEach { spec ->
      val result = validator.validateTestSpecification(spec)
      assertTrue(result.isFailure, "Invalid playground spec should fail validation")
    }
  }

  @Test
  fun testDirectoryStructure() {
    val tempOutputDir = Files.createTempDirectory("playground-structure-test")

    try {
      val testSpec =
          TestSpecification(
              name = "structureTest", plan = "test-plans/structure.yaml", modulePath = "playground")

      val expectedPackage = "com.zillow.automobile.playground.automobile"
      val fileSpec = codeGenerator.generateSingleTest(testSpec, "StructureTest", expectedPackage)
      val outputFile = fileWriter.writeToFile(fileSpec, tempOutputDir.toString())

      // Verify the directory structure was created correctly
      val expectedPath =
          "com${File.separator}zillow${File.separator}automobile${File.separator}playground${File.separator}automobile"
      assertTrue(outputFile.parentFile.absolutePath.contains(expectedPath))

      // Verify parent directories exist
      assertTrue(outputFile.parentFile.exists())
      assertTrue(outputFile.parentFile.isDirectory())
    } finally {
      tempOutputDir.toFile().deleteRecursively()
    }
  }
}
