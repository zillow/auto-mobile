package dev.jasonpearson.automobile.playground.automobile

import dev.jasonpearson.automobile.junit.AutoMobileTest
import org.junit.Test

class TestExampleTest {
  @Test
  @AutoMobileTest(
      plan = "test-plan.yaml",
      aiAssistance = true,
  )
  fun testExample() {
    // Test method body can be empty or contain setup/teardown
  }
}
