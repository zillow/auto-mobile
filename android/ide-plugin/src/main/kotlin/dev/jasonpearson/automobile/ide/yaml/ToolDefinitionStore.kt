package dev.jasonpearson.automobile.ide.yaml

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

data class ToolDefinition(val name: String, val description: String?, val inputSchema: JsonObject)

/** Provider interface for accessing tool definitions. */
interface ToolDefinitionProvider {
  /** Returns all tool definitions keyed by tool name. */
  fun getToolDefinitions(): Map<String, ToolDefinition>

  /** Returns a tool definition by name, or null if not found. */
  fun getToolDefinition(name: String): ToolDefinition? = getToolDefinitions()[name]
}

/**
 * Production implementation that loads tool definitions from classpath resources.
 *
 * This object lazily loads tool definitions from `tool-definitions.json` or
 * `schemas/tool-definitions.json` on first access.
 */
object ToolDefinitionStore : ToolDefinitionProvider {
  private val json = Json { ignoreUnknownKeys = true }
  private var toolDefinitions: Map<String, ToolDefinition>? = null

  override fun getToolDefinitions(): Map<String, ToolDefinition> {
    if (toolDefinitions == null) {
      toolDefinitions = loadToolDefinitions()
    }
    return toolDefinitions.orEmpty()
  }

  private fun loadToolDefinitions(): Map<String, ToolDefinition> {
    val stream =
        getResourceStream("tool-definitions.json", "schemas/tool-definitions.json")
            ?: return emptyMap()
    val jsonText = stream.bufferedReader().use { it.readText() }
    val parsed = json.parseToJsonElement(jsonText)
    val array = parsed as? kotlinx.serialization.json.JsonArray ?: return emptyMap()

    return array
        .mapNotNull { element ->
          val obj = element as? JsonObject ?: return@mapNotNull null
          val name = obj.stringValue("name") ?: return@mapNotNull null
          val description = obj.stringValue("description")
          val schema = obj["inputSchema"]?.asObjectOrNull() ?: return@mapNotNull null
          ToolDefinition(name, description, schema)
        }
        .associateBy { it.name }
  }

  private fun JsonObject.stringValue(key: String): String? = this[key]?.stringValue()

  private fun JsonElement.stringValue(): String? =
      (this as? kotlinx.serialization.json.JsonPrimitive)?.content

  private fun JsonElement.asObjectOrNull(): JsonObject? = this as? JsonObject

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
}
