package dev.jasonpearson.automobile.ide.mcp

import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.DaemonSocketPaths
import dev.jasonpearson.automobile.ide.daemon.McpDaemonClient
import dev.jasonpearson.automobile.ide.daemon.McpHttpClient
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.decodeFromString
import java.io.File

/**
 * Interface for MCP resource client operations
 */
interface McpResourceClient {
    suspend fun readResource(uri: String): ResourceReadResult
    suspend fun listResources(): List<ResourceInfo>
    fun close()
}

/**
 * Result of reading an MCP resource
 */
sealed class ResourceReadResult {
    data class Success(val content: String, val mimeType: String) : ResourceReadResult()
    data class Error(val message: String) : ResourceReadResult()
}

/**
 * Information about an available resource
 */
data class ResourceInfo(
    val uri: String,
    val name: String,
    val description: String?,
    val mimeType: String?,
)

/**
 * Fake implementation for testing
 */
class FakeMcpResourceClient : McpResourceClient {
    var bootedDevicesResponse: String = """
        {
            "totalCount": 2,
            "androidCount": 2,
            "iosCount": 0,
            "virtualCount": 2,
            "physicalCount": 0,
            "lastUpdated": "2024-01-24T23:00:00Z",
            "devices": [
                {
                    "name": "Pixel 8 API 35",
                    "platform": "android",
                    "deviceId": "emulator-5554",
                    "source": "local",
                    "isVirtual": true,
                    "status": "booted"
                },
                {
                    "name": "Pixel 7 API 34",
                    "platform": "android",
                    "deviceId": "emulator-5556",
                    "source": "local",
                    "isVirtual": true,
                    "status": "booted"
                }
            ]
        }
    """.trimIndent()

    var deviceImagesResponse: String = """
        {
            "totalCount": 5,
            "androidCount": 3,
            "iosCount": 2,
            "lastUpdated": "2024-01-24T23:00:00Z",
            "images": [
                {"name": "Pixel 8 API 35", "platform": "android", "deviceId": "Pixel_8_API_35"},
                {"name": "Pixel 7 API 34", "platform": "android", "deviceId": "Pixel_7_API_34"},
                {"name": "Pixel 6 API 33", "platform": "android", "deviceId": "Pixel_6_API_33"},
                {"name": "iPhone 15 Pro", "platform": "ios", "deviceId": "iphone-15-pro"},
                {"name": "iPhone 14", "platform": "ios", "deviceId": "iphone-14"}
            ]
        }
    """.trimIndent()

    override suspend fun readResource(uri: String): ResourceReadResult {
        return when (uri) {
            "automobile:devices/booted" -> ResourceReadResult.Success(bootedDevicesResponse, "application/json")
            "automobile:devices/images" -> ResourceReadResult.Success(deviceImagesResponse, "application/json")
            else -> ResourceReadResult.Error("Unknown resource: $uri")
        }
    }

    override suspend fun listResources(): List<ResourceInfo> = listOf(
        ResourceInfo("automobile:devices/booted", "Booted Devices", "Currently running devices", "application/json"),
        ResourceInfo("automobile:devices/images", "Device Images", "Available device images", "application/json"),
        ResourceInfo("automobile:failures", "Failures", "Failure groups", "application/json"),
    )

    override fun close() {}
}

/**
 * Real MCP client that wraps AutoMobileClient (daemon client)
 * Uses the existing daemon protocol to read MCP resources
 */
class DaemonMcpResourceClient(
    private val client: AutoMobileClient,
) : McpResourceClient {

    override suspend fun readResource(uri: String): ResourceReadResult {
        return try {
            println("[DaemonMcpResourceClient] Reading resource: $uri using ${client.transportName}")
            println("[DaemonMcpResourceClient] Connection: ${client.connectionDescription}")

            val contents = client.readResource(uri)
            println("[DaemonMcpResourceClient] Received ${contents.size} content entries")

            val content = contents.firstOrNull()
            if (content?.text != null) {
                println("[DaemonMcpResourceClient] Success: ${content.text.take(100)}...")
                ResourceReadResult.Success(content.text, content.mimeType ?: "application/json")
            } else {
                println("[DaemonMcpResourceClient] Error: Resource response missing content")
                ResourceReadResult.Error("Resource response missing content")
            }
        } catch (e: Exception) {
            val errorMsg = "${e.javaClass.simpleName}: ${e.message}"
            println("[DaemonMcpResourceClient] Exception: $errorMsg")
            e.printStackTrace()
            ResourceReadResult.Error("Connection error: $errorMsg\n\nCause: ${e.cause?.message ?: "none"}\n\nStack: ${e.stackTrace.take(3).joinToString("\n") { "  at $it" }}")
        }
    }

    override suspend fun listResources(): List<ResourceInfo> {
        return try {
            println("[DaemonMcpResourceClient] Listing resources using ${client.transportName}")
            val resources = client.listResources()
            println("[DaemonMcpResourceClient] Found ${resources.size} resources")
            resources.map { resource ->
                ResourceInfo(
                    uri = resource.uri,
                    name = resource.name,
                    description = resource.description,
                    mimeType = resource.mimeType,
                )
            }
        } catch (e: Exception) {
            println("[DaemonMcpResourceClient] Exception listing resources: ${e.message}")
            e.printStackTrace()
            emptyList()
        }
    }

    override fun close() {
        client.close()
    }
}

/**
 * Data class for daemon PID file content
 */
@Serializable
private data class PidFileData(
    val pid: Int,
    val socketPath: String,
    val port: Int,
    val startedAt: Long,
    val version: String,
)

/**
 * Factory for creating MCP resource clients
 */
object McpResourceClientFactory {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    /**
     * Create an MCP resource client based on the detected process type.
     *
     * For Unix socket processes, we use the daemon's Unix socket protocol (McpDaemonClient).
     * For Streamable HTTP processes, we read the PID file to get the port and use McpHttpClient.
     */
    fun create(process: McpProcess): McpResourceClient {
        println("[McpResourceClientFactory] Creating client for process: ${process.name}")
        println("[McpResourceClientFactory]   Type: ${process.connectionType}")
        println("[McpResourceClientFactory]   Socket: ${process.socketPath}")
        println("[McpResourceClientFactory]   Port: ${process.port}")

        return when (process.connectionType) {
            McpConnectionType.UnixSocket -> {
                val socketPath = process.socketPath
                    ?: DaemonSocketPaths.socketPath()
                println("[McpResourceClientFactory] Creating McpDaemonClient with socket: $socketPath")

                // Check if socket file exists
                val socketFile = File(socketPath)
                if (!socketFile.exists()) {
                    throw IllegalStateException("Socket file does not exist: $socketPath")
                }
                println("[McpResourceClientFactory] Socket file exists: ${socketFile.absolutePath}")

                DaemonMcpResourceClient(McpDaemonClient(socketPath))
            }
            McpConnectionType.StreamableHttp -> {
                // Read PID file to get the daemon's HTTP port
                val port = process.port ?: readDaemonPort() ?: 3000
                val endpoint = "http://localhost:$port/auto-mobile/streamable"
                println("[McpResourceClientFactory] Creating McpHttpClient with endpoint: $endpoint")
                DaemonMcpResourceClient(McpHttpClient(endpoint))
            }
            McpConnectionType.Stdio -> {
                // STDIO requires process management, not supported for external connection
                throw UnsupportedOperationException("Cannot connect to STDIO process externally")
            }
        }
    }

    /**
     * Create a fake client for testing/demo purposes
     */
    fun createFake(): McpResourceClient = FakeMcpResourceClient()

    /**
     * Read the daemon port from the PID file
     */
    private fun readDaemonPort(): Int? {
        return try {
            val userId = getUserId()
            val pidFile = File("/tmp/auto-mobile-daemon-$userId.pid")
            println("[McpResourceClientFactory] Looking for PID file at: ${pidFile.absolutePath}")

            if (!pidFile.exists()) {
                println("[McpResourceClientFactory] PID file does not exist")
                return null
            }

            val content = pidFile.readText()
            println("[McpResourceClientFactory] PID file content: $content")

            val pidData = json.decodeFromString<PidFileData>(content)
            println("[McpResourceClientFactory] Daemon port from PID file: ${pidData.port}")
            pidData.port
        } catch (e: Exception) {
            println("[McpResourceClientFactory] Error reading PID file: ${e.message}")
            e.printStackTrace()
            null
        }
    }

    private fun getUserId(): String {
        val userName = System.getProperty("user.name", "default").ifBlank { "default" }
        val osName = System.getProperty("os.name", "").lowercase()
        if (osName.contains("win")) {
            return userName
        }

        return try {
            val process = ProcessBuilder("id", "-u").start()
            val completed = process.waitFor(2, java.util.concurrent.TimeUnit.SECONDS)
            if (!completed) {
                process.destroy()
                return userName
            }
            val uid = process.inputStream.bufferedReader().readText().trim()
            if (uid.isNotEmpty()) uid else userName
        } catch (e: Exception) {
            userName
        }
    }
}
