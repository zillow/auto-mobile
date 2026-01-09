package dev.jasonpearson.automobile.junit

import com.networknt.schema.JsonSchema
import com.networknt.schema.JsonSchemaFactory
import com.networknt.schema.SpecVersion
import com.networknt.schema.ValidationMessage
import org.yaml.snakeyaml.Yaml

/**
 * Result of plan validation
 */
data class PlanValidationResult(
    val valid: Boolean,
    val errors: List<ValidationError> = emptyList()
)

/**
 * Structured validation error
 */
data class ValidationError(
    val field: String,
    val message: String,
    val line: Int? = null,
    val column: Int? = null
)

/**
 * Validates AutoMobile test plan YAML files against JSON schema.
 * This validator uses the same schema as the TypeScript MCP server to ensure
 * consistency between Kotlin and TypeScript validation.
 */
object PlanSchemaValidator {
    private var schema: JsonSchema? = null
    private val yaml = Yaml()

    /**
     * Load the JSON schema from resources
     */
    @Synchronized
    private fun loadSchema(): JsonSchema {
        if (schema != null) {
            return schema!!
        }

        val schemaStream = javaClass.classLoader.getResourceAsStream("schemas/test-plan.schema.json")
            ?: throw IllegalStateException(
                "Could not find test-plan.schema.json in classpath resources. " +
                "Ensure schemas/test-plan.schema.json is included in the JAR resources."
            )

        val schemaJson = schemaStream.bufferedReader().use { it.readText() }

        val factory = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7)
        schema = factory.getSchema(schemaJson)

        return schema!!
    }

    /**
     * Validate YAML content against the test plan schema
     * @param yamlContent YAML string to validate
     * @return Validation result with errors if invalid
     */
    fun validateYaml(yamlContent: String): PlanValidationResult {
        val schema = loadSchema()

        // Parse YAML to object
        val parsedObject: Any?
        try {
            parsedObject = yaml.load(yamlContent)
        } catch (e: Exception) {
            return PlanValidationResult(
                valid = false,
                errors = listOf(
                    ValidationError(
                        field = "root",
                        message = "YAML parsing failed: ${e.message}"
                    )
                )
            )
        }

        // Convert to JSON string for validation
        // The JSON schema validator expects JSON, so we convert YAML -> Object -> JSON
        val jsonString = try {
            kotlinx.serialization.json.Json.encodeToString(
                kotlinx.serialization.json.JsonElement.serializer(),
                convertToJsonElement(parsedObject)
            )
        } catch (e: Exception) {
            return PlanValidationResult(
                valid = false,
                errors = listOf(
                    ValidationError(
                        field = "root",
                        message = "Failed to convert YAML to JSON: ${e.message}"
                    )
                )
            )
        }

        // Validate against schema
        val validationMessages: Set<ValidationMessage> = schema.validate(
            com.fasterxml.jackson.databind.ObjectMapper().readTree(jsonString)
        )

        if (validationMessages.isEmpty()) {
            return PlanValidationResult(valid = true)
        }

        // Format validation errors
        val errors = validationMessages.map { msg ->
            formatError(msg, yamlContent)
        }

        return PlanValidationResult(
            valid = false,
            errors = errors
        )
    }

    /**
     * Convert a YAML-parsed object to kotlinx.serialization JsonElement
     */
    private fun convertToJsonElement(obj: Any?): kotlinx.serialization.json.JsonElement {
        return when (obj) {
            null -> kotlinx.serialization.json.JsonNull
            is String -> kotlinx.serialization.json.JsonPrimitive(obj)
            is Number -> kotlinx.serialization.json.JsonPrimitive(obj)
            is Boolean -> kotlinx.serialization.json.JsonPrimitive(obj)
            is Map<*, *> -> {
                val map = obj.entries.associate { (k, v) ->
                    k.toString() to convertToJsonElement(v)
                }
                kotlinx.serialization.json.JsonObject(map)
            }
            is List<*> -> {
                val list = obj.map { convertToJsonElement(it) }
                kotlinx.serialization.json.JsonArray(list)
            }
            else -> kotlinx.serialization.json.JsonPrimitive(obj.toString())
        }
    }

    /**
     * Format a validation error message
     */
    private fun formatError(msg: ValidationMessage, yamlContent: String): ValidationError {
        // Get the field path from the validation message
        var field = msg.instanceLocation?.toString() ?: "root"

        // Remove leading /
        if (field.startsWith("/")) {
            field = field.substring(1)
        }

        // Convert JSON pointer format to more readable format
        // e.g., /steps/0/tool -> steps[0].tool
        field = field.replace(Regex("/([0-9]+)"), "[$1]").replace("/", ".")

        if (field.isEmpty()) {
            field = "root"
        }

        // Extract friendly error message from the validation message
        val rawMessage = msg.message ?: "Validation error"
        val messageType = msg.type ?: ""

        // Create more user-friendly messages based on error type
        val message = when {
            messageType == "required" || rawMessage.contains("required") -> {
                // Try to extract property name from message
                val propertyMatch = Regex("required property '([^']+)'").find(rawMessage)
                val property = propertyMatch?.groupValues?.getOrNull(1) ?: "property"
                "Missing required property '$property'"
            }
            messageType.contains("additionalProperties") || rawMessage.contains("additional") -> {
                val propertyMatch = Regex("property '([^']+)'").find(rawMessage)
                val property = propertyMatch?.groupValues?.getOrNull(1) ?: "property"
                "Unknown property '$property'. This might be a legacy field - check the migration guide."
            }
            messageType == "enum" || rawMessage.contains("enum") -> {
                "Must be one of the allowed values"
            }
            messageType == "type" || rawMessage.contains("type") -> {
                rawMessage
            }
            messageType.contains("minItems") || rawMessage.contains("minimum") -> {
                rawMessage
            }
            messageType.contains("minLength") -> {
                rawMessage
            }
            else -> rawMessage
        }

        // Try to find line number for the field in YAML
        val lineInfo = findLineNumber(yamlContent, field)

        return ValidationError(
            field = field.ifEmpty { "root" },
            message = message,
            line = lineInfo?.line,
            column = lineInfo?.column
        )
    }

    /**
     * Attempt to find the line number of a field in YAML content
     * This is a best-effort approach using regex matching
     */
    private fun findLineNumber(yamlContent: String, fieldPath: String): LineInfo? {
        val lines = yamlContent.split("\n")

        // Handle root-level fields
        if (!fieldPath.contains(".") && !fieldPath.contains("[")) {
            val pattern = Regex("^\\s*$fieldPath\\s*:")
            lines.forEachIndexed { index, line ->
                val match = pattern.find(line)
                if (match != null) {
                    return LineInfo(line = index + 1, column = (match.range.first) + 1)
                }
            }
        }

        // Handle nested fields like "steps[0].tool" or "metadata.version"
        val parts = fieldPath.split(Regex("[.\\[\\]]+")).filter { it.isNotEmpty() }

        // Try to find the deepest field we can locate
        for (depth in parts.size downTo 1) {
            val searchField = parts[depth - 1]

            // Skip numeric indices
            if (searchField.matches(Regex("^\\d+$"))) {
                continue
            }

            val pattern = Regex("^\\s*$searchField\\s*:")
            lines.forEachIndexed { index, line ->
                val match = pattern.find(line)
                if (match != null) {
                    return LineInfo(line = index + 1, column = (match.range.first) + 1)
                }
            }
        }

        return null
    }

    private data class LineInfo(val line: Int, val column: Int)
}
