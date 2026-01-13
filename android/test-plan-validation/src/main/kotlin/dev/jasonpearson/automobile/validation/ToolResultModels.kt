@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package dev.jasonpearson.automobile.validation

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNames

@Serializable
data class McpToolResponse(
    val content: List<McpToolContent> = emptyList(),
)

@Serializable
data class McpToolContent(
    val type: String,
    val text: String? = null,
    val data: String? = null,
    val mimeType: String? = null,
)

@Serializable
data class ToolResult(
    val stepIndex: Int,
    val toolName: String,
    val success: Boolean,
    val response: ToolResponse,
    val error: String? = null,
)

@Serializable
sealed interface ToolResponse {
  val success: Boolean?
}

@Serializable
@SerialName("tapOn")
data class TapOnResponse(
    override val success: Boolean,
    val action: String? = null,
    val message: String? = null,
    val element: Element? = null,
    val observation: ObservationSummary? = null,
    val selectedElement: SelectedElement? = null,
    val selectedElements: List<SelectedElement>? = null,
    val error: String? = null,
    val pressRecognized: Boolean? = null,
    val contextMenuOpened: Boolean? = null,
    val selectionStarted: Boolean? = null,
    val searchUntil: SearchUntilStats? = null,
    val debug: JsonElement? = null,
) : ToolResponse

@Serializable
@SerialName("observe")
data class ObserveResponse(
    override val success: Boolean? = null,
    val selectedElements: List<SelectedElement>? = null,
    val focusedElement: Element? = null,
    val accessibilityFocusedElement: Element? = null,
    val activeWindow: ActiveWindowInfo? = null,
    val awaitedElement: Element? = null,
    val awaitDuration: Long? = null,
    val awaitTimeout: Boolean? = null,
    val error: String? = null,
) : ToolResponse

@Serializable
@SerialName("executePlan")
data class ExecutePlanResponse(
    override val success: Boolean,
    val executedSteps: Int,
    val totalSteps: Int,
    val failedStep: ExecutePlanFailedStep? = null,
    val error: String? = null,
    val platform: String? = null,
    val deviceMapping: Map<String, String>? = null,
    val debug: ExecutePlanDebug? = null,
) : ToolResponse

@Serializable
@SerialName("generic")
data class GenericToolResponse(
    override val success: Boolean? = null,
    val payload: JsonElement? = null,
) : ToolResponse

@Serializable
data class SearchUntilStats(
    val durationMs: Long? = null,
    val requestCount: Int? = null,
    val changeCount: Int? = null,
)

@Serializable
data class ObservationSummary(
    val selectedElements: List<SelectedElement>? = null,
    val focusedElement: Element? = null,
    val accessibilityFocusedElement: Element? = null,
    val activeWindow: ActiveWindowInfo? = null,
)

@Serializable
data class ActiveWindowInfo(
    val appId: String? = null,
    val activityName: String? = null,
    val layoutSeqSum: Long? = null,
    val type: String? = null,
)

@Serializable
data class SelectedElement(
    val text: String? = null,
    @JsonNames("resourceId", "resource-id")
    val resourceId: String? = null,
    @JsonNames("contentDesc", "content-desc")
    val contentDesc: String? = null,
    val bounds: ElementBounds? = null,
    val indexInMatches: Int? = null,
    val totalMatches: Int? = null,
    val selectionStrategy: String? = null,
    val selectedState: SelectedElementState? = null,
)

@Serializable
data class SelectedElementState(
    val method: String? = null,
    val confidence: Double? = null,
    val reason: String? = null,
)

@Serializable
data class Element(
    val bounds: ElementBounds? = null,
    val text: String? = null,
    @JsonNames("resource-id", "resourceId")
    val resourceId: String? = null,
    @JsonNames("content-desc", "contentDesc")
    val contentDesc: String? = null,
    @SerialName("class")
    val className: String? = null,
    @SerialName("package")
    val packageName: String? = null,
    val checkable: Boolean? = null,
    val checked: Boolean? = null,
    val clickable: Boolean? = null,
    val enabled: Boolean? = null,
    val focusable: Boolean? = null,
    val focused: Boolean? = null,
    @JsonNames("accessibility-focused", "accessibilityFocused")
    val accessibilityFocused: Boolean? = null,
    val scrollable: Boolean? = null,
    val selected: Boolean? = null,
)

@Serializable
data class ElementBounds(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
    val centerX: Int? = null,
    val centerY: Int? = null,
) {
  val computedCenterX: Int
    get() = (left + right) / 2

  val computedCenterY: Int
    get() = (top + bottom) / 2
}

@Serializable
data class ExecutePlanFailedStep(
    val stepIndex: Int,
    val tool: String,
    val error: String,
    val device: String? = null,
)

@Serializable
data class ExecutePlanDebug(
    val executionTimeMs: Long,
    val steps: List<ExecutePlanDebugStep> = emptyList(),
    val deviceState: ExecutePlanDeviceState? = null,
)

@Serializable
data class ExecutePlanDebugStep(
    val step: String,
    val status: String,
    val durationMs: Long,
    val details: JsonElement? = null,
)

@Serializable
data class ExecutePlanDeviceState(
    val currentActivity: String? = null,
    val focusedWindow: String? = null,
)
