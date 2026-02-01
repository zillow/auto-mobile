package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.McpConnectionException
import dev.jasonpearson.automobile.ide.storage.DatabaseInfo
import dev.jasonpearson.automobile.ide.storage.KeyValueEntry
import dev.jasonpearson.automobile.ide.storage.KeyValueFile
import dev.jasonpearson.automobile.ide.storage.KeyValueType
import dev.jasonpearson.automobile.ide.storage.StoragePlatform
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive

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
) : StorageDataSource {
    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun getDatabases(): Result<List<DatabaseInfo>> {
        // Database inspection not yet implemented in MCP server
        // Return empty list for now - will be implemented in a future PR
        return Result.Success(emptyList())
    }

    override suspend fun getKeyValueFiles(): Result<List<KeyValueFile>> {
        val provider = clientProvider ?: return Result.Success(emptyList())
        val device = deviceId ?: return Result.Error("No device ID provided")
        val pkg = packageName ?: return Result.Error("No package name provided")

        return try {
            val client = provider()

            // First, get the list of storage files
            val filesUri = buildStorageFilesUri(device, pkg)
            val filesContents = client.readResource(filesUri)
            val filesText = filesContents.firstOrNull()?.text
                ?: return Result.Success(emptyList())

            val filesResponse = json.decodeFromString(McpStorageFilesResponse.serializer(), filesText)

            // Check for error in response
            if (filesResponse.error != null) {
                return Result.Error(filesResponse.error)
            }

            // For each file, fetch its entries
            val keyValueFiles = filesResponse.files.map { file ->
                val entriesUri = buildStorageEntriesUri(device, pkg, file.name)
                val entriesContents = client.readResource(entriesUri)
                val entriesText = entriesContents.firstOrNull()?.text

                val entries = if (entriesText != null) {
                    val entriesResponse = json.decodeFromString(
                        McpStorageEntriesResponse.serializer(),
                        entriesText
                    )
                    entriesResponse.entries.map { entry ->
                        KeyValueEntry(
                            key = entry.key,
                            value = parseValue(entry.value, entry.type),
                            type = mapKeyValueType(entry.type),
                        )
                    }
                } else {
                    emptyList()
                }

                KeyValueFile(
                    name = file.name,
                    path = file.path,
                    platform = StoragePlatform.Android,
                    entries = entries,
                )
            }

            Result.Success(keyValueFiles)
        } catch (e: McpConnectionException) {
            Result.Error("MCP server not available: ${e.message}")
        } catch (e: Exception) {
            Result.Error("Failed to load storage data: ${e.message}")
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
