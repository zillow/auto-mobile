package dev.jasonpearson.automobile.ide.datasource

import com.intellij.openapi.diagnostic.Logger
import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.McpConnectionException
import dev.jasonpearson.automobile.ide.storage.DatabaseInfo
import dev.jasonpearson.automobile.ide.storage.KeyValueEntry
import dev.jasonpearson.automobile.ide.storage.KeyValueFile
import dev.jasonpearson.automobile.ide.storage.KeyValueType
import dev.jasonpearson.automobile.ide.storage.StoragePlatform
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive

private val LOG = Logger.getInstance("RealStorageDataSource")

/**
 * Real storage data source that fetches from MCP resources.
 *
 * @param clientProvider Function to provide an AutoMobileClient for MCP access
 * @param deviceId The device ID to fetch storage data for
 * @param packageName The package name of the app to inspect
 */
class RealStorageDataSource(
    private val clientProvider: (() -> AutoMobileClient)? = null,
    private val deviceId: String? = null,
    private val packageName: String? = null,
    private val platform: StoragePlatform = StoragePlatform.Android,
) : StorageDataSource {
    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun getDatabases(): Result<List<DatabaseInfo>> {
        // Database inspection not yet implemented in MCP server
        // Return empty list for now - will be implemented in a future PR
        return Result.Success(emptyList())
    }

    override suspend fun getKeyValueFiles(): Result<List<KeyValueFile>> {
        LOG.info("getKeyValueFiles: clientProvider=${if (clientProvider != null) "present" else "null"}, deviceId=$deviceId, packageName=$packageName")

        val provider = clientProvider ?: run {
            LOG.warn("getKeyValueFiles: No clientProvider")
            return Result.Error("Not connected to MCP server. Please select a device first.")
        }
        val device = deviceId ?: run {
            LOG.warn("getKeyValueFiles: No deviceId provided")
            return Result.Error("No device ID provided")
        }
        val pkg = packageName ?: run {
            LOG.warn("getKeyValueFiles: No packageName provided")
            return Result.Error("No package name provided")
        }

        return try {
            val client = provider()
            LOG.info("getKeyValueFiles: Got client: ${client::class.simpleName}")

            // First, get the list of storage files
            val filesUri = buildStorageFilesUri(device, pkg)
            LOG.info("getKeyValueFiles: Fetching files from URI: $filesUri")
            val filesContents = client.readResource(filesUri)
            LOG.info("getKeyValueFiles: Got ${filesContents.size} content items")
            val filesText = filesContents.firstOrNull()?.text
            if (filesText == null) {
                LOG.warn("getKeyValueFiles: No text content in response")
                return Result.Success(emptyList())
            }
            LOG.info("getKeyValueFiles: Response text (first 500 chars): ${filesText.take(500)}")

            val filesResponse = json.decodeFromString(McpStorageFilesResponse.serializer(), filesText)
            LOG.info("getKeyValueFiles: Parsed response, files count=${filesResponse.files.size}, error=${filesResponse.error}")

            // Check for error in response
            if (filesResponse.error != null) {
                LOG.warn("getKeyValueFiles: Response contains error: ${filesResponse.error}")
                return Result.Error(filesResponse.error)
            }

            // For each file, fetch its entries
            val keyValueFiles = filesResponse.files.map { file ->
                val entriesUri = buildStorageEntriesUri(device, pkg, file.name)
                LOG.info("getKeyValueFiles: Fetching entries for ${file.name} from: $entriesUri")
                val entriesContents = client.readResource(entriesUri)
                val entriesText = entriesContents.firstOrNull()?.text

                val entries = if (entriesText != null) {
                    val entriesResponse = json.decodeFromString(
                        McpStorageEntriesResponse.serializer(),
                        entriesText
                    )
                    LOG.info("getKeyValueFiles: File ${file.name} has ${entriesResponse.entries.size} entries")
                    entriesResponse.entries.map { entry ->
                        KeyValueEntry(
                            key = entry.key,
                            value = parseValue(entry.value, entry.type),
                            type = mapKeyValueType(entry.type),
                        )
                    }
                } else {
                    LOG.warn("getKeyValueFiles: No entries text for ${file.name}")
                    emptyList()
                }

                KeyValueFile(
                    name = file.name,
                    path = file.path,
                    platform = platform,
                    entries = entries,
                )
            }

            LOG.info("getKeyValueFiles: Returning ${keyValueFiles.size} files")
            Result.Success(keyValueFiles)
        } catch (e: McpConnectionException) {
            LOG.warn("getKeyValueFiles: MCP connection error: ${e.message}")
            Result.Error("MCP server not available: ${e.message}")
        } catch (e: Exception) {
            LOG.warn("getKeyValueFiles: Exception during fetch: ${e.message}")
            Result.Error("Failed to load storage data: ${e.message}")
        }
    }

    override suspend fun setKeyValue(
        fileName: String,
        key: String,
        value: String?,
        type: KeyValueType,
    ): Result<Unit> {
        val provider = clientProvider ?: return Result.Error("Not connected to MCP server.")
        val device = deviceId ?: return Result.Error("No device ID provided")
        val pkg = packageName ?: return Result.Error("No package name provided")

        return try {
            val client = provider()
            withContext(Dispatchers.IO) {
                val result = client.setKeyValue(device, pkg, fileName, key, value, type.protocolName)
                if (result.success) Result.Success(Unit)
                else Result.Error(result.message ?: "Failed to set key value")
            }
        } catch (e: McpConnectionException) {
            Result.Error("MCP server not available: ${e.message}")
        } catch (e: Exception) {
            Result.Error("Failed to set key value: ${e.message}")
        }
    }

    override suspend fun removeKeyValue(fileName: String, key: String): Result<Unit> {
        val provider = clientProvider ?: return Result.Error("Not connected to MCP server.")
        val device = deviceId ?: return Result.Error("No device ID provided")
        val pkg = packageName ?: return Result.Error("No package name provided")

        return try {
            val client = provider()
            withContext(Dispatchers.IO) {
                val result = client.removeKeyValue(device, pkg, fileName, key)
                if (result.success) Result.Success(Unit)
                else Result.Error(result.message ?: "Failed to remove key value")
            }
        } catch (e: McpConnectionException) {
            Result.Error("MCP server not available: ${e.message}")
        } catch (e: Exception) {
            Result.Error("Failed to remove key value: ${e.message}")
        }
    }

    override suspend fun clearKeyValueFile(fileName: String): Result<Unit> {
        val provider = clientProvider ?: return Result.Error("Not connected to MCP server.")
        val device = deviceId ?: return Result.Error("No device ID provided")
        val pkg = packageName ?: return Result.Error("No package name provided")

        return try {
            val client = provider()
            withContext(Dispatchers.IO) {
                val result = client.clearKeyValueFile(device, pkg, fileName)
                if (result.success) Result.Success(Unit)
                else Result.Error(result.message ?: "Failed to clear key value file")
            }
        } catch (e: McpConnectionException) {
            Result.Error("MCP server not available: ${e.message}")
        } catch (e: Exception) {
            Result.Error("Failed to clear key value file: ${e.message}")
        }
    }

    private fun buildStorageFilesUri(deviceId: String, packageName: String): String {
        val encodedPackage = java.net.URLEncoder.encode(packageName, "UTF-8")
        return "automobile:devices/$deviceId/storage/$encodedPackage/files"
    }

    private fun buildStorageEntriesUri(deviceId: String, packageName: String, fileName: String): String {
        val encodedPackage = java.net.URLEncoder.encode(packageName, "UTF-8")
        val encodedFile = java.net.URLEncoder.encode(fileName, "UTF-8")
        return "automobile:devices/$deviceId/storage/$encodedPackage/$encodedFile/entries"
    }

    private fun mapKeyValueType(type: String): KeyValueType {
        return when (type.uppercase()) {
            "STRING" -> KeyValueType.String
            "INT" -> KeyValueType.Int
            "LONG" -> KeyValueType.Long
            "FLOAT" -> KeyValueType.Float
            "BOOLEAN" -> KeyValueType.Boolean
            "STRING_SET" -> KeyValueType.StringSet
            else -> KeyValueType.Unknown
        }
    }

    private fun parseValue(jsonValue: String?, type: String): Any? {
        if (jsonValue == null) return null

        return try {
            when (type.uppercase()) {
                "STRING" -> jsonValue
                "INT" -> jsonValue.toIntOrNull() ?: jsonValue
                "LONG" -> jsonValue.toLongOrNull() ?: jsonValue
                "FLOAT" -> jsonValue.toFloatOrNull() ?: jsonValue
                "BOOLEAN" -> jsonValue.toBooleanStrictOrNull() ?: jsonValue
                "STRING_SET" -> {
                    // Parse JSON array of strings to Set<String>
                    val element = json.parseToJsonElement(jsonValue)
                    element.jsonArray.map { it.jsonPrimitive.content }.toSet()
                }
                else -> jsonValue
            }
        } catch (e: Exception) {
            jsonValue
        }
    }
}

// MCP response models - matches storageResources.ts responses

@Serializable
private data class McpStorageFilesResponse(
    val deviceId: String? = null,
    val packageName: String? = null,
    val files: List<McpPreferenceFile> = emptyList(),
    val totalCount: Int = 0,
    val lastUpdated: String? = null,
    val error: String? = null,
)

@Serializable
private data class McpPreferenceFile(
    val name: String,
    val path: String,
    val entryCount: Int = 0,
)

@Serializable
private data class McpStorageEntriesResponse(
    val deviceId: String? = null,
    val packageName: String? = null,
    val fileName: String? = null,
    val entries: List<McpKeyValueEntry> = emptyList(),
    val totalCount: Int = 0,
    val lastUpdated: String? = null,
    val error: String? = null,
)

@Serializable
private data class McpKeyValueEntry(
    val key: String,
    val value: String? = null,
    val type: String,
)
