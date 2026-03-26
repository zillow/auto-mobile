package dev.jasonpearson.automobile.desktop.core.unified

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement

/**
 * Typed client facade for the observation domain.
 *
 * Events:
 * - subscribeToHierarchy: View hierarchy updates
 * - subscribeToScreenshots: Screenshot updates
 * - subscribeToNavigation: Navigation graph updates
 * - subscribeToPerformance: Performance metrics from device
 * - subscribeToStorage: Storage change events
 */
class ObservationClient(private val client: UnifiedSocketClient) {
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Subscribe to hierarchy updates.
     */
    fun subscribeToHierarchy(deviceId: String? = null): Flow<HierarchyUpdateEvent> {
        val params = buildMap<String, JsonElement> {
            deviceId?.let { put("deviceId", json.encodeToJsonElement(it)) }
        }

        return client.subscribe(
            domain = Domains.OBSERVATION,
            event = "hierarchy_update",
            params = if (params.isEmpty()) null else json.encodeToJsonElement(params),
        ).map { message ->
            json.decodeFromJsonElement(message.result ?: throw IllegalStateException("No result in push"))
        }
    }

    /**
     * Subscribe to screenshot updates.
     */
    fun subscribeToScreenshots(deviceId: String? = null): Flow<ScreenshotUpdateEvent> {
        val params = buildMap<String, JsonElement> {
            deviceId?.let { put("deviceId", json.encodeToJsonElement(it)) }
        }

        return client.subscribe(
            domain = Domains.OBSERVATION,
            event = "screenshot_update",
            params = if (params.isEmpty()) null else json.encodeToJsonElement(params),
        ).map { message ->
            json.decodeFromJsonElement(message.result ?: throw IllegalStateException("No result in push"))
        }
    }

    /**
     * Subscribe to navigation graph updates.
     */
    fun subscribeToNavigation(): Flow<NavigationUpdateEvent> {
        return client.subscribe(
            domain = Domains.OBSERVATION,
            event = "navigation_update",
        ).map { message ->
            json.decodeFromJsonElement(message.result ?: throw IllegalStateException("No result in push"))
        }
    }

    /**
     * Subscribe to performance updates from device observation.
     */
    fun subscribeToPerformance(deviceId: String? = null): Flow<PerformanceUpdateEvent> {
        val params = buildMap<String, JsonElement> {
            deviceId?.let { put("deviceId", json.encodeToJsonElement(it)) }
        }

        return client.subscribe(
            domain = Domains.OBSERVATION,
            event = "performance_update",
            params = if (params.isEmpty()) null else json.encodeToJsonElement(params),
        ).map { message ->
            json.decodeFromJsonElement(message.result ?: throw IllegalStateException("No result in push"))
        }
    }

    /**
     * Subscribe to storage change events.
     */
    fun subscribeToStorage(deviceId: String? = null): Flow<StorageUpdateEvent> {
        val params = buildMap<String, JsonElement> {
            deviceId?.let { put("deviceId", json.encodeToJsonElement(it)) }
        }

        return client.subscribe(
            domain = Domains.OBSERVATION,
            event = "storage_update",
            params = if (params.isEmpty()) null else json.encodeToJsonElement(params),
        ).map { message ->
            json.decodeFromJsonElement(message.result ?: throw IllegalStateException("No result in push"))
        }
    }
}

@Serializable
data class HierarchyUpdateEvent(
    val deviceId: String,
    val timestamp: Long,
    val data: JsonElement,
)

@Serializable
data class ScreenshotUpdateEvent(
    val deviceId: String,
    val timestamp: Long,
    val screenshotBase64: String,
    val screenWidth: Int,
    val screenHeight: Int,
)

@Serializable
data class NavigationNode(
    val id: Int,
    val screenName: String,
    val visitCount: Int,
    val screenshotPath: String? = null,
)

@Serializable
data class NavigationEdge(
    val id: Int,
    val from: String,
    val to: String,
    val toolName: String? = null,
    val traversalCount: Int = 1,
)

@Serializable
data class NavigationGraph(
    val appId: String?,
    val nodes: List<NavigationNode>,
    val edges: List<NavigationEdge>,
    val currentScreen: String?,
)

@Serializable
data class NavigationUpdateEvent(
    val timestamp: Long,
    val navigationGraph: NavigationGraph,
)

@Serializable
data class DevicePerformanceData(
    val fps: Float,
    val frameTimeMs: Float,
    val jankFrames: Int,
    val droppedFrames: Int,
    val memoryUsageMb: Float,
    val cpuUsagePercent: Float,
    val screenName: String? = null,
    val isResponsive: Boolean = true,
)

@Serializable
data class PerformanceUpdateEvent(
    val deviceId: String,
    val timestamp: Long,
    val performanceData: DevicePerformanceData,
)

@Serializable
data class StorageChange(
    val key: String,
    val oldValue: String? = null,
    val newValue: String? = null,
    val changeType: String, // "added" | "modified" | "removed"
)

@Serializable
data class StorageUpdateEvent(
    val deviceId: String,
    val timestamp: Long,
    val storageEvent: StorageChange,
)
