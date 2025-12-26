package dev.jasonpearson.automobile.playground.automobile

import dev.jasonpearson.automobile.junit.AutoMobileTest
import org.junit.Test

class TestJarExampleTest {
  @Test
  @AutoMobileTest(plan = "test-plan.yaml")
  fun testJarExample() {
    // Test method body can be empty or contain setup/teardown
  }
}
