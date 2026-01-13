package dev.jasonpearson.automobile.validation

import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class ToolResultParserTest {
  private val json = Json { ignoreUnknownKeys = true }

  @Test
  fun `parse tapOn response with selectedElement`() {
    val payload =
        """
        {
          "success": true,
          "action": "tap",
          "element": {
            "text": "Test Channel",
            "resource-id": "com.example:id/item",
            "content-desc": "Item",
            "bounds": { "left": 0, "top": 0, "right": 100, "bottom": 100 }
          },
          "selectedElement": {
            "text": "Test Channel",
            "resourceId": "com.example:id/item",
            "bounds": {
              "left": 0, "top": 0, "right": 100, "bottom": 100,
              "centerX": 50, "centerY": 50
            },
            "indexInMatches": 2,
            "totalMatches": 5,
            "selectionStrategy": "random"
          },
          "observation": {
            "selectedElements": [
              {
                "text": "Test Channel",
                "resourceId": "com.example:id/item",
                "selectedState": { "method": "visual", "confidence": 0.8 }
              }
            ]
          }
        }
        """
            .trimIndent()

    val response = ToolResultParser.parseTapOnResponse(payload)

    assertEquals("tap", response.action)
    assertEquals("Test Channel", response.selectedElement?.text)
    assertEquals(2, response.selectedElement?.indexInMatches)
    assertEquals("random", response.selectedElement?.selectionStrategy)
    assertEquals("Test Channel", response.observation?.selectedElements?.firstOrNull()?.text)
  }

  @Test
  fun `parse tapOn response without selectedElement is backwards compatible`() {
    val payload =
        """
        {
          "success": true,
          "action": "tap"
        }
        """
            .trimIndent()

    val response = ToolResultParser.parseTapOnResponse(payload)

    assertTrue(response.success)
    assertNull(response.selectedElement)
  }

  @Test
  fun `parse tapOn response without action for focus noop`() {
    val payload =
        """
        {
          "success": true,
          "wasAlreadyFocused": true,
          "focusChanged": false
        }
        """
            .trimIndent()

    val response = ToolResultParser.parseTapOnResponse(payload)

    assertTrue(response.success)
    assertNull(response.action)
  }

  @Test
  fun `parse tool result for unknown tool returns generic response`() {
    val payload =
        """
        {
          "success": true,
          "customField": "value"
        }
        """
            .trimIndent()

    val result = ToolResultParser.parseToolResult(0, "unknownTool", payload)

    assertTrue(result.success)
    assertTrue(result.response is GenericToolResponse)
  }

  @Test
  fun `parse MCP response wrapper`() {
    val payload =
        """
        {
          "content": [
            { "type": "text", "text": "{\"success\":true,\"action\":\"tap\"}" }
          ]
        }
        """
            .trimIndent()

    val element = json.parseToJsonElement(payload)
    val result = ToolResultParser.parseToolResultFromMcpResponse(1, "tapOn", element)

    assertTrue(result.success)
    assertEquals(1, result.stepIndex)
  }

  @Test
  fun `malformed JSON throws serialization exception`() {
    assertFailsWith<SerializationException> {
      ToolResultParser.parseTapOnResponse("{")
    }
  }

  @Test
  fun `validate tapOn output schema from tool-definitions`() {
    val definitions = DiskToolDefinitionsSource(json, ToolDefinitionsLocator.findPath()).load()
    val tapOn = definitions.firstOrNull { it.name == "tapOn" }
    assertNotNull(tapOn, "tapOn tool definition missing")
    val schema = tapOn.outputSchema
    assertNotNull(schema, "tapOn outputSchema missing")

    val sample = SchemaSampleGenerator.generate(schema)
    val response =
        ToolResultParser.parseTapOnResponse(json.encodeToString(JsonElement.serializer(), sample))

    assertTrue(response.success)
  }

  @Test
  fun `validate executePlan output schema from tool-definitions`() {
    val definitions = DiskToolDefinitionsSource(json, ToolDefinitionsLocator.findPath()).load()
    val executePlan = definitions.firstOrNull { it.name == "executePlan" }
    assertNotNull(executePlan, "executePlan tool definition missing")
    val schema = executePlan.outputSchema
    assertNotNull(schema, "executePlan outputSchema missing")

    val sample = SchemaSampleGenerator.generate(schema)
    val response =
        ToolResultParser.parseExecutePlanResponse(
            json.encodeToString(JsonElement.serializer(), sample)
        )

    assertTrue(response.success)
  }

  @Test
  fun `generate sample payload from fake schema`() {
    val fakeSchema =
        JsonObject(
            mapOf(
                "type" to JsonPrimitive("object"),
                "properties" to
                    JsonObject(
                        mapOf(
                            "success" to JsonObject(mapOf("type" to JsonPrimitive("boolean")))
                        )
                    ),
                "required" to JsonArray(listOf(JsonPrimitive("success")))
            )
        )

    val sample = SchemaSampleGenerator.generate(fakeSchema).jsonObject

    assertEquals(true, sample["success"]?.jsonPrimitive?.content?.toBooleanStrictOrNull())
  }

  @Test
  fun `load fake tool definitions without disk IO`() {
    val fakeDefinitions =
        """
        [
          {
            "name": "tapOn",
            "outputSchema": {
              "type": "object",
              "properties": {
                "success": { "type": "boolean" }
              },
              "required": ["success"]
            }
          }
        ]
        """
            .trimIndent()

    val definitions = FakeToolDefinitionsSource(json, fakeDefinitions).load()

    assertEquals(1, definitions.size)
    assertEquals("tapOn", definitions.first().name)
  }
}

@Serializable
private data class ToolDefinitionSnapshot(
    val name: String,
    val outputSchema: JsonObject? = null,
)

private interface ToolDefinitionsSource {
  fun load(): List<ToolDefinitionSnapshot>
}

private class DiskToolDefinitionsSource(
    private val json: Json,
    private val path: Path,
) : ToolDefinitionsSource {
  override fun load(): List<ToolDefinitionSnapshot> {
    val content = Files.readString(path)
    return json.decodeFromString(content)
  }
}

private class FakeToolDefinitionsSource(
    private val json: Json,
    private val content: String,
) : ToolDefinitionsSource {
  override fun load(): List<ToolDefinitionSnapshot> {
    return json.decodeFromString(content)
  }
}

private object ToolDefinitionsLocator {
  fun findPath(): Path {
    var current = Paths.get("").toAbsolutePath()
    repeat(6) {
      val candidate = current.resolve("schemas/tool-definitions.json")
      if (Files.exists(candidate)) {
        return candidate
      }
      current = current.parent ?: return@repeat
    }
    throw IllegalStateException("Unable to locate schemas/tool-definitions.json")
  }
}

private object SchemaSampleGenerator {
  fun generate(schema: JsonObject): JsonElement {
    return generate(schema, schema)
  }

  private fun generate(schema: JsonObject, root: JsonObject): JsonElement {
    val ref = schema["\$ref"]?.jsonPrimitive?.content
    if (ref != null) {
      val resolved = resolveRef(root, ref) ?: return JsonNull
      return generate(resolved, root)
    }

    schema["anyOf"]?.jsonArray?.firstOrNull()?.jsonObject?.let { return generate(it, root) }
    schema["oneOf"]?.jsonArray?.firstOrNull()?.jsonObject?.let { return generate(it, root) }
    schema["allOf"]?.jsonArray?.firstOrNull()?.jsonObject?.let { return generate(it, root) }

    val enumValues = schema["enum"]?.jsonArray
    if (enumValues != null && enumValues.isNotEmpty()) {
      return enumValues.first()
    }

    return when (resolveType(schema)) {
      "object" -> generateObject(schema, root)
      "array" -> generateArray(schema, root)
      "string" -> JsonPrimitive("value")
      "integer" -> JsonPrimitive(1)
      "number" -> JsonPrimitive(1.0)
      "boolean" -> JsonPrimitive(true)
      else -> JsonNull
    }
  }

  private fun resolveType(schema: JsonObject): String? {
    val typeElement = schema["type"] ?: return null
    if (typeElement is JsonPrimitive) {
      return typeElement.content
    }
    if (typeElement is JsonArray) {
      for (entry in typeElement) {
        val content = (entry as? JsonPrimitive)?.content ?: continue
        if (content != "null") {
          return content
        }
      }
    }
    return null
  }

  private fun generateObject(schema: JsonObject, root: JsonObject): JsonElement {
    val properties = schema["properties"]?.jsonObject ?: JsonObject(emptyMap())
    val required =
        schema["required"]
            ?.jsonArray
            ?.mapNotNull { (it as? JsonPrimitive)?.content }
            ?.toSet()
            ?: emptySet()

    val values = mutableMapOf<String, JsonElement>()
    for (key in required) {
      val propertySchema = properties[key] as? JsonObject ?: continue
      values[key] = generate(propertySchema, root)
    }

    return JsonObject(values)
  }

  private fun generateArray(schema: JsonObject, root: JsonObject): JsonElement {
    val items = schema["items"] as? JsonObject ?: return JsonArray(emptyList())
    return JsonArray(listOf(generate(items, root)))
  }

  private fun resolveRef(root: JsonObject, ref: String): JsonObject? {
    if (!ref.startsWith("#/")) {
      return null
    }
    val parts = ref.removePrefix("#/").split("/")
    var current: JsonElement = root
    for (rawPart in parts) {
      val part = rawPart.replace("~1", "/").replace("~0", "~")
      current = (current as? JsonObject)?.get(part) ?: return null
    }
    return current as? JsonObject
  }
}
