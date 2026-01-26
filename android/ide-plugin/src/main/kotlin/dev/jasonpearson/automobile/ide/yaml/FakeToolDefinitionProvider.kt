package dev.jasonpearson.automobile.ide.yaml

import kotlinx.serialization.json.JsonObject

/**
 * Fake implementation of [ToolDefinitionProvider] for testing.
 *
 * Allows setting up tool definitions programmatically without loading from classpath resources.
 *
 * Example usage:
 * ```kotlin
 * val provider = FakeToolDefinitionProvider()
 * provider.addToolDefinition("observe", "Observe the screen", buildJsonObject { })
 * provider.addToolDefinition("tapOn", "Tap on an element", buildJsonObject {
 *     put("type", JsonPrimitive("object"))
 * })
 * ```
 */
class FakeToolDefinitionProvider : ToolDefinitionProvider {
  private val definitions = mutableMapOf<String, ToolDefinition>()

  override fun getToolDefinitions(): Map<String, ToolDefinition> = definitions.toMap()

  /** Adds a tool definition with the given parameters. */
  fun addToolDefinition(name: String, description: String?, inputSchema: JsonObject) {
    definitions[name] = ToolDefinition(name, description, inputSchema)
  }

  /** Adds a tool definition directly. */
  fun addToolDefinition(definition: ToolDefinition) {
    definitions[definition.name] = definition
  }

  /** Removes a tool definition by name. */
  fun removeToolDefinition(name: String) {
    definitions.remove(name)
  }

  /** Clears all tool definitions. */
  fun clear() {
    definitions.clear()
  }

  /** Sets all tool definitions at once, replacing any existing definitions. */
  fun setToolDefinitions(definitions: Map<String, ToolDefinition>) {
    this.definitions.clear()
    this.definitions.putAll(definitions)
  }
}
