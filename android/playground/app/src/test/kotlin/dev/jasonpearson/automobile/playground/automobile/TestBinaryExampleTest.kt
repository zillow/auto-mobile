package dev.jasonpearson.automobile.playground.automobile

import dev.jasonpearson.automobile.junit.AutoMobilePlan
import org.junit.Assert.assertNotNull
import org.junit.Test

class TestBinaryExampleTest {
  @Test
  fun testBinaryExample() {
    val plan = AutoMobilePlan("test-plans/test-plan.yaml")
    assertNotNull(plan)
  }
}
