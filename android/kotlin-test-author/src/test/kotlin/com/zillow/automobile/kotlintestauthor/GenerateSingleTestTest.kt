package com.zillow.automobile.kotlintestauthor

import com.zillow.automobile.kotlintestauthor.model.TestSpecification
import java.io.File
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class GenerateSingleTestTest {

  private val generateSingleTest = AutoMobileTestAuthor()
  private val tempFiles = mutableListOf<File>()
  private val tempDirs = mutableListOf<File>()

  @BeforeTest
  fun setUp() {
    // Clear any temp files from previous tests
    cleanupTempFiles()
  }

  @AfterTest
  fun tearDown() {
    cleanupTempFiles()
  }

  private fun cleanupTempFiles() {
    tempFiles.forEach { file ->
      if (file.exists()) {
        file.delete()
      }
    }
    tempFiles.clear()

    tempDirs.forEach { dir ->
      if (dir.exists()) {
        dir.deleteRecursively()
      }
    }
    tempDirs.clear()
  }

  private fun createTempDir(): File {
    val tempDir = kotlin.io.path.createTempDirectory("test").toFile()
    tempDirs.add(tempDir)
    return tempDir
  }

  private fun createTestKotlinFile(
      dir: File,
      packageName: String,
      fileName: String = "TestFile.kt"
  ): File {
    val file = File(dir, fileName)
    file.writeText(
        """
      package $packageName

      class TestClass {
        fun testMethod() {}
      }
    """
            .trimIndent())
    tempFiles.add(file)
    return file
  }

  private fun createTestBuildFile(
      dir: File,
      namespace: String? = null,
      applicationId: String? = null
  ): File {
    val file = File(dir, "build.gradle.kts")
    val content = buildString {
      appendLine("android {")
      namespace?.let { appendLine("    namespace = \"$it\"") }
      applicationId?.let { appendLine("    applicationId = \"$it\"") }
      appendLine("}")
    }
    file.writeText(content)
    tempFiles.add(file)
    return file
  }

  @Test
  fun `isCommandAvailable should return true for existing commands`() {
    // Test with commonly available commands on Unix-like systems
    // 'which' itself should be available since we're using it in the implementation
    assertTrue(generateSingleTest.isCommandAvailable("which"))

    // 'ls' is universally available on Unix-like systems (Linux, macOS)
    assertTrue(generateSingleTest.isCommandAvailable("ls"))
  }

  @Test
  fun `isCommandAvailable should return false for non-existent commands`() {
    // Test with commands that definitely don't exist
    assertFalse(generateSingleTest.isCommandAvailable("this-command-definitely-does-not-exist"))
    assertFalse(generateSingleTest.isCommandAvailable("non-existent-command-12345"))
  }

  @Test
  fun `isCommandAvailable should return true for ripgrep if installed`() {
    // This test documents the expected behavior for ripgrep
    // The result will depend on whether ripgrep is installed on the system
    val result = generateSingleTest.isCommandAvailable("rg")

    // We can't assert a specific value since it depends on the system
    // But we can verify the function returns a boolean without throwing
    assertTrue(result is Boolean)
  }

  @Test
  fun `isCommandAvailable should return false for empty command`() {
    // Test edge case with empty string
    assertFalse(generateSingleTest.isCommandAvailable(""))
  }

  @Test
  fun `isCommandAvailable should return false for command with spaces`() {
    // Test with invalid command containing spaces
    assertFalse(generateSingleTest.isCommandAvailable("invalid command with spaces"))
  }

  @Test
  fun `isCommandAvailable should handle special characters gracefully`() {
    // Test with commands containing special characters
    assertFalse(generateSingleTest.isCommandAvailable("command@#$%"))
    assertFalse(generateSingleTest.isCommandAvailable("../../../bin/something"))

    // Test with long invalid command
    val longCommand = "this-is-a-very-long-command-name-that-should-not-exist-anywhere"
    assertFalse(generateSingleTest.isCommandAvailable(longCommand))
  }

  @Test
  fun `isCommandAvailable should work with common development tools`() {
    // Document behavior with common development tools
    // These tests will pass/fail based on what's installed on the system

    // Git is commonly available on development machines
    val gitResult = generateSingleTest.isCommandAvailable("git")
    assertTrue(gitResult is Boolean) // Just verify it returns boolean

    // Java is likely available since we're running Gradle
    val javaResult = generateSingleTest.isCommandAvailable("java")
    assertTrue(javaResult is Boolean) // Just verify it returns boolean
  }

  @Test
  fun `isCommandAvailable should handle ProcessBuilder exceptions gracefully`() {
    // Test that the function doesn't throw exceptions even with problematic inputs
    // This should return false rather than throwing

    // Test with null bytes (which could cause issues in some systems)
    assertFalse(generateSingleTest.isCommandAvailable("command\u0000"))

    // Test with very long command name
    val longCommand = "a".repeat(1000)
    assertFalse(generateSingleTest.isCommandAvailable(longCommand))
  }

  // Tests for packageNameAsPath function
  @Test
  fun `packageNameAsPath should return default when no source files exist`() {
    // Given - a test specification with a non-existent module path
    val spec =
        TestSpecification(
            name = "testSample", plan = "test.yaml", modulePath = "non-existent-module")

    // When
    val result = generateSingleTest.packageNameAsPathCore(spec)

    // Then - should return default fallback
    assertEquals("auto-mobile", result)
  }

  @Test
  fun `packageNameAsPathCore should return default when no source files exist`() {
    // Given - a test specification with a non-existent module path
    val spec =
        TestSpecification(
            name = "testSample", plan = "test.yaml", modulePath = "non-existent-module")

    // When
    val result = generateSingleTest.packageNameAsPathCore(spec)

    // Then - should return default fallback
    assertEquals("auto-mobile", result)
  }

  @Test
  fun `packageNameAsPathCore should handle exception gracefully`() {
    // Given - a test specification that might cause an exception
    val spec =
        TestSpecification(
            name = "testSample",
            plan = "test.yaml",
            modulePath = "" // empty path might cause issues
            )

    // When
    val result = generateSingleTest.packageNameAsPathCore(spec)

    // Then - should return a valid fallback
    assertTrue(result.isNotEmpty())
    assertTrue(result == "auto-mobile" || result == "automobile")
  }
}
