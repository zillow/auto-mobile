package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.McpConnectionException
import kotlinx.coroutines.delay
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Represents an installed app on the device.
 */
data class InstalledApp(
    val packageName: String,
    val displayName: String?,
    val isForeground: Boolean,
)

/**
 * Data source interface for fetching installed apps from the device.
 */
interface AppListDataSource {
    suspend fun getInstalledApps(): Result<List<InstalledApp>>
}

/**
 * Fake app list data source returning mock data for UI development.
 */
class FakeAppListDataSource : AppListDataSource {
    override suspend fun getInstalledApps(): Result<List<InstalledApp>> {
        delay(100)
        return Result.Success(
            listOf(
                InstalledApp("com.example.playground", "Playground", true),
                InstalledApp("com.example.myapp", "My App", false),
                InstalledApp("com.google.android.gms", "Google Play Services", false),
                InstalledApp("com.android.settings", "Settings", false),
            )
        )
    }
}

/**
 * Real app list data source that fetches from MCP resources.
 *
 * @param clientProvider Function to provide an AutoMobileClient for MCP access
 * @param deviceId The device ID to fetch apps for
 */
class RealAppListDataSource(
    private val clientProvider: (() -> AutoMobileClient)? = null,
    private val deviceId: String? = null,
) : AppListDataSource {
    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun getInstalledApps(): Result<List<InstalledApp>> {
        val provider = clientProvider ?: return Result.Success(emptyList())
        val device = deviceId ?: return Result.Error("No device ID provided")

        return try {
            val client = provider()

            // Read from MCP resource
            val uri = "automobile:apps?deviceId=${java.net.URLEncoder.encode(device, "UTF-8")}"
            val contents = client.readResource(uri)
            val responseText = contents.firstOrNull()?.text
                ?: return Result.Success(emptyList())

            // Parse the MCP apps query response
            val response = json.decodeFromString(McpAppsQueryResponse.serializer(), responseText)

            // Flatten apps from all devices (usually just one)
            val apps = response.devices.flatMap { deviceContent ->
                deviceContent.apps.map { app ->
                    InstalledApp(
                        packageName = app.packageName,
                        displayName = app.displayName,
                        isForeground = app.foreground,
                    )
                }
            }

            Result.Success(apps)
        } catch (e: McpConnectionException) {
            Result.Error("MCP server not available: ${e.message}")
        } catch (e: Exception) {
            Result.Error("Failed to load installed apps: ${e.message}")
        }
    }
}

// MCP response models - matches the AppsQueryResourceContent from appResources.ts

@Serializable
private data class McpAppsQueryResponse(
    val query: McpAppsQueryOptions? = null,
    val totalCount: Int = 0,
    val deviceCount: Int = 0,
    val lastUpdated: String? = null,
    val devices: List<McpAppsDeviceContent> = emptyList(),
)

@Serializable
private data class McpAppsQueryOptions(
    val platform: String? = null,
    val search: String? = null,
    val type: String? = null,
    val profile: Int? = null,
    val deviceId: String? = null,
)

@Serializable
private data class McpAppsDeviceContent(
    val deviceId: String,
    val platform: String,
    val totalCount: Int = 0,
    val lastUpdated: String? = null,
    val apps: List<McpAppInfo> = emptyList(),
)

@Serializable
private data class McpAppInfo(
    val packageName: String,
    val type: String? = null,
    val foreground: Boolean = false,
    val recent: Boolean = false,
    val userId: Int? = null,
    val userProfile: String? = null,
    val userIds: List<Int>? = null,
    val displayName: String? = null,
)
