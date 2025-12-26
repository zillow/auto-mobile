package dev.jasonpearson.automobile.playground.automobile

import dev.jasonpearson.automobile.junit.AutoMobileTest
import org.junit.Test

class TestPlaygroundMainTest {
  @Test
  @AutoMobileTest(plan = "test-plan.yaml")
  fun testPlaygroundMain() {
    // Test method body can be empty or contain setup/teardown
  }
}
