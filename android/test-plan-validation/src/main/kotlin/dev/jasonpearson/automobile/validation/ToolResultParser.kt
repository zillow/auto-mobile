package dev.jasonpearson.automobile.validation

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonPrimitive

object ToolResultParser {
  val json: Json = Json {
    ignoreUnknownKeys = true
    isLenient = true
  }

  fun parseToolResult(stepIndex: Int, toolName: String, jsonString: String): ToolResult {
    val element = json.parseToJsonElement(jsonString)
    return parseToolResult(stepIndex, toolName, element)
  }

  fun parseToolResult(stepIndex: Int, toolName: String, element: JsonElement): ToolResult {
    val objectElement =
        element as? JsonObject ?: throw SerializationException("Tool result is not a JSON object")

    val success = inferSuccess(objectElement)
    val error = objectElement["error"]?.jsonPrimitive?.content

    val response =
        when (toolName) {
          "tapOn" -> json.decodeFromJsonElement<TapOnResponse>(objectElement)
          "observe" -> json.decodeFromJsonElement<ObserveResponse>(objectElement)
          "executePlan" -> json.decodeFromJsonElement<ExecutePlanResponse>(objectElement)
          else -> GenericToolResponse(success = success, payload = objectElement)
        }

    return ToolResult(
        stepIndex = stepIndex,
        toolName = toolName,
        success = success,
        response = response,
        error = error,
    )
  }

  fun parseToolResultFromMcpResponse(
      stepIndex: Int,
      toolName: String,
      mcpResult: JsonElement,
  ): ToolResult {
    val response = json.decodeFromJsonElement<McpToolResponse>(mcpResult)
    val textPayload =
        response.content.firstOrNull { it.type == "text" }?.text
            ?: throw SerializationException("MCP response did not contain text content")
    return parseToolResult(stepIndex, toolName, textPayload)
  }

  fun parseTapOnResponse(jsonString: String): TapOnResponse =
      json.decodeFromString(TapOnResponse.serializer(), jsonString)

  fun parseObserveResponse(jsonString: String): ObserveResponse =
      json.decodeFromString(ObserveResponse.serializer(), jsonString)

  fun parseExecutePlanResponse(jsonString: String): ExecutePlanResponse =
      json.decodeFromString(ExecutePlanResponse.serializer(), jsonString)

  private fun inferSuccess(result: JsonObject): Boolean {
    val successValue = result["success"]?.jsonPrimitive?.content?.toBooleanStrictOrNull()
    if (successValue != null) {
      return successValue
    }
    return result["error"] == null
  }
}
