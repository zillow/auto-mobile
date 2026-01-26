package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.McpConnectionException
import dev.jasonpearson.automobile.ide.navigation.ScreenNode
import dev.jasonpearson.automobile.ide.navigation.ScreenTransition
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement

/**
 * Real navigation data source that fetches from MCP resources.
 * Adapts the MCP navigation/graph resource to the IDE's UX model.
 *
 * @param clientProvider Function to provide an AutoMobileClient for MCP access
 * @param appId Optional app ID to filter the navigation graph by specific app
 */
class RealNavigationDataSource(
    private val clientProvider: (() -> AutoMobileClient)? = null,
    private val appId: String? = null,
) : NavigationDataSource {
    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun getNavigationGraph(): Result<NavigationGraph> {
        val provider = clientProvider ?: return Result.Success(
            NavigationGraph(screens = emptyList(), transitions = emptyList())
        )

        return try {
            val client = provider()

            // Build URI with optional appId filter
            val uri = if (appId != null) {
                "automobile:navigation/graph?appId=${java.net.URLEncoder.encode(appId, "UTF-8")}"
            } else {
                "automobile:navigation/graph"
            }

            // Read from MCP resource (not tool call)
            val contents = client.readResource(uri)
            val graphText = contents.firstOrNull()?.text
                ?: return Result.Success(NavigationGraph(screens = emptyList(), transitions = emptyList()))

            // Parse the MCP navigation graph response
            val response = json.decodeFromString(McpNavigationGraphResponse.serializer(), graphText)

            // Count outgoing edges per screen for transitionCount
            val outgoingEdgeCounts = response.edges
                .groupBy { it.from }
                .mapValues { it.value.size }

            // Adapt MCP nodes to IDE ScreenNode model
            val screens = response.nodes.map { node ->
                ScreenNode(
                    id = node.id.toString(),
                    name = node.screenName,
                    type = inferScreenType(node.screenName),
                    packageName = response.appId ?: "",
                    testCoverage = 0, // Not available from MCP yet
                    transitionCount = outgoingEdgeCounts[node.screenName] ?: 0,
                    discoveredAt = System.currentTimeMillis(), // Not available from summary
                    screenshotUri = node.screenshotPath, // MCP resource URI for screenshot
                )
            }

            // Adapt MCP edges to IDE ScreenTransition model
            val transitions = response.edges.map { edge ->
                ScreenTransition(
                    id = edge.id.toString(),
                    fromScreen = edge.from,
                    toScreen = edge.to,
                    trigger = toolNameToTrigger(edge.toolName),
                    element = null, // Would need detailed edge data
                    avgLatencyMs = 0, // Not available from MCP yet
                    failureRate = 0f, // Not available from MCP yet
                    traversalCount = edge.traversalCount,
                )
            }

            Result.Success(NavigationGraph(screens = screens, transitions = transitions))
        } catch (e: McpConnectionException) {
            Result.Error("MCP server not available: ${e.message}")
        } catch (e: Exception) {
            Result.Error("Failed to load navigation graph: ${e.message}")
        }
    }

    /**
     * Infer screen type from screen name patterns.
     */
    private fun inferScreenType(screenName: String): String {
        val lowerName = screenName.lowercase()
        return when {
            lowerName.contains("dialog") || lowerName.contains("alert") -> "Dialog"
            lowerName.contains("sheet") || lowerName.contains("bottom") -> "BottomSheet"
            lowerName.contains("fragment") -> "Fragment"
            lowerName.contains("popup") || lowerName.contains("menu") -> "Popup"
            else -> "Activity"
        }
    }

    /**
     * Map MCP tool name to UI trigger type.
     */
    private fun toolNameToTrigger(toolName: String?): String {
        if (toolName == null) return "unknown"
        val lowerTool = toolName.lowercase()
        return when {
            lowerTool.contains("tap") -> "tap"
            lowerTool.contains("swipe") || lowerTool.contains("scroll") -> "swipe"
            lowerTool.contains("input") || lowerTool.contains("text") -> "input"
            lowerTool.contains("press") || lowerTool.contains("button") -> "press"
            lowerTool.contains("back") -> "back"
            lowerTool.contains("launch") -> "launch"
            else -> toolName
        }
    }
}

// MCP response models - matches exactly what MCP server provides

@Serializable
private data class McpNavigationGraphResponse(
    val appId: String? = null,
    val nodes: List<McpNavigationNode> = emptyList(),
    val edges: List<McpNavigationEdge> = emptyList(),
    val currentScreen: String? = null,
)

@Serializable
private data class McpNavigationNode(
    val id: Int,
    val screenName: String,
    val visitCount: Int,
    val screenshotPath: String? = null, // MCP resource URI for screenshot thumbnail
)

@Serializable
private data class McpNavigationEdge(
    val id: Int,
    val from: String,
    val to: String,
    val toolName: String?,
    val traversalCount: Int = 1,
)
