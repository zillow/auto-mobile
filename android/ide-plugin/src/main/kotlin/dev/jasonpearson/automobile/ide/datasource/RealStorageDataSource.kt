package dev.jasonpearson.automobile.ide.datasource

import com.intellij.openapi.diagnostic.Logger
import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.McpConnectionException
import dev.jasonpearson.automobile.ide.daemon.decodeToolResponse
import dev.jasonpearson.automobile.ide.storage.ColumnInfo
import dev.jasonpearson.automobile.ide.storage.DatabaseInfo
import dev.jasonpearson.automobile.ide.storage.KeyValueEntry
import dev.jasonpearson.automobile.ide.storage.KeyValueFile
import dev.jasonpearson.automobile.ide.storage.KeyValueType
import dev.jasonpearson.automobile.ide.storage.QueryResult
import dev.jasonpearson.automobile.ide.storage.StoragePlatform
import dev.jasonpearson.automobile.ide.storage.TableInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

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
        LOG.info("getDatabases: deviceId=$deviceId, packageName=$packageName")

        val provider = clientProvider ?: run {
            LOG.warn("getDatabases: No clientProvider")
            return Result.Error("Not connected to MCP server. Please select a device first.")
        }
        val device = deviceId ?: run {
            LOG.warn("getDatabases: No deviceId provided")
            return Result.Error("No device ID provided")
        }
        val pkg = packageName ?: run {
            LOG.warn("getDatabases: No packageName provided")
            return Result.Error("No package name provided")
        }

        return try {
            val client = provider()

            // 1. List databases
            val dbsUri = buildDatabasesUri(device, pkg)
            LOG.info("getDatabases: Fetching from URI: $dbsUri")
            val dbsContents = client.readResource(dbsUri)
            val dbsText = dbsContents.firstOrNull()?.text ?: return Result.Success(emptyList())
            val dbsResponse = json.decodeFromString(McpDatabasesResponse.serializer(), dbsText)

            if (dbsResponse.error != null) {
                LOG.warn("getDatabases: Response error: ${dbsResponse.error}")
                return Result.Error(dbsResponse.error)
            }

            LOG.info("getDatabases: Found ${dbsResponse.databases.size} databases")

            // 2. For each database, get tables and their structure
            val databases = dbsResponse.databases.map { dbEntry ->
                val tablesUri = buildTablesUri(device, dbEntry.path, pkg)
                val tablesContents = client.readResource(tablesUri)
                val tablesText = tablesContents.firstOrNull()?.text
                val tableNames = if (tablesText != null) {
                    val tablesResponse = json.decodeFromString(McpTablesResponse.serializer(), tablesText)
                    tablesResponse.tables
                } else {
                    emptyList()
                }

                LOG.info("getDatabases: DB ${dbEntry.name} has ${tableNames.size} tables")

                // 3. For each table, get structure
                val tables = tableNames.map { tableName ->
                    val structUri = buildTableStructureUri(device, dbEntry.path, tableName, pkg)
                    val structContents = client.readResource(structUri)
                    val structText = structContents.firstOrNull()?.text
                    val columns = if (structText != null) {
                        val structResponse =
                            json.decodeFromString(McpTableStructureResponse.serializer(), structText)
                        structResponse.columns.map { col ->
                            ColumnInfo(
                                name = col.name,
                                type = col.type,
                                isPrimaryKey = col.primaryKey,
                                isNullable = col.nullable,
                                defaultValue = col.defaultValue,
                            )
                        }
                    } else {
                        emptyList()
                    }
                    TableInfo(name = tableName, rowCount = 0, columns = columns)
                }

                DatabaseInfo(
                    name = dbEntry.name,
                    path = dbEntry.path,
                    sizeBytes = dbEntry.sizeBytes,
                    tables = tables,
                )
            }

            LOG.info("getDatabases: Returning ${databases.size} databases")
            Result.Success(databases)
        } catch (e: McpConnectionException) {
            LOG.warn("getDatabases: MCP connection error: ${e.message}", e)
            Result.Error("MCP server not available: ${e.message}")
        } catch (e: Exception) {
            LOG.warn("getDatabases: Exception: ${e.message}", e)
            Result.Error("Failed to load databases: ${e.message}")
        }
    }

    override suspend fun getTableData(
        databasePath: String,
        table: String,
        limit: Int,
        offset: Int,
    ): Result<QueryResult> {
        LOG.info("getTableData: databasePath=$databasePath, table=$table, limit=$limit, offset=$offset")

        val provider = clientProvider ?: return Result.Error("Not connected to MCP server.")
        val device = deviceId ?: return Result.Error("No device ID provided")
        val pkg = packageName ?: return Result.Error("No package name provided")

        return try {
            val client = provider()
            val uri = buildTableDataUri(device, databasePath, table, pkg, limit, offset)
            LOG.info("getTableData: Fetching from URI: $uri")
            val contents = client.readResource(uri)
            val text = contents.firstOrNull()?.text
                ?: return Result.Success(QueryResult(emptyList(), emptyList(), 0, 0))

            val response = json.decodeFromString(McpTableDataResponse.serializer(), text)

            if (response.error != null) {
                return Result.Error(response.error)
            }

            val rows = response.rows.map { row -> row.map { jsonElementToAny(it) } }
            Result.Success(
                QueryResult(
                    columns = response.columns,
                    rows = rows,
                    rowCount = response.total,
                    executionTimeMs = 0,
                )
            )
        } catch (e: McpConnectionException) {
            LOG.warn("getTableData: MCP connection error: ${e.message}", e)
            Result.Error("MCP server not available: ${e.message}")
        } catch (e: Exception) {
            LOG.warn("getTableData: Exception: ${e.message}", e)
            Result.Error("Failed to load table data: ${e.message}")
        }
    }

    override suspend fun executeSQL(databasePath: String, query: String): Result<QueryResult> {
        LOG.info("executeSQL: databasePath=$databasePath, query=$query")

        val provider = clientProvider ?: return Result.Error("Not connected to MCP server.")
        val device = deviceId ?: return Result.Error("No device ID provided")
        val pkg = packageName ?: return Result.Error("No package name provided")

        return try {
            val client = provider()
            val arguments = buildJsonObject {
                put("deviceId", device)
                put("appId", pkg)
                put("databasePath", databasePath)
                put("query", query)
            }
            val toolElement = client.callTool("sqlQuery", arguments)
            val sqlResult = decodeToolResponse(json, toolElement, McpSqlResult.serializer())

            if (sqlResult.error != null) {
                return Result.Success(
                    QueryResult(emptyList(), emptyList(), 0, 0, error = sqlResult.error)
                )
            }

            val queryResult = if (sqlResult.type == "mutation") {
                val rowsAffected = sqlResult.rowsAffected ?: 0
                QueryResult(
                    columns = listOf("rows_affected"),
                    rows = listOf(listOf(rowsAffected)),
                    rowCount = rowsAffected,
                    executionTimeMs = 0,
                )
            } else {
                val rows = sqlResult.rows.map { row -> row.map { jsonElementToAny(it) } }
                QueryResult(
                    columns = sqlResult.columns,
                    rows = rows,
                    rowCount = rows.size,
                    executionTimeMs = 0,
                )
            }
            Result.Success(queryResult)
        } catch (e: McpConnectionException) {
            LOG.warn("executeSQL: MCP connection error: ${e.message}", e)
            Result.Error("MCP server not available: ${e.message}")
        } catch (e: Exception) {
            LOG.warn("executeSQL: Exception: ${e.message}", e)
            Result.Error("Failed to execute SQL: ${e.message}")
        }
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
            LOG.warn("getKeyValueFiles: MCP connection error: ${e.message}", e)
            Result.Error("MCP server not available: ${e.message}")
        } catch (e: Exception) {
            LOG.warn("getKeyValueFiles: Exception during fetch: ${e.message}", e)
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

    private fun buildDatabasesUri(deviceId: String, packageName: String): String {
        val encodedPackage = java.net.URLEncoder.encode(packageName, "UTF-8")
        return "automobile:devices/$deviceId/databases?appId=$encodedPackage"
    }

    private fun buildTablesUri(deviceId: String, databasePath: String, packageName: String): String {
        val encodedPath = java.net.URLEncoder.encode(databasePath, "UTF-8")
        val encodedPackage = java.net.URLEncoder.encode(packageName, "UTF-8")
        return "automobile:devices/$deviceId/databases/$encodedPath/tables?appId=$encodedPackage"
    }

    private fun buildTableStructureUri(
        deviceId: String,
        databasePath: String,
        table: String,
        packageName: String,
    ): String {
        val encodedPath = java.net.URLEncoder.encode(databasePath, "UTF-8")
        val encodedTable = java.net.URLEncoder.encode(table, "UTF-8")
        val encodedPackage = java.net.URLEncoder.encode(packageName, "UTF-8")
        return "automobile:devices/$deviceId/databases/$encodedPath/tables/$encodedTable/structure?appId=$encodedPackage"
    }

    private fun buildTableDataUri(
        deviceId: String,
        databasePath: String,
        table: String,
        packageName: String,
        limit: Int,
        offset: Int,
    ): String {
        val encodedPath = java.net.URLEncoder.encode(databasePath, "UTF-8")
        val encodedTable = java.net.URLEncoder.encode(table, "UTF-8")
        val encodedPackage = java.net.URLEncoder.encode(packageName, "UTF-8")
        return "automobile:devices/$deviceId/databases/$encodedPath/tables/$encodedTable/data?appId=$encodedPackage&limit=$limit&offset=$offset"
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

    private fun jsonElementToAny(element: JsonElement): Any? {
        return when (element) {
            is JsonNull -> null
            is JsonPrimitive -> when {
                element.isString -> element.content
                element.content == "true" || element.content == "false" ->
                    element.content.toBooleanStrictOrNull() ?: element.content
                element.content.toLongOrNull() != null -> element.content.toLong()
                element.content.toDoubleOrNull() != null -> element.content.toDouble()
                else -> element.content
            }
            else -> element.toString()
        }
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

// MCP response models for database resources

@Serializable
private data class McpDatabasesResponse(
    val databases: List<McpDatabaseEntry> = emptyList(),
    val error: String? = null,
)

@Serializable
private data class McpDatabaseEntry(
    val name: String,
    val path: String,
    val sizeBytes: Long = 0,
)

@Serializable
private data class McpTablesResponse(
    val tables: List<String> = emptyList(),
    val error: String? = null,
)

@Serializable
private data class McpTableStructureResponse(
    val columns: List<McpColumnDef> = emptyList(),
    val error: String? = null,
)

@Serializable
private data class McpColumnDef(
    val name: String,
    val type: String,
    val nullable: Boolean = true,
    val primaryKey: Boolean = false,
    val defaultValue: String? = null,
)

@Serializable
private data class McpTableDataResponse(
    val columns: List<String> = emptyList(),
    val rows: List<List<JsonElement>> = emptyList(),
    val total: Int = 0,
    val error: String? = null,
)

@Serializable
private data class McpSqlResult(
    val type: String = "query",
    val message: String? = null,
    val columns: List<String> = emptyList(),
    val rows: List<List<JsonElement>> = emptyList(),
    val rowsAffected: Int? = null,
    val error: String? = null,
)

// MCP response models for storage (key-value) resources

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
