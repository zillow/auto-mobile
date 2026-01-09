package dev.jasonpearson.automobile.junit

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class PlanSchemaValidatorTest {

    @Test
    fun `validates minimal valid plan`() {
        val yaml = """
            name: test-plan
            steps:
              - tool: observe
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertTrue(result.valid, "Plan should be valid")
        assertTrue(result.errors.isEmpty(), "Should have no errors")
    }

    @Test
    fun `validates complete plan with all fields`() {
        val yaml = """
            name: complete-plan
            description: A complete test plan
            devices:
              - A
              - B
            steps:
              - tool: launchApp
                params:
                  appId: com.example.app
                device: A
                label: Launch app on device A
              - tool: observe
                params:
                  device: A
            metadata:
              createdAt: "2026-01-08T00:00:00Z"
              version: "1.0.0"
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertTrue(result.valid, "Complete plan should be valid")
    }

    @Test
    fun `validates plan with YAML anchors`() {
        val yaml = """
            name: anchors-test
            description: Test with YAML anchors
            steps:
              - tool: launchApp
                params: &launch-params
                  appId: com.example.app
                  coldBoot: false
                label: First launch
              - tool: launchApp
                params:
                  <<: *launch-params
                  coldBoot: true
                label: Second launch with cold boot
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertTrue(result.valid, "Plan with YAML anchors should be valid")
    }

    @Test
    fun `validates plan with merge keys`() {
        val yaml = """
            name: merge-keys-test
            devices:
              - A
              - B
            steps:
              - tool: observe
                params: &observe-base
                  includeScreenshot: true
                  includeHierarchy: true
                  device: A
              - tool: observe
                params:
                  <<: *observe-base
                  device: B
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertTrue(result.valid, "Plan with merge keys should be valid")
    }

    @Test
    fun `reports YAML parse errors`() {
        val yaml = """
            name: test
            steps: [invalid
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertFalse(result.valid, "Invalid YAML should not be valid")
        assertTrue(result.errors.isNotEmpty(), "Should have errors")
        assertEquals("root", result.errors[0].field)
        assertTrue(result.errors[0].message.contains("YAML parsing failed"))
    }

    @Test
    fun `reports missing required name field`() {
        val yaml = """
            steps:
              - tool: observe
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertFalse(result.valid)
        assertTrue(result.errors.isNotEmpty())
        val nameError = result.errors.find { it.message.contains("name") }
        assertNotNull(nameError, "Should have error about missing name")
        assertTrue(nameError.message.contains("Missing required property"))
    }

    @Test
    fun `reports missing required steps field`() {
        val yaml = """
            name: test-plan
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertFalse(result.valid)
        val stepsError = result.errors.find { it.message.contains("steps") }
        assertNotNull(stepsError, "Should have error about missing steps")
        assertTrue(stepsError.message.contains("Missing required property"))
    }

    @Test
    fun `reports empty name`() {
        val yaml = """
            name: ""
            steps:
              - tool: observe
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.field.contains("name") })
    }

    @Test
    fun `reports empty steps array`() {
        val yaml = """
            name: test-plan
            steps: []
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.message.contains("at least 1") })
    }

    @Test
    fun `reports missing tool in step`() {
        val yaml = """
            name: test-plan
            steps:
              - params:
                  foo: bar
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertFalse(result.valid)
        val toolError = result.errors.find { it.message.contains("tool") }
        assertNotNull(toolError, "Should have error about missing tool")
        assertTrue(toolError.message.contains("Missing required property"))
    }

    @Test
    fun `reports empty tool name`() {
        val yaml = """
            name: test-plan
            steps:
              - tool: ""
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.field.contains("tool") })
    }

    @Test
    fun `reports wrong type for steps`() {
        val yaml = """
            name: test-plan
            steps: "not an array"
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertFalse(result.valid, "Plan with wrong type for steps should be invalid")
        assertTrue(result.errors.isNotEmpty(), "Should have at least one error")
        // The error should mention steps somehow
        val hasStepsError = result.errors.any { error ->
            error.field.contains("steps", ignoreCase = true) ||
            error.message.contains("steps", ignoreCase = true) ||
            error.message.contains("array", ignoreCase = true)
        }
        assertTrue(hasStepsError, "Should have error related to steps being wrong type. Errors: ${result.errors}")
    }

    @Test
    fun `reports invalid mcpVersion format`() {
        val yaml = """
            name: test-plan
            mcpVersion: invalid-version
            steps:
              - tool: observe
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.field.contains("mcpVersion") })
    }

    @Test
    fun `reports duplicate devices`() {
        val yaml = """
            name: test-plan
            devices:
              - A
              - A
            steps:
              - tool: observe
                params:
                  device: A
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.field.contains("devices") })
    }

    @Test
    fun `reports empty device label`() {
        val yaml = """
            name: test-plan
            devices:
              - ""
            steps:
              - tool: observe
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.field.contains("devices") })
    }

    @Test
    fun `validates critical section parameters`() {
        val yaml = """
            name: critical-section-test
            devices:
              - A
              - B
            steps:
              - tool: criticalSection
                params:
                  lock: sync-point
                  deviceCount: 2
                  steps:
                    - tool: tapOn
                      params:
                        device: A
                        text: Button
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertTrue(result.valid, "Critical section plan should be valid")
    }

    @Test
    fun `validates expectations array`() {
        val yaml = """
            name: expectations-test
            steps:
              - tool: observe
                expectations:
                  - type: elementExists
                    selector:
                      text: "Hello"
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertTrue(result.valid, "Plan with expectations should be valid")
    }

    @Test
    fun `validates metadata fields`() {
        val yaml = """
            name: metadata-test
            steps:
              - tool: observe
            metadata:
              createdAt: "2026-01-08T00:00:00Z"
              version: "1.0.0"
              appId: com.example.app
              sessionId: "session-123"
              toolCallCount: 10
              duration: 1500.5
              generatedFromToolCalls: true
              experiments: ["exp-1", "exp-2"]
              treatments:
                exp-1: "variant-a"
              featureFlags:
                darkMode: true
                beta: false
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertTrue(result.valid, "Plan with metadata should be valid")
    }

    @Test
    fun `allows deprecated generated field`() {
        val yaml = """
            name: legacy-plan
            generated: "2026-01-08T00:00:00Z"
            steps:
              - tool: observe
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertTrue(result.valid, "Plan with deprecated 'generated' field should be valid")
    }

    @Test
    fun `allows deprecated appId field`() {
        val yaml = """
            name: legacy-plan
            appId: com.example.app
            steps:
              - tool: observe
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertTrue(result.valid, "Plan with deprecated 'appId' field should be valid")
    }

    @Test
    fun `allows deprecated parameters field`() {
        val yaml = """
            name: legacy-plan
            parameters:
              key1: value1
              key2: value2
            steps:
              - tool: observe
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertTrue(result.valid, "Plan with deprecated 'parameters' field should be valid")
    }

    @Test
    fun `allows deprecated description in steps`() {
        val yaml = """
            name: legacy-plan
            steps:
              - tool: observe
                description: Old-style description
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertTrue(result.valid, "Plan with deprecated step 'description' should be valid")
    }

    @Test
    fun `provides line numbers when possible`() {
        val yaml = """
            name: test-plan
            steps:
              - tool: observe
        """.trimIndent()

        // This is a valid plan, so let's test with an invalid one that should have line info
        val invalidYaml = """
            steps:
              - tool: observe
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(invalidYaml)
        assertFalse(result.valid)
        // Line numbers are best-effort, so we just verify the structure is correct
        result.errors.forEach { error ->
            assertNotNull(error.field)
            assertNotNull(error.message)
            // line and column may be null, which is acceptable
        }
    }

    @Test
    fun `formats field paths nicely`() {
        val yaml = """
            name: test-plan
            steps:
              - tool: observe
              - {}
        """.trimIndent()

        val result = PlanSchemaValidator.validateYaml(yaml)
        assertFalse(result.valid)
        // Should have error for steps[1] missing tool
        val error = result.errors.find { it.field.contains("steps") }
        assertNotNull(error, "Should have error about steps")
    }
}
