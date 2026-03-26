package dev.jasonpearson.automobile.playground.automobile

import dev.jasonpearson.automobile.junit.AutoMobilePlan
import org.junit.Assert.assertNotNull
import org.junit.Test

class TestExampleTest {
  @Test
  fun testExample() {
    val plan = AutoMobilePlan("test-plans/test-plan.yaml")
    assertNotNull(plan)
  }
}
