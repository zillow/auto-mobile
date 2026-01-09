package dev.jasonpearson.automobile.validation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class TestPlanValidatorTest {

    // ========== Valid Plan Tests ==========

    @Test
    fun `validates minimal valid plan`() {
        val yaml = """
            name: test-plan
            steps:
              - tool: observe
        """.trimIndent()

        val result = TestPlanValidator.validateYaml(yaml)
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

        val result = TestPlanValidator.validateYaml(yaml)
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

        val result = TestPlanValidator.validateYaml(yaml)
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

        val result = TestPlanValidator.validateYaml(yaml)
        assertTrue(result.valid, "Plan with merge keys should be valid")
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

        val result = TestPlanValidator.validateYaml(yaml)
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

        val result = TestPlanValidator.validateYaml(yaml)
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

        val result = TestPlanValidator.validateYaml(yaml)
        assertTrue(result.valid, "Plan with metadata should be valid")
    }

    // ========== YAML Parsing Tests ==========

    @Test
    fun `reports YAML parse errors`() {
        val yaml = """
            name: test
            steps: [invalid
        """.trimIndent()

        val result = TestPlanValidator.validateYaml(yaml)
        assertFalse(result.valid, "Invalid YAML should not be valid")
        assertTrue(result.errors.isNotEmpty(), "Should have errors")
        assertEquals("root", result.errors[0].field)
        assertTrue(result.errors[0].message.contains("YAML parsing failed"))
    }

    // ========== Required Field Tests ==========

    @Test
    fun `reports missing required name field`() {
        val yaml = """
            steps:
              - tool: observe
        """.trimIndent()

        val result = TestPlanValidator.validateYaml(yaml)
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

        val result = TestPlanValidator.validateYaml(yaml)
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

        val result = TestPlanValidator.validateYaml(yaml)
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.field.contains("name") })
    }

    @Test
    fun `reports empty steps array`() {
        val yaml = """
            name: test-plan
            steps: []
        """.trimIndent()

        val result = TestPlanValidator.validateYaml(yaml)
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

        val result = TestPlanValidator.validateYaml(yaml)
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

        val result = TestPlanValidator.validateYaml(yaml)
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.field.contains("tool") })
    }

    // ========== Type Validation Tests ==========

    @Test
    fun `reports wrong type for steps`() {
        val yaml = """
            name: test-plan
            steps: "not an array"
        """.trimIndent()

        val result = TestPlanValidator.validateYaml(yaml)
        assertFalse(result.valid, "Plan with wrong type for steps should be invalid")
        assertTrue(result.errors.isNotEmpty(), "Should have at least one error")
        val hasStepsError = result.errors.any { error ->
            error.field.contains("steps", ignoreCase = true) ||
            error.message.contains("steps", ignoreCase = true) ||
            error.message.contains("array", ignoreCase = true)
        }
        assertTrue(hasStepsError, "Should have error related to steps being wrong type. Errors: ${result.errors}")
    }

    // ========== Field Validation Tests ==========

    @Test
    fun `reports invalid mcpVersion format`() {
        val yaml = """
            name: test-plan
            mcpVersion: invalid-version
            steps:
              - tool: observe
        """.trimIndent()

        val result = TestPlanValidator.validateYaml(yaml)
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

        val result = TestPlanValidator.validateYaml(yaml)
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

        val result = TestPlanValidator.validateYaml(yaml)
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.field.contains("devices") })
    }

    @Test
    fun `detects unknown property as error`() {
        val yaml = """
            name: test-plan
            steps:
              - tool: observe
            unknownField: value
        """.trimIndent()

        val result = TestPlanValidator.validateYaml(yaml)
        assertFalse(result.valid, "YAML with unknown property should fail validation")
        val unknownError = result.errors.find { it.message.contains("unknownField") }
        assertNotNull(unknownError, "Should report unknown property")
    }

    // ========== Deprecated Field Tests ==========

    @Test
    fun `allows deprecated generated field with warning`() {
        val yaml = """
            name: legacy-plan
            generated: "2026-01-08T00:00:00Z"
            steps:
              - tool: observe
        """.trimIndent()

        val result = TestPlanValidator.validateYaml(yaml)
        // Deprecated fields should still validate but may have warnings
        val warningErrors = result.errors.filter { it.severity == ValidationSeverity.WARNING }
        val hasDeprecatedWarning = warningErrors.any { it.message.contains("generated") || it.message.contains("deprecated") }
        assertTrue(hasDeprecatedWarning || result.valid, "Plan with deprecated 'generated' field should be valid or have warning")
    }

    @Test
    fun `allows deprecated appId field with warning`() {
        val yaml = """
            name: legacy-plan
            appId: com.example.app
            steps:
              - tool: observe
        """.trimIndent()

        val result = TestPlanValidator.validateYaml(yaml)
        // Deprecated fields should still validate but may have warnings
        val warningErrors = result.errors.filter { it.severity == ValidationSeverity.WARNING }
        val hasDeprecatedWarning = warningErrors.any { it.message.contains("appId") || it.message.contains("deprecated") }
        assertTrue(hasDeprecatedWarning || result.valid, "Plan with deprecated 'appId' field should be valid or have warning")
    }

    @Test
    fun `allows deprecated parameters field with warning`() {
        val yaml = """
            name: legacy-plan
            parameters:
              key1: value1
              key2: value2
            steps:
              - tool: observe
        """.trimIndent()

        val result = TestPlanValidator.validateYaml(yaml)
        // Deprecated fields should still validate but may have warnings
        val warningErrors = result.errors.filter { it.severity == ValidationSeverity.WARNING }
        val hasDeprecatedWarning = warningErrors.any { it.message.contains("parameters") || it.message.contains("deprecated") }
        assertTrue(hasDeprecatedWarning || result.valid, "Plan with deprecated 'parameters' field should be valid or have warning")
    }

    @Test
    fun `allows deprecated description in steps with warning`() {
        val yaml = """
            name: legacy-plan
            steps:
              - tool: observe
                description: Old-style description
        """.trimIndent()

        val result = TestPlanValidator.validateYaml(yaml)
        // Deprecated fields should still validate but may have warnings
        val warningErrors = result.errors.filter { it.severity == ValidationSeverity.WARNING }
        val hasDeprecatedWarning = warningErrors.any { it.message.contains("description") || it.message.contains("deprecated") }
        assertTrue(hasDeprecatedWarning || result.valid, "Plan with deprecated step 'description' should be valid or have warning")
    }

    // ========== Tool Name Validation Tests ==========

    @Test
    fun `detects invalid tool name`() {
        val yaml = """
            name: test-plan
            steps:
              - tool: invalidTool
        """.trimIndent()

        val result = TestPlanValidator.validateYaml(yaml)
        assertFalse(result.valid, "YAML with invalid tool should fail validation")
        val toolError = result.errors.find { it.message.contains("Unknown tool") && it.message.contains("invalidTool") }
        assertNotNull(toolError, "Should report unknown tool")
    }

    @Test
    fun `accepts valid tool names`() {
        val yaml = """
            name: test-plan
            steps:
              - tool: observe
              - tool: tapOn
                params:
                  selector:
                    testTag: button
              - tool: launchApp
                params:
                  appId: com.example.app
        """.trimIndent()

        val result = TestPlanValidator.validateYaml(yaml)
        assertTrue(result.valid, "YAML with valid tools should pass validation: ${result.errors}")
    }

    @Test
    fun `detects multiple invalid tool names`() {
        val yaml = """
            name: test-plan
            steps:
              - tool: invalidTool1
              - tool: observe
              - tool: invalidTool2
        """.trimIndent()

        val result = TestPlanValidator.validateYaml(yaml)
        assertFalse(result.valid, "YAML with invalid tools should fail validation")
        val tool1Error = result.errors.find { it.message.contains("invalidTool1") }
        val tool2Error = result.errors.find { it.message.contains("invalidTool2") }
        assertNotNull(tool1Error, "Should report first invalid tool")
        assertNotNull(tool2Error, "Should report second invalid tool")
    }

    // ========== Error Reporting Tests ==========

    @Test
    fun `provides line numbers when possible`() {
        val invalidYaml = """
            steps:
              - tool: observe
        """.trimIndent()

        val result = TestPlanValidator.validateYaml(invalidYaml)
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

        val result = TestPlanValidator.validateYaml(yaml)
        assertFalse(result.valid)
        // Should have error for steps[1] missing tool
        val error = result.errors.find { it.field.contains("steps") }
        assertNotNull(error, "Should have error about steps")
    }
}
