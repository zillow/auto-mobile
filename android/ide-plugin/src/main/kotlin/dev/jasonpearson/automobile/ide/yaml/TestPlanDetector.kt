package dev.jasonpearson.automobile.ide.yaml

import com.intellij.openapi.vfs.VirtualFile
import org.yaml.snakeyaml.Yaml

/**
 * Detects if a YAML file is an AutoMobile test plan based on:
 * 1. Location in any test-plans directory
 * 2. Minimum schema requirements (has 'name' and 'steps' fields)
 */
object TestPlanDetector {
    private val yaml = Yaml()

    /**
     * Check if a file should be treated as an AutoMobile test plan
     */
    fun isTestPlanFile(file: VirtualFile): Boolean {
        // Check if file is in a test-plans directory
        if (!isInTestPlansDirectory(file)) {
            return false
        }

        // File must be a YAML file
        val extension = file.extension?.lowercase()
        if (extension != "yaml" && extension != "yml") {
            return false
        }

        return true
    }

    /**
     * Check if a file is located in a test-plans directory
     */
    private fun isInTestPlansDirectory(file: VirtualFile): Boolean {
        var current: VirtualFile? = file.parent
        while (current != null) {
            if (current.name == "test-plans") {
                return true
            }
            current = current.parent
        }
        return false
    }

    /**
     * Check if YAML content has minimum test plan structure (name and steps)
     */
    fun hasMinimumTestPlanStructure(content: String): Boolean {
        return try {
            val parsed = yaml.load<Map<String, Any>>(content)
            parsed != null && parsed.containsKey("name") && parsed.containsKey("steps")
        } catch (e: Exception) {
            // If we can't parse it, we might still want to show schema errors
            // so return true to allow validation
            true
        }
    }
}
