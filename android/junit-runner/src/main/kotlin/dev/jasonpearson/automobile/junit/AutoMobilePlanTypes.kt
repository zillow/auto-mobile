package dev.jasonpearson.automobile.junit

import dev.jasonpearson.automobile.validation.ErrorToolResult
import dev.jasonpearson.automobile.validation.TapOnResponse
import dev.jasonpearson.automobile.validation.ToolResponse
import dev.jasonpearson.automobile.validation.ToolResult
import dev.jasonpearson.automobile.validation.ToolResultEntry

/** Configuration options for AutoMobile plan execution. */
data class AutoMobilePlanExecutionOptions(
    val timeoutMs: Long = 30000L, // 30 second default
    val device: String = "auto",
    val aiAssistance: Boolean = true,
    val maxRetries: Int = 0,
    val debugMode: Boolean = System.getProperty("automobile.debug", "false").toBoolean(),
)

/** Result of AutoMobile plan execution. */
data class AutoMobilePlanExecutionResult(
    val success: Boolean,
    val exitCode: Int,
    val output: String = "",
    val errorMessage: String = "",
    val executionTimeMs: Long = 0L,
    val aiRecoveryAttempted: Boolean = false,
    val aiRecoverySuccessful: Boolean = false,
    val parametersUsed: Map<String, Any> = emptyMap(),
    val toolResults: List<ToolResultEntry> = emptyList(),
) {
  /** Get tool result by step index. */
  fun getToolResult(stepIndex: Int): ToolResult? {
    return toolResults.getOrNull(stepIndex) as? ToolResult
  }

  /** Get tool result entry by step index. */
  fun getToolResultEntry(stepIndex: Int): ToolResultEntry? {
    return toolResults.getOrNull(stepIndex)
  }

  /** Get tool error result by step index. */
  fun getErrorToolResult(stepIndex: Int): ErrorToolResult? {
    return toolResults.getOrNull(stepIndex) as? ErrorToolResult
  }

  /** Get the selected element text from a random tapOn operation. */
  fun getSelection(stepIndex: Int): String? {
    val result = getToolResult(stepIndex) ?: return null
    val tapOnResponse = result.response as? TapOnResponse
    return tapOnResponse?.selectedElement?.text
  }

  /** Get a specific response field by step index and tool type. */
  inline fun <reified T : ToolResponse> getTypedResponse(stepIndex: Int): T? {
    return getToolResult(stepIndex)?.response as? T
  }
}
