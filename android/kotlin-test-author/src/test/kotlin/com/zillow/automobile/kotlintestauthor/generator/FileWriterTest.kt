package com.zillow.automobile.kotlintestauthor.generator

import java.io.File
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class FileWriterTest {

  private lateinit var fileWriter: FileWriter
  private val tempFiles = mutableListOf<File>()

  @BeforeTest
  fun setUp() {
    fileWriter = FileWriter()
  }

  @AfterTest
  fun tearDown() {
    // Clean up temp files
    tempFiles.forEach { file ->
      if (file.exists()) {
        file.delete()
      }
    }
    tempFiles.clear()
  }

  private fun createTempFile(content: String): File {
    val tempFile = File.createTempFile("test", ".kt")
    tempFile.writeText(content)
    tempFiles.add(tempFile)
    return tempFile
  }

  @Test
  fun `removeRedundantPublicModifiers should remove public from class declaration`() {
    // Given
    val originalContent =
        """
package com.example

import org.junit.Test

public class TestClass {
  fun someMethod() {
    // method body
  }
}
        """
            .trimIndent()

    val testFile = createTempFile(originalContent)

    // When
    fileWriter.removeRedundantPublicModifiers(testFile)

    // Then
    val modifiedContent = testFile.readText()
    val expectedContent =
        """
package com.example

import org.junit.Test

class TestClass {
  fun someMethod() {
    // method body
  }
}
        """
            .trimIndent()

    assertEquals(expectedContent, modifiedContent)
  }

  @Test
  fun `removeRedundantPublicModifiers should remove public from function declaration`() {
    // Given
    val originalContent =
        """
package com.example

class TestClass {
  public fun testMethod() {
    // method body
  }
}
        """
            .trimIndent()

    val testFile = createTempFile(originalContent)

    // When
    fileWriter.removeRedundantPublicModifiers(testFile)

    // Then
    val modifiedContent = testFile.readText()
    val expectedContent =
        """
package com.example

class TestClass {
  fun testMethod() {
    // method body
  }
}
        """
            .trimIndent()

    assertEquals(expectedContent, modifiedContent)
  }

  @Test
  fun `removeRedundantPublicModifiers should remove both public class and function modifiers`() {
    // Given
    val originalContent =
        """
package com.example

import org.junit.Test

public class TestPlaygroundMainTest {
  @Test
  public fun testPlaygroundMain() {
    // Test method body can be empty or contain setup/teardown
  }
}
        """
            .trimIndent()

    val testFile = createTempFile(originalContent)

    // When
    fileWriter.removeRedundantPublicModifiers(testFile)

    // Then
    val modifiedContent = testFile.readText()
    val expectedContent =
        """
package com.example

import org.junit.Test

class TestPlaygroundMainTest {
  @Test
  fun testPlaygroundMain() {
    // Test method body can be empty or contain setup/teardown
  }
}
        """
            .trimIndent()

    assertEquals(expectedContent, modifiedContent)
  }

  @Test
  fun `removeRedundantPublicModifiers should not modify content without public modifiers`() {
    // Given
    val originalContent =
        """
package com.example

class TestClass {
  fun testMethod() {
    // method body
  }
}
        """
            .trimIndent()

    val testFile = createTempFile(originalContent)

    // When
    fileWriter.removeRedundantPublicModifiers(testFile)

    // Then
    val modifiedContent = testFile.readText()
    assertEquals(originalContent, modifiedContent)
  }

  @Test
  fun `removeRedundantPublicModifiers should handle non-existent file gracefully`() {
    // Given
    val nonExistentFile = File("NonExistent${System.currentTimeMillis()}.kt")

    // When/Then - should not throw exception
    fileWriter.removeRedundantPublicModifiers(nonExistentFile)

    // Verify file still doesn't exist
    assertTrue(!nonExistentFile.exists())
  }

  @Test
  fun `removeRedundantPublicModifiers should only remove line-starting public modifiers`() {
    // Given
    val originalContent =
        """
package com.example

public class TestClass {
  // This comment mentions public class but should not be changed
  public fun testMethod() {
    println("This is a public method call but should not be changed")
  }
}
        """
            .trimIndent()

    val testFile = createTempFile(originalContent)

    // When
    fileWriter.removeRedundantPublicModifiers(testFile)

    // Then
    val modifiedContent = testFile.readText()
    val expectedContent =
        """
package com.example

class TestClass {
  // This comment mentions public class but should not be changed
  fun testMethod() {
    println("This is a public method call but should not be changed")
  }
}
        """
            .trimIndent()

    assertEquals(expectedContent, modifiedContent)
  }

  @Test
  fun `writeToFile should omit public modifiers by default`() {
    // Given - no system property or environment variable set
    System.clearProperty("automobile.testauthoring.omitPublic")

    val originalContent =
        """
package com.example

public class TestClass {
  public fun testMethod() {
    // method body
  }
}
        """
            .trimIndent()

    val testFile = createTempFile(originalContent)

    // When
    val result = fileWriter.writeToFile(createTestFileSpec(), testFile.parent)

    // Then - should remove public modifiers by default
    val modifiedContent = result.readText()
    assertTrue(modifiedContent.contains("class TestClass"))
    assertTrue(modifiedContent.contains("fun testMethod"))
    assertTrue(!modifiedContent.contains("public class"))
    assertTrue(!modifiedContent.contains("public fun"))
  }

  @Test
  fun `writeToFile should preserve public modifiers when omitPublic is false`() {
    // Given
    System.setProperty("automobile.testauthoring.omitPublic", "false")

    try {
      val testFile = createTempFile("")

      // When
      val result = fileWriter.writeToFile(createTestFileSpec(), testFile.parent)

      // Then - should preserve public modifiers
      val modifiedContent = result.readText()
      assertTrue(modifiedContent.contains("public class TestClass"))
      assertTrue(modifiedContent.contains("public fun testMethod"))
    } finally {
      System.clearProperty("automobile.testauthoring.omitPublic")
    }
  }

  @Test
  fun `writeToFile should respect environment variable when system property not set`() {
    // Given - clear system property
    System.clearProperty("automobile.testauthoring.omitPublic")

    // Note: We can't easily test environment variables in unit tests since they're set at JVM
    // startup
    // This test documents the expected behavior

    val testFile = createTempFile("")

    // When
    val result = fileWriter.writeToFile(createTestFileSpec(), testFile.parent)

    // Then - should default to true (omit public modifiers)
    val modifiedContent = result.readText()
    assertTrue(modifiedContent.contains("class TestClass"))
    assertTrue(!modifiedContent.contains("public class"))
  }

  private fun createTestFileSpec(): com.squareup.kotlinpoet.FileSpec {
    return com.squareup.kotlinpoet.FileSpec.builder("com.example", "TestClass")
        .addType(
            com.squareup.kotlinpoet.TypeSpec.classBuilder("TestClass")
                .addFunction(com.squareup.kotlinpoet.FunSpec.builder("testMethod").build())
                .build())
        .build()
  }
}
