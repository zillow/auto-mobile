package com.zillow.automobile.kotlintestauthor.generator

import com.squareup.kotlinpoet.AnnotationSpec
import com.squareup.kotlinpoet.ClassName
import com.squareup.kotlinpoet.FileSpec
import com.squareup.kotlinpoet.FunSpec
import com.squareup.kotlinpoet.KModifier
import com.squareup.kotlinpoet.TypeSpec
import com.zillow.automobile.kotlintestauthor.model.TestSpecification
import org.junit.Test

/**
 * Builder class for generating Kotlin test classes with AutoMobile annotations. Uses KotlinPoet to
 * create properly formatted test files.
 */
internal class TestClassBuilder(private val className: String, private val packageName: String) {
  private val testMethods = mutableListOf<FunSpec>()

  /** Add a test method with AutoMobile annotation to the class. */
  internal fun addTestMethod(spec: TestSpecification): TestClassBuilder {
    val autoMobileAnnotation =
        AnnotationSpec.builder(ClassName("com.zillow.automobile.junit", "AutoMobileTest"))
            .apply {
              addMember("plan = %S", spec.plan)

              spec.maxRetries?.let { maxRetries -> addMember("maxRetries = %L", maxRetries) }

              if (spec.aiAssistance) {
                addMember("aiAssistance = %L", spec.aiAssistance)
              }

              spec.timeoutMs?.let { timeoutMs -> addMember("timeoutMs = %L", timeoutMs) }
            }
            .build()

    val testMethod =
        FunSpec.builder(generateTestMethodName(spec.name))
            .addAnnotation(Test::class)
            .addAnnotation(autoMobileAnnotation)
            .addComment("Test method body can be empty or contain setup/teardown")
            .addModifiers(KModifier.PUBLIC, KModifier.PUBLIC)
            .build()

    testMethods.add(testMethod)
    return this
  }

  /** Build the complete test class with all configured test methods. */
  internal fun build(): TypeSpec {
    return TypeSpec.classBuilder(className)
        .addFunctions(testMethods)
        .addModifiers(KModifier.PUBLIC, KModifier.PUBLIC)
        .build()
  }

  /** Generate the complete file specification including package and imports. */
  internal fun buildFileSpec(): FileSpec {
    return FileSpec.builder(packageName, className)
        .addType(build())
        .addImport("org.junit", "Test")
        .addImport("com.zillow.automobile.junit", "AutoMobileTest")
        .build()
  }

  /**
   * Generate a proper test method name from the test specification name. Ensures the method name is
   * a valid Kotlin identifier.
   */
  internal fun generateTestMethodName(testName: String): String {
    val sanitized = testName.replace(Regex("[^a-zA-Z0-9]"), "")
    val methodName =
        if (sanitized.isNotEmpty()) {
          sanitized.first().lowercaseChar() + sanitized.drop(1)
        } else {
          "test"
        }

    return if (methodName.startsWith("test")) {
      methodName
    } else {
      "test${methodName.first().uppercaseChar()}${methodName.drop(1)}"
    }
  }
}
