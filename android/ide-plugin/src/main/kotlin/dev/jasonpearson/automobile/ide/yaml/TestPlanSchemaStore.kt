package dev.jasonpearson.automobile.ide.yaml

import dev.jasonpearson.automobile.validation.ValidTools
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

object TestPlanSchemaStore {
    private val json = Json { ignoreUnknownKeys = true }
    private var rootSchema: JsonObject? = null
    private var rootProperties: Map<String, SchemaPropertyInfo>? = null
    private var stepProperties: Map<String, SchemaPropertyInfo>? = null
    private var metadataProperties: Map<String, SchemaPropertyInfo>? = null
    private var metadataSchema: JsonObject? = null
    private var expectationSchema: JsonObject? = null

    fun getRootProperties(): Map<String, SchemaPropertyInfo> {
        if (rootProperties == null) {
            loadSchemaData()
        }
        return rootProperties.orEmpty()
    }

    fun getStepProperties(): Map<String, SchemaPropertyInfo> {
        if (stepProperties == null) {
            loadSchemaData()
        }
        return stepProperties.orEmpty()
    }

    fun getMetadataProperties(): Map<String, SchemaPropertyInfo> {
        if (metadataProperties == null) {
            loadSchemaData()
        }
        return metadataProperties.orEmpty()
    }

    fun getMetadataSchema(): JsonObject? {
        if (metadataSchema == null) {
            loadSchemaData()
        }
        return metadataSchema
    }

    fun getExpectationSchema(): JsonObject? {
        if (expectationSchema == null) {
            loadSchemaData()
        }
        return expectationSchema
    }

    private fun loadSchemaData() {
        val schema = loadSchema()
        val rootPropertySchemas = schema.objectValue("properties")
        val rootRequired = schema.arrayValue("required")
            ?.mapNotNull { it.stringValue() }
            ?.toSet()
            .orEmpty()
        rootProperties = buildPropertyMap(rootPropertySchemas, rootRequired)

        val defs = schema.objectValue("\$defs") ?: schema.objectValue("definitions")
        val planStep = defs?.objectValue("planStep")
        val stepPropertySchemas = planStep?.objectValue("properties")
        val stepRequired = planStep?.arrayValue("required")
            ?.mapNotNull { it.stringValue() }
            ?.toSet()
            .orEmpty()
        stepProperties = buildPropertyMap(stepPropertySchemas, stepRequired)

        metadataSchema = rootPropertySchemas?.objectValue("metadata")
        val metadataPropertySchemas = metadataSchema?.objectValue("properties")
        val metadataRequired = metadataSchema?.arrayValue("required")
            ?.mapNotNull { it.stringValue() }
            ?.toSet()
            .orEmpty()
        metadataProperties = buildPropertyMap(metadataPropertySchemas, metadataRequired)

        expectationSchema = defs?.objectValue("expectation")
    }

    private fun buildPropertyMap(
        properties: JsonObject?,
        required: Set<String>
    ): Map<String, SchemaPropertyInfo> {
        if (properties == null) {
            return emptyMap()
        }

        return properties.mapNotNull { (name, schemaElement) ->
            val schemaObject = schemaElement.asObjectOrNull() ?: return@mapNotNull null
            val description = schemaObject.stringValue("description")
            val deprecated = schemaObject.booleanValue("deprecated") == true ||
                description?.startsWith("DEPRECATED") == true ||
                name in ValidTools.DEPRECATED_FIELDS
            SchemaPropertyInfo(
                name = name,
                description = description,
                required = required.contains(name),
                deprecated = deprecated,
                schemas = listOf(schemaObject)
            )
        }.associateBy { it.name }
    }

    private fun loadSchema(): JsonObject {
        if (rootSchema != null) {
            return rootSchema!!
        }

        val schemaStream = getResourceStream(
            "test-plan.schema.json",
            "schemas/test-plan.schema.json"
        )
        if (schemaStream == null) {
            rootSchema = JsonObject(emptyMap())
            return rootSchema!!
        }

        val schemaJson = schemaStream.bufferedReader().use { it.readText() }
        val schemaElement = json.parseToJsonElement(schemaJson)
        rootSchema = schemaElement.jsonObject
        return rootSchema!!
    }

    private fun getResourceStream(vararg paths: String): java.io.InputStream? {
        val classLoader = javaClass.classLoader
        for (path in paths) {
            val stream = classLoader.getResourceAsStream(path)
            if (stream != null) {
                return stream
            }
        }
        return null
    }

    private fun JsonObject.objectValue(key: String): JsonObject? = this[key]?.asObjectOrNull()

    private fun JsonObject.arrayValue(key: String): List<JsonElement>? = this[key]?.asArrayOrNull()

    private fun JsonObject.stringValue(key: String): String? = this[key]?.stringValue()

    private fun JsonObject.booleanValue(key: String): Boolean? {
        return (this[key] as? JsonPrimitive)?.booleanValueOrNull()
    }

    private fun JsonElement.stringValue(): String? = (this as? JsonPrimitive)?.content

    private fun JsonPrimitive.booleanValueOrNull(): Boolean? {
        return when (content.lowercase()) {
            "true" -> true
            "false" -> false
            else -> null
        }
    }

    private fun JsonElement.asObjectOrNull(): JsonObject? = this as? JsonObject

    private fun JsonElement.asArrayOrNull(): kotlinx.serialization.json.JsonArray? = this as? kotlinx.serialization.json.JsonArray
}
