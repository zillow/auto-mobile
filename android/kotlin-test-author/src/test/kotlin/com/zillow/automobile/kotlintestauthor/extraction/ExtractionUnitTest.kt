package com.zillow.automobile.kotlintestauthor.extraction

import com.zillow.automobile.kotlintestauthor.extractAndroidPackage
import java.nio.file.Files
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import org.junit.Test

class ExtractionUnitTest {

  @Test
  fun testMockAndroidBuildFile() {
    val tempDir = Files.createTempDirectory("mock-android-module")
    val buildFile = tempDir.resolve("build.gradle.kts").toFile()

    // Create a mock Android build.gradle.kts file
    val mockBuildContent =
        """
            plugins {
                alias(libs.plugins.android.application)
                alias(libs.plugins.kotlin.android)
            }

            android {
                namespace = "com.example.testapp"
                compileSdk = 35

                defaultConfig {
                    applicationId = "com.example.testapp"
                    minSdk = 24
                    targetSdk = 35
                    versionCode = 1
                    versionName = "1.0"
                }
            }
        """
            .trimIndent()

    buildFile.writeText(mockBuildContent)

    // Test that the function extracts the namespace (priority over applicationId)
    val extractedPackage = extractAndroidPackage(mockBuildContent)
    assertNotNull(extractedPackage, "Should extract package information")
    assertEquals(
        "com.example.testapp", extractedPackage, "Should extract namespace when both are present")

    // Cleanup
    tempDir.toFile().deleteRecursively()
  }

  @Test
  fun testAndroidBuildFileWithOnlyNamespace() {
    val tempDir = Files.createTempDirectory("namespace-only-module")
    val buildFile = tempDir.resolve("build.gradle.kts").toFile()

    // Create a build file with only namespace (no applicationId)
    val buildContent =
        """
            plugins {
                alias(libs.plugins.android.library)
                alias(libs.plugins.kotlin.android)
            }

            android {
                namespace = "com.example.library"
                compileSdk = 35
            }
        """
            .trimIndent()

    buildFile.writeText(buildContent)

    // Test that the function extracts the namespace
    val extractedPackage = extractAndroidPackage(buildContent)
    assertNotNull(extractedPackage, "Should extract namespace")
    assertEquals("com.example.library", extractedPackage, "Should extract correct namespace")

    // Cleanup
    tempDir.toFile().deleteRecursively()
  }

  @Test
  fun testAndroidBuildFileWithOnlyApplicationId() {
    val tempDir = Files.createTempDirectory("appid-only-module")
    val buildFile = tempDir.resolve("build.gradle.kts").toFile()

    // Create a build file with only applicationId (no namespace)
    val buildContent =
        """
            plugins {
                alias(libs.plugins.android.application)
                alias(libs.plugins.kotlin.android)
            }

            android {
                compileSdk = 35

                defaultConfig {
                    applicationId = "com.example.oldapp"
                    minSdk = 24
                    targetSdk = 35
                }
            }
        """
            .trimIndent()

    buildFile.writeText(buildContent)

    // Test that the function falls back to applicationId
    val extractedPackage = extractAndroidPackage(buildContent)
    assertNotNull(extractedPackage, "Should extract applicationId")
    assertEquals("com.example.oldapp", extractedPackage, "Should extract correct applicationId")

    // Cleanup
    tempDir.toFile().deleteRecursively()
  }

  @Test
  fun testEmptyAndroidBuildFile() {
    val tempDir = Files.createTempDirectory("empty-module")
    val buildFile = tempDir.resolve("build.gradle.kts").toFile()

    // Create a minimal build file with no package information
    val buildContent =
        """
            plugins {
                alias(libs.plugins.android.application)
            }

            android {
                compileSdk = 35
            }
        """
            .trimIndent()

    buildFile.writeText(buildContent)

    // Test that the function returns null when no package info is found
    val extractedPackage = extractAndroidPackage(buildContent)
    assertNull(extractedPackage, "Should not extract package information from minimal build file")

    // Cleanup
    tempDir.toFile().deleteRecursively()
  }

  @Test
  fun testMalformedBuildContent() {
    // Test with malformed/invalid content
    val malformedContent =
        """
        this is not valid gradle content
        namespace = "broken
        applicationId = incomplete
    """
            .trimIndent()

    val extractedPackage = extractAndroidPackage(malformedContent)
    assertNull(extractedPackage, "Should handle malformed content gracefully")
  }

  @Test
  fun testDifferentQuoteStyles() {
    // Test with single quotes
    val singleQuoteContent =
        """
        android {
            namespace = 'com.example.singlequote'
        }
    """
            .trimIndent()

    val extractedPackage1 = extractAndroidPackage(singleQuoteContent)
    assertEquals("com.example.singlequote", extractedPackage1, "Should handle single quotes")

    // Test with double quotes
    val doubleQuoteContent =
        """
        android {
            namespace = "com.example.doublequote"
        }
    """
            .trimIndent()

    val extractedPackage2 = extractAndroidPackage(doubleQuoteContent)
    assertEquals("com.example.doublequote", extractedPackage2, "Should handle double quotes")
  }

  @Test
  fun testWhitespaceVariations() {
    // Test with various whitespace patterns
    val whitespaceContent =
        """
        android {
            namespace="com.example.nospace"
            compileSdk = 35

            defaultConfig {
                applicationId   =   "com.example.spaces"
            }
        }
    """
            .trimIndent()

    val extractedPackage = extractAndroidPackage(whitespaceContent)
    assertEquals(
        "com.example.nospace", extractedPackage, "Should handle various whitespace patterns")
  }

  @Test
  fun testNamespacePriorityOverApplicationId() {
    // When both are present, namespace should take priority
    val bothPresentContent =
        """
        android {
            namespace = "com.example.namespace"

            defaultConfig {
                applicationId = "com.example.appid"
            }
        }
    """
            .trimIndent()

    val extractedPackage = extractAndroidPackage(bothPresentContent)
    assertEquals(
        "com.example.namespace",
        extractedPackage,
        "Namespace should take priority over applicationId")
  }

  @Test
  fun testEmptyContent() {
    val extractedPackage = extractAndroidPackage("")
    assertNull(extractedPackage, "Should handle empty content")
  }
}
