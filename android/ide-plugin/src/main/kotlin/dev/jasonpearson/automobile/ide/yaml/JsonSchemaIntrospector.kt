package dev.jasonpearson.automobile.ide.yaml

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

data class SchemaPathSegment(val key: String, val isArrayItem: Boolean)

data class SchemaPropertyInfo(
    val name: String,
    val description: String?,
    val required: Boolean,
    val deprecated: Boolean,
    val schemas: List<JsonObject>
)

object JsonSchemaIntrospector {
    fun collectProperties(
        rootSchema: JsonObject,
        path: List<SchemaPathSegment>
    ): Map<String, SchemaPropertyInfo> {
        val schemas = collectSchemasAtPath(rootSchema, path, rootSchema)
        if (schemas.isEmpty()) {
            return emptyMap()
        }

        val propertySchemas = mutableMapOf<String, MutableList<JsonObject>>()
        val required = mutableSetOf<String>()
        schemas.forEach { schema ->
            collectProperties(schema, rootSchema, propertySchemas, required)
        }

        return propertySchemas.mapValues { (name, schemasForProperty) ->
            val description = schemasForProperty.firstNotNullOfOrNull { it.stringValue("description") }
            val deprecated = schemasForProperty.any { it.booleanValue("deprecated") == true } ||
                description?.startsWith("DEPRECATED") == true
            SchemaPropertyInfo(
                name = name,
                description = description,
                required = required.contains(name),
                deprecated = deprecated,
                schemas = schemasForProperty
            )
        }
    }

    fun collectEnumValues(
        rootSchema: JsonObject,
        path: List<SchemaPathSegment>
    ): Set<String> {
        val schemas = collectSchemasAtPath(rootSchema, path, rootSchema)
        if (schemas.isEmpty()) {
            return emptySet()
        }

        val values = mutableSetOf<String>()
        schemas.forEach { schema ->
            val resolved = resolveRef(schema, rootSchema)
            resolved.arrayValue("enum")?.forEach { entry ->
                entry.stringValue()?.let { values.add(it) }
            }
        }

        return values
    }

    private fun collectSchemasAtPath(
        schema: JsonObject,
        path: List<SchemaPathSegment>,
        rootSchema: JsonObject
    ): List<JsonObject> {
        if (path.isEmpty()) {
            return listOf(resolveRef(schema, rootSchema))
        }

        val segment = path.first()
        val propertySchemas = collectPropertySchemas(schema, segment.key, rootSchema)
        if (propertySchemas.isEmpty()) {
            return emptyList()
        }

        val remaining = path.drop(1)
        val results = mutableListOf<JsonObject>()
        for (propertySchema in propertySchemas) {
            var resolved = resolveRef(propertySchema, rootSchema)
            if (segment.isArrayItem) {
                resolved = unwrapArrayItemSchema(resolved, rootSchema) ?: continue
            }
            results.addAll(collectSchemasAtPath(resolved, remaining, rootSchema))
        }

        return results
    }

    private fun collectPropertySchemas(
        schema: JsonObject,
        key: String,
        rootSchema: JsonObject
    ): List<JsonObject> {
        val resolved = resolveRef(schema, rootSchema)
        val result = mutableListOf<JsonObject>()
        resolved.objectValue("properties")
            ?.get(key)
            ?.asObjectOrNull()
            ?.let { result.add(it) }

        for (keyword in listOf("allOf", "anyOf", "oneOf")) {
            resolved.arrayValue(keyword)?.forEach { element ->
                val child = element.asObjectOrNull() ?: return@forEach
                result.addAll(collectPropertySchemas(child, key, rootSchema))
            }
        }

        return result
    }

    private fun collectProperties(
        schema: JsonObject,
        rootSchema: JsonObject,
        properties: MutableMap<String, MutableList<JsonObject>>,
        required: MutableSet<String>
    ) {
        val resolved = resolveRef(schema, rootSchema)
        resolved.objectValue("properties")?.forEach { (key, value) ->
            value.asObjectOrNull()?.let { propertySchema ->
                properties.getOrPut(key) { mutableListOf() }.add(propertySchema)
            }
        }

        resolved.arrayValue("required")
            ?.mapNotNull { it.stringValue() }
            ?.forEach { required.add(it) }

        for (keyword in listOf("allOf", "anyOf", "oneOf")) {
            resolved.arrayValue(keyword)?.forEach { element ->
                val child = element.asObjectOrNull() ?: return@forEach
                collectProperties(child, rootSchema, properties, required)
            }
        }
    }

    private fun unwrapArrayItemSchema(schema: JsonObject, rootSchema: JsonObject): JsonObject? {
        val resolved = resolveRef(schema, rootSchema)
        val items = resolved["items"]?.asObjectOrNull() ?: return null
        return resolveRef(items, rootSchema)
    }

    private fun resolveRef(schema: JsonObject, rootSchema: JsonObject): JsonObject {
        val ref = schema.stringValue("\$ref") ?: return schema
        if (!ref.startsWith("#/")) {
            return schema
        }

        var current: JsonElement = rootSchema
        val segments = ref.removePrefix("#/").split("/")
        for (segment in segments) {
            val key = segment.replace("~1", "/").replace("~0", "~")
            current = current.asObjectOrNull()?.get(key) ?: return schema
        }

        return current.asObjectOrNull() ?: schema
    }

    private fun JsonObject.objectValue(key: String): JsonObject? = this[key]?.asObjectOrNull()

    private fun JsonObject.arrayValue(key: String): JsonArray? = this[key]?.asArrayOrNull()

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

    private fun JsonElement.asArrayOrNull(): JsonArray? = this as? JsonArray
}
