package com.zillow.automobile.kotlintestauthor.specification

import com.zillow.automobile.kotlintestauthor.model.TestSpecification
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlinx.serialization.json.Json

class TestSpecificationTest {

  @Test
  fun testTestSpecificationDefaults() {
    val spec =
        TestSpecification(
            name = "LoginTest", plan = "test-plans/login.yaml", modulePath = "features/login")

    assertEquals("LoginTest", spec.name)
    assertEquals("test-plans/login.yaml", spec.plan)
    assertEquals("features/login", spec.modulePath)
    assertNull(spec.maxRetries)
    assertFalse(spec.aiAssistance)
    assertNull(spec.timeoutMs)
  }

  @Test
  fun testTestSpecificationWithOptionalValues() {
    val spec =
        TestSpecification(
            name = "ComplexTest",
            plan = "test-plans/complex.yaml",
            modulePath = "app",
            maxRetries = 3,
            aiAssistance = true,
            timeoutMs = 60000L)

    assertEquals("ComplexTest", spec.name)
    assertEquals("test-plans/complex.yaml", spec.plan)
    assertEquals("app", spec.modulePath)
    assertEquals(3, spec.maxRetries)
    assertEquals(true, spec.aiAssistance)
    assertEquals(60000L, spec.timeoutMs)
  }

  @Test
  fun testSerialization() {
    val spec =
        TestSpecification(
            name = "SerialTest",
            plan = "test.yaml",
            modulePath = "features/test",
            maxRetries = 2,
            aiAssistance = true,
            timeoutMs = 30000L)

    val json = Json.encodeToString(TestSpecification.serializer(), spec)
    val deserialized = Json.decodeFromString(TestSpecification.serializer(), json)

    assertEquals(spec, deserialized)
  }
}
