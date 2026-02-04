package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.McpConnectionException
import dev.jasonpearson.automobile.ide.layout.ElementBounds
import dev.jasonpearson.automobile.ide.layout.UIElementInfo
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import java.util.Base64

/**
 * Real layout data source that fetches from MCP.
 * Calls the 'observe' tool to capture fresh screen state,
 * then reads the screenshot from the observation/latest/screenshot resource.
 */
class RealLayoutDataSource(
    private val clientProvider: (() -> AutoMobileClient)? = null,
    private val platform: String = "android",
) : LayoutDataSource {
    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun getViewHierarchy(): Result<UIElementInfo> {
        return when (val result = getObservation()) {
            is Result.Success -> Result.Success(result.data.hierarchy)
            is Result.Error -> Result.Error(result.message)
            is Result.Loading -> Result.Loading
        }
    }

    override suspend fun getObservation(): Result<ObservationData> {
        val provider = clientProvider ?: return Result.Success(
            ObservationData(hierarchy = createEmptyHierarchy())
        )

        return try {
            val client = provider()

            // Call the observe tool to capture fresh screen state
            val observeResult = client.observe(platform = platform)

            // Parse the view hierarchy from the observe result
            val hierarchy = observeResult.viewHierarchy?.let { viewHierarchyJson ->
                try {
                    val viewHierarchyResult = json.decodeFromJsonElement(
                        ViewHierarchyResultDto.serializer(),
                        viewHierarchyJson
                    )
                            viewHierarchyResult.hierarchy?.node?.let { nodes ->
                        if (nodes.isNotEmpty()) {
                            val counter = intArrayOf(0)
                            parseHierarchy(nodes.first(), 0, counter)
                        } else null
                    }
                } catch (e: Exception) {
                    null
                }
            } ?: createEmptyHierarchy()

            // Fetch screenshot from the resource (observe populates it)
            val screenshotData = try {
                val screenshotContents = client.readResource("automobile:observation/latest/screenshot")
                val screenshotBlob = screenshotContents.firstOrNull { !it.blob.isNullOrBlank() }?.blob
                screenshotBlob?.let { Base64.getDecoder().decode(it) }
            } catch (e: Exception) {
                // Screenshot fetch failed - continue without it
                null
            }

            Result.Success(
                ObservationData(
                    hierarchy = hierarchy,
                    screenshotData = screenshotData,
                    screenWidth = observeResult.screenSize?.width ?: 1080,
                    screenHeight = observeResult.screenSize?.height ?: 2340,
                    timestamp = observeResult.updatedAt ?: System.currentTimeMillis(),
                )
            )
        } catch (e: McpConnectionException) {
            Result.Error("MCP server not available: ${e.message}")
        } catch (e: Exception) {
            Result.Error("Failed to load observation: ${e.message}")
        }
    }

    private fun parseHierarchy(node: HierarchyNodeDto, depth: Int, counter: IntArray): UIElementInfo {
        // Parse bounds from string format "[left,top][right,bottom]"
        val bounds = node.bounds?.let { parseBoundsString(it) } ?: ElementBounds(0, 0, 0, 0)

        // Generate a unique ID using counter to ensure uniqueness across tree
        val nodeIndex = counter[0]++
        val baseId = node.resourceId
            ?: node.contentDesc?.let { "desc:$it" }
            ?: node.text?.let { "text:$it" }
            ?: "node-$depth-${bounds.hashCode()}"
        val id = "$baseId#$nodeIndex"

        return UIElementInfo(
            id = id,
            className = node.className ?: "android.view.View",
            resourceId = node.resourceId,
            text = node.text,
            contentDescription = node.contentDesc,
            bounds = bounds,
            isClickable = node.clickable == "true",
            isEnabled = node.enabled != "false",
            isFocused = node.focused == "true",
            isSelected = node.selected == "true",
            isScrollable = node.scrollable == "true",
            isCheckable = node.checkable == "true",
            isChecked = node.checked == "true",
            depth = depth,
            children = node.children.map { parseHierarchy(it, depth + 1, counter) },
        )
    }

    private fun parseBoundsString(boundsStr: String): ElementBounds {
        // Parse format "[left,top][right,bottom]"
        val regex = """\[(\d+),(\d+)\]\[(\d+),(\d+)\]""".toRegex()
        val match = regex.find(boundsStr)
        return if (match != null) {
            val (left, top, right, bottom) = match.destructured
            ElementBounds(
                left = left.toIntOrNull() ?: 0,
                top = top.toIntOrNull() ?: 0,
                right = right.toIntOrNull() ?: 0,
                bottom = bottom.toIntOrNull() ?: 0,
            )
        } else {
            ElementBounds(0, 0, 0, 0)
        }
    }

    private fun createEmptyHierarchy(message: String? = null): UIElementInfo {
        return UIElementInfo(
            id = "root_placeholder",
            className = "android.view.View",
            resourceId = null,
            text = message ?: "No data available",
            contentDescription = null,
            bounds = ElementBounds(0, 0, 0, 0),
            isClickable = false,
            isEnabled = false,
            isFocused = false,
            isSelected = false,
            isScrollable = false,
            isCheckable = false,
            isChecked = false,
            depth = 0,
            children = emptyList(),
        )
    }
}

// MCP response models for observation

@Serializable
private data class ObservationResponse(
    val updatedAt: Long? = null,
    val screenSize: ScreenSizeDto? = null,
    val viewHierarchy: ViewHierarchyResultDto? = null,
)

@Serializable
private data class ScreenSizeDto(
    val width: Int? = null,
    val height: Int? = null,
)

@Serializable
private data class ViewHierarchyResultDto(
    val hierarchy: HierarchyContainerDto? = null,
    val packageName: String? = null,
)

@Serializable
private data class HierarchyContainerDto(
    val node: List<HierarchyNodeDto>? = null,
)

@Serializable
private data class HierarchyNodeDto(
    val className: String? = null,
    @kotlinx.serialization.SerialName("resource-id")
    val resourceId: String? = null,
    val text: String? = null,
    @kotlinx.serialization.SerialName("content-desc")
    val contentDesc: String? = null,
    val bounds: String? = null,
    val clickable: String? = null,
    val enabled: String? = null,
    val focused: String? = null,
    val focusable: String? = null,
    val selected: String? = null,
    val scrollable: String? = null,
    val checkable: String? = null,
    val checked: String? = null,
    // node can be either a single object or array - use JsonElement
    val node: kotlinx.serialization.json.JsonElement? = null,
) {
    // Parse children from the polymorphic node field
    val children: List<HierarchyNodeDto>
        get() {
            val nodeElement = node ?: return emptyList()
            return when {
                nodeElement is kotlinx.serialization.json.JsonArray -> {
                    nodeElement.mapNotNull { elem ->
                        try {
                            Json { ignoreUnknownKeys = true }.decodeFromJsonElement(HierarchyNodeDto.serializer(), elem)
                        } catch (e: Exception) {
                            null
                        }
                    }
                }
                nodeElement is kotlinx.serialization.json.JsonObject -> {
                    try {
                        listOf(Json { ignoreUnknownKeys = true }.decodeFromJsonElement(HierarchyNodeDto.serializer(), nodeElement))
                    } catch (e: Exception) {
                        emptyList()
                    }
                }
                else -> emptyList()
            }
        }
}
