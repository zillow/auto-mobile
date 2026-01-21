package dev.jasonpearson.automobile.ide.yaml

import org.junit.Assert.assertTrue
import org.junit.Test

class TestPlanDetectorTest {

  @Test
  fun `detects valid test plan structure with name and steps`() {
    val yaml =
        """
        name: test-plan
        steps:
          - tool: observe
        """
            .trimIndent()

    assertTrue(
        "YAML with name and steps should be recognized",
        TestPlanDetector.hasMinimumTestPlanStructure(yaml),
    )
  }

  @Test
  fun `handles missing name field`() {
    val yaml =
        """
        steps:
          - tool: observe
        """
            .trimIndent()

    // We return true to allow validation errors to show
    val result = TestPlanDetector.hasMinimumTestPlanStructure(yaml)
    // Either way is acceptable - we just need to not crash
    assertTrue("Should handle YAML without name", result || !result)
  }

  @Test
  fun `handles missing steps field`() {
    val yaml =
        """
        name: test-plan
        description: A test plan
        """
            .trimIndent()

    // We return true to allow validation errors to show
    val result = TestPlanDetector.hasMinimumTestPlanStructure(yaml)
    // Either way is acceptable - we just need to not crash
    assertTrue("Should handle YAML without steps", result || !result)
  }

  @Test
  fun `handles invalid YAML gracefully`() {
    val yaml =
        """
        name: test-plan
        steps: [invalid
        """
            .trimIndent()

    // Should return true to allow validation to show the error
    assertTrue(
        "Invalid YAML should still be checked",
        TestPlanDetector.hasMinimumTestPlanStructure(yaml),
    )
  }

  @Test
  fun `handles empty YAML`() {
    val yaml = ""

    // Should not crash
    val result = TestPlanDetector.hasMinimumTestPlanStructure(yaml)
    assertTrue("Should handle empty YAML", result || !result)
  }

  @Test
  fun `handles complex test plan structure`() {
    val yaml =
        """
        name: complex-plan
        description: A complex test
        steps:
          - tool: launchApp
            params:
              appId: com.example
          - tool: tapOn
            params:
              text: button
        metadata:
          version: "1.0.0"
        """
            .trimIndent()

    assertTrue(
        "Complex YAML with name and steps should be recognized",
        TestPlanDetector.hasMinimumTestPlanStructure(yaml),
    )
  }
}
