package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.ClearKeyValueResult
import dev.jasonpearson.automobile.ide.daemon.McpConnectionException
import dev.jasonpearson.automobile.ide.daemon.McpResourceContent
import dev.jasonpearson.automobile.ide.daemon.RemoveKeyValueResult
import dev.jasonpearson.automobile.ide.daemon.SetKeyValueResult
import dev.jasonpearson.automobile.ide.daemon.TestRunQuery
import dev.jasonpearson.automobile.ide.daemon.TestTimingQuery
import dev.jasonpearson.automobile.ide.storage.KeyValueType
import dev.jasonpearson.automobile.ide.storage.StoragePlatform
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RealStorageDataSourceTest {

    @Test
    fun `getKeyValueFiles returns error when no clientProvider`() = runBlocking {
        val dataSource = RealStorageDataSource()

        val result = dataSource.getKeyValueFiles()

        assertTrue(result is Result.Error)
        assertTrue((result as Result.Error).message.contains("Not connected"))
    }

    @Test
    fun `getKeyValueFiles returns error when no deviceId`() = runBlocking {
        val client = FakeStorageAutoMobileClient()
        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = null,
            packageName = "com.example.app"
        )

        val result = dataSource.getKeyValueFiles()

        assertTrue(result is Result.Error)
        assertTrue((result as Result.Error).message.contains("device"))
    }

    @Test
    fun `getKeyValueFiles returns error when no packageName`() = runBlocking {
        val client = FakeStorageAutoMobileClient()
        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = "emulator-5554",
            packageName = null
        )

        val result = dataSource.getKeyValueFiles()

        assertTrue(result is Result.Error)
        assertTrue((result as Result.Error).message.contains("package"))
    }

    @Test
    fun `getKeyValueFiles successfully parses MCP files response`() = runBlocking {
        val client = FakeStorageAutoMobileClient()

        // Set up files response
        val filesUri = "automobile:devices/emulator-5554/storage/com.example.app/files"
        val filesResponse = """
            {
                "deviceId": "emulator-5554",
                "packageName": "com.example.app",
                "files": [
                    {"name": "app_prefs", "path": "/data/data/com.example.app/shared_prefs/app_prefs.xml", "entryCount": 2}
                ],
                "totalCount": 1,
                "lastUpdated": "2025-01-01T00:00:00Z"
            }
        """.trimIndent()
        client.setResourceResponseWithText(filesUri, filesResponse)

        // Set up entries response
        val entriesUri = "automobile:devices/emulator-5554/storage/com.example.app/app_prefs/entries"
        val entriesResponse = """
            {
                "deviceId": "emulator-5554",
                "packageName": "com.example.app",
                "fileName": "app_prefs",
                "entries": [
                    {"key": "user_id", "value": "12345", "type": "LONG"},
                    {"key": "dark_mode", "value": "true", "type": "BOOLEAN"}
                ],
                "totalCount": 2,
                "lastUpdated": "2025-01-01T00:00:00Z"
            }
        """.trimIndent()
        client.setResourceResponseWithText(entriesUri, entriesResponse)

        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = "emulator-5554",
            packageName = "com.example.app"
        )

        val result = dataSource.getKeyValueFiles()

        assertTrue(result is Result.Success)
        val files = (result as Result.Success).data
        assertEquals(1, files.size)

        val file = files[0]
        assertEquals("app_prefs", file.name)
        assertEquals("/data/data/com.example.app/shared_prefs/app_prefs.xml", file.path)
        assertEquals(StoragePlatform.Android, file.platform)
        assertEquals(2, file.entries.size)

        val userIdEntry = file.entries.find { it.key == "user_id" }!!
        assertEquals(12345L, userIdEntry.value)
        assertEquals(KeyValueType.Long, userIdEntry.type)

        val darkModeEntry = file.entries.find { it.key == "dark_mode" }!!
        assertEquals(true, darkModeEntry.value)
        assertEquals(KeyValueType.Boolean, darkModeEntry.type)
    }

    @Test
    fun `getKeyValueFiles handles MCP connection error`() = runBlocking {
        val client = FakeStorageAutoMobileClient()
        client.throwOnReadResource = McpConnectionException("Connection failed")

        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = "emulator-5554",
            packageName = "com.example.app"
        )

        val result = dataSource.getKeyValueFiles()

        assertTrue(result is Result.Error)
        assertTrue((result as Result.Error).message.contains("MCP server not available"))
    }

    @Test
    fun `getKeyValueFiles handles error in MCP response`() = runBlocking {
        val client = FakeStorageAutoMobileClient()

        val filesUri = "automobile:devices/emulator-5554/storage/com.example.app/files"
        val filesResponse = """
            {
                "error": "Device not connected"
            }
        """.trimIndent()
        client.setResourceResponseWithText(filesUri, filesResponse)

        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = "emulator-5554",
            packageName = "com.example.app"
        )

        val result = dataSource.getKeyValueFiles()

        assertTrue(result is Result.Error)
        assertTrue((result as Result.Error).message.contains("Device not connected"))
    }

    @Test
    fun `getKeyValueFiles returns empty list when no files`() = runBlocking {
        val client = FakeStorageAutoMobileClient()

        val filesUri = "automobile:devices/emulator-5554/storage/com.example.app/files"
        val filesResponse = """
            {
                "deviceId": "emulator-5554",
                "packageName": "com.example.app",
                "files": [],
                "totalCount": 0,
                "lastUpdated": "2025-01-01T00:00:00Z"
            }
        """.trimIndent()
        client.setResourceResponseWithText(filesUri, filesResponse)

        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = "emulator-5554",
            packageName = "com.example.app"
        )

        val result = dataSource.getKeyValueFiles()

        assertTrue(result is Result.Success)
        assertEquals(emptyList<Any>(), (result as Result.Success).data)
    }

    @Test
    fun `getKeyValueFiles parses all value types correctly`() = runBlocking {
        val client = FakeStorageAutoMobileClient()

        val filesUri = "automobile:devices/emulator-5554/storage/com.example.app/files"
        val filesResponse = """
            {
                "deviceId": "emulator-5554",
                "packageName": "com.example.app",
                "files": [{"name": "prefs", "path": "/path/prefs.xml", "entryCount": 6}],
                "totalCount": 1
            }
        """.trimIndent()
        client.setResourceResponseWithText(filesUri, filesResponse)

        val entriesUri = "automobile:devices/emulator-5554/storage/com.example.app/prefs/entries"
        val entriesResponse = """
            {
                "entries": [
                    {"key": "str_key", "value": "hello", "type": "STRING"},
                    {"key": "int_key", "value": "42", "type": "INT"},
                    {"key": "long_key", "value": "9999999999", "type": "LONG"},
                    {"key": "float_key", "value": "3.14", "type": "FLOAT"},
                    {"key": "bool_key", "value": "false", "type": "BOOLEAN"},
                    {"key": "unknown_key", "value": "???", "type": "CUSTOM"}
                ]
            }
        """.trimIndent()
        client.setResourceResponseWithText(entriesUri, entriesResponse)

        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = "emulator-5554",
            packageName = "com.example.app"
        )

        val result = dataSource.getKeyValueFiles()

        assertTrue(result is Result.Success)
        val entries = (result as Result.Success).data[0].entries

        assertEquals("hello", entries.find { it.key == "str_key" }!!.value)
        assertEquals(KeyValueType.String, entries.find { it.key == "str_key" }!!.type)

        assertEquals(42, entries.find { it.key == "int_key" }!!.value)
        assertEquals(KeyValueType.Int, entries.find { it.key == "int_key" }!!.type)

        assertEquals(9999999999L, entries.find { it.key == "long_key" }!!.value)
        assertEquals(KeyValueType.Long, entries.find { it.key == "long_key" }!!.type)

        assertEquals(3.14f, entries.find { it.key == "float_key" }!!.value)
        assertEquals(KeyValueType.Float, entries.find { it.key == "float_key" }!!.type)

        assertEquals(false, entries.find { it.key == "bool_key" }!!.value)
        assertEquals(KeyValueType.Boolean, entries.find { it.key == "bool_key" }!!.type)

        assertEquals(KeyValueType.Unknown, entries.find { it.key == "unknown_key" }!!.type)
    }

    @Test
    fun `getDatabases returns error when no clientProvider`() = runBlocking {
        val dataSource = RealStorageDataSource()

        val result = dataSource.getDatabases()

        assertTrue(result is Result.Error)
        assertTrue((result as Result.Error).message.contains("Not connected"))
    }

    @Test
    fun `getDatabases returns error when no deviceId`() = runBlocking {
        val client = FakeStorageAutoMobileClient()
        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = null,
            packageName = "com.example.app"
        )

        val result = dataSource.getDatabases()

        assertTrue(result is Result.Error)
        assertTrue((result as Result.Error).message.contains("device"))
    }

    @Test
    fun `getDatabases returns error when no packageName`() = runBlocking {
        val client = FakeStorageAutoMobileClient()
        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = "emulator-5554",
            packageName = null
        )

        val result = dataSource.getDatabases()

        assertTrue(result is Result.Error)
        assertTrue((result as Result.Error).message.contains("package"))
    }

    @Test
    fun `getDatabases successfully parses MCP databases response`() = runBlocking {
        val client = FakeStorageAutoMobileClient()

        val dbsUri = "automobile:devices/emulator-5554/databases?appId=com.example.app"
        client.setResourceResponseWithText(dbsUri, """
            {
                "deviceId": "emulator-5554",
                "appId": "com.example.app",
                "databases": [
                    {"name": "sessions.db", "path": "/data/data/com.example.app/databases/sessions.db"}
                ],
                "totalCount": 1
            }
        """.trimIndent())

        val tablesUri = "automobile:devices/emulator-5554/databases/%2Fdata%2Fdata%2Fcom.example.app%2Fdatabases%2Fsessions.db/tables?appId=com.example.app"
        client.setResourceResponseWithText(tablesUri, """
            {
                "tables": ["sessions"],
                "totalCount": 1
            }
        """.trimIndent())

        val structUri = "automobile:devices/emulator-5554/databases/%2Fdata%2Fdata%2Fcom.example.app%2Fdatabases%2Fsessions.db/tables/sessions/structure?appId=com.example.app"
        client.setResourceResponseWithText(structUri, """
            {
                "columns": [
                    {"name": "id", "type": "INTEGER", "nullable": false, "primaryKey": true, "defaultValue": null},
                    {"name": "session_id", "type": "TEXT", "nullable": false, "primaryKey": false, "defaultValue": null}
                ]
            }
        """.trimIndent())

        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = "emulator-5554",
            packageName = "com.example.app"
        )

        val result = dataSource.getDatabases()

        assertTrue(result is Result.Success)
        val databases = (result as Result.Success).data
        assertEquals(1, databases.size)
        val db = databases[0]
        assertEquals("sessions.db", db.name)
        assertEquals(1, db.tables.size)
        val table = db.tables[0]
        assertEquals("sessions", table.name)
        assertEquals(2, table.columns.size)
        val idCol = table.columns[0]
        assertEquals("id", idCol.name)
        assertEquals("INTEGER", idCol.type)
        assertTrue(idCol.isPrimaryKey)
    }

    // --- setKeyValue tests ---

    @Test
    fun `setKeyValue returns error when no clientProvider`() = runBlocking {
        val dataSource = RealStorageDataSource()

        val result = dataSource.setKeyValue("prefs", "key1", "value1", KeyValueType.String)

        assertTrue(result is Result.Error)
        assertTrue((result as Result.Error).message.contains("Not connected"))
    }

    @Test
    fun `setKeyValue returns error when no deviceId`() = runBlocking {
        val client = FakeStorageAutoMobileClient()
        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = null,
            packageName = "com.example.app"
        )

        val result = dataSource.setKeyValue("prefs", "key1", "value1", KeyValueType.String)

        assertTrue(result is Result.Error)
        assertTrue((result as Result.Error).message.contains("device"))
    }

    @Test
    fun `setKeyValue returns error when no packageName`() = runBlocking {
        val client = FakeStorageAutoMobileClient()
        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = "emulator-5554",
            packageName = null
        )

        val result = dataSource.setKeyValue("prefs", "key1", "value1", KeyValueType.String)

        assertTrue(result is Result.Error)
        assertTrue((result as Result.Error).message.contains("package"))
    }

    @Test
    fun `setKeyValue succeeds and passes correct arguments`() = runBlocking {
        val client = FakeStorageAutoMobileClient()
        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = "emulator-5554",
            packageName = "com.example.app"
        )

        val result = dataSource.setKeyValue("app_prefs", "theme", "dark", KeyValueType.String)

        assertTrue(result is Result.Success)
        val call = client.setKeyValueCalls.single()
        assertEquals("emulator-5554", call.deviceId)
        assertEquals("com.example.app", call.appId)
        assertEquals("app_prefs", call.fileName)
        assertEquals("theme", call.key)
        assertEquals("dark", call.value)
        assertEquals("STRING", call.type)
    }

    @Test
    fun `setKeyValue passes null value correctly`() = runBlocking {
        val client = FakeStorageAutoMobileClient()
        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = "emulator-5554",
            packageName = "com.example.app"
        )

        val result = dataSource.setKeyValue("app_prefs", "theme", null, KeyValueType.String)

        assertTrue(result is Result.Success)
        assertNull(client.setKeyValueCalls.single().value)
    }

    @Test
    fun `setKeyValue returns error when client reports failure`() = runBlocking {
        val client = FakeStorageAutoMobileClient()
        client.setKeyValueResult = SetKeyValueResult(success = false, message = "Write failed")
        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = "emulator-5554",
            packageName = "com.example.app"
        )

        val result = dataSource.setKeyValue("app_prefs", "key", "val", KeyValueType.String)

        assertTrue(result is Result.Error)
        assertTrue((result as Result.Error).message.contains("Write failed"))
    }

    // --- removeKeyValue tests ---

    @Test
    fun `removeKeyValue returns error when no clientProvider`() = runBlocking {
        val dataSource = RealStorageDataSource()

        val result = dataSource.removeKeyValue("prefs", "key1")

        assertTrue(result is Result.Error)
        assertTrue((result as Result.Error).message.contains("Not connected"))
    }

    @Test
    fun `removeKeyValue succeeds and passes correct arguments`() = runBlocking {
        val client = FakeStorageAutoMobileClient()
        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = "emulator-5554",
            packageName = "com.example.app"
        )

        val result = dataSource.removeKeyValue("app_prefs", "old_key")

        assertTrue(result is Result.Success)
        val call = client.removeKeyValueCalls.single()
        assertEquals("emulator-5554", call.deviceId)
        assertEquals("com.example.app", call.appId)
        assertEquals("app_prefs", call.fileName)
        assertEquals("old_key", call.key)
    }

    @Test
    fun `removeKeyValue returns error when client reports failure`() = runBlocking {
        val client = FakeStorageAutoMobileClient()
        client.removeKeyValueResult = RemoveKeyValueResult(success = false, message = "Key not found")
        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = "emulator-5554",
            packageName = "com.example.app"
        )

        val result = dataSource.removeKeyValue("app_prefs", "missing_key")

        assertTrue(result is Result.Error)
        assertTrue((result as Result.Error).message.contains("Key not found"))
    }

    // --- clearKeyValueFile tests ---

    @Test
    fun `clearKeyValueFile returns error when no clientProvider`() = runBlocking {
        val dataSource = RealStorageDataSource()

        val result = dataSource.clearKeyValueFile("prefs")

        assertTrue(result is Result.Error)
        assertTrue((result as Result.Error).message.contains("Not connected"))
    }

    @Test
    fun `clearKeyValueFile succeeds and passes correct arguments`() = runBlocking {
        val client = FakeStorageAutoMobileClient()
        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = "emulator-5554",
            packageName = "com.example.app"
        )

        val result = dataSource.clearKeyValueFile("app_prefs")

        assertTrue(result is Result.Success)
        val call = client.clearKeyValueFileCalls.single()
        assertEquals("emulator-5554", call.deviceId)
        assertEquals("com.example.app", call.appId)
        assertEquals("app_prefs", call.fileName)
    }

    @Test
    fun `clearKeyValueFile returns error when client reports failure`() = runBlocking {
        val client = FakeStorageAutoMobileClient()
        client.clearKeyValueFileResult = ClearKeyValueResult(success = false, message = "Permission denied")
        val dataSource = RealStorageDataSource(
            clientProvider = { client },
            deviceId = "emulator-5554",
            packageName = "com.example.app"
        )

        val result = dataSource.clearKeyValueFile("app_prefs")

        assertTrue(result is Result.Error)
        assertTrue((result as Result.Error).message.contains("Permission denied"))
    }
}

/**
 * Fake AutoMobileClient for storage tests.
 */
class FakeStorageAutoMobileClient : AutoMobileClient {
    private val resourceResponses = mutableMapOf<String, McpResourceContent>()
    var throwOnReadResource: McpConnectionException? = null
    var readResourceCallCount = 0
        private set

    // Write operation results (configurable per test)
    var setKeyValueResult = SetKeyValueResult(success = true)
    var removeKeyValueResult = RemoveKeyValueResult(success = true)
    var clearKeyValueFileResult = ClearKeyValueResult(success = true)

    // Recorded write calls for assertion
    data class SetKeyValueCall(val deviceId: String, val appId: String, val fileName: String, val key: String, val value: String?, val type: String)
    data class RemoveKeyValueCall(val deviceId: String, val appId: String, val fileName: String, val key: String)
    data class ClearKeyValueFileCall(val deviceId: String, val appId: String, val fileName: String)

    val setKeyValueCalls = mutableListOf<SetKeyValueCall>()
    val removeKeyValueCalls = mutableListOf<RemoveKeyValueCall>()
    val clearKeyValueFileCalls = mutableListOf<ClearKeyValueFileCall>()

    override val transportName: String = "fake"
    override val connectionDescription: String = "Fake client for storage testing"

    fun setResourceResponseWithText(uri: String, text: String) {
        resourceResponses[uri] = McpResourceContent(
            uri = uri,
            mimeType = "application/json",
            text = text
        )
    }

    override fun readResource(uri: String): List<McpResourceContent> {
        readResourceCallCount++
        throwOnReadResource?.let { throw it }
        return listOfNotNull(resourceResponses[uri])
    }

    override fun setKeyValue(deviceId: String, appId: String, fileName: String, key: String, value: String?, type: String): SetKeyValueResult {
        setKeyValueCalls.add(SetKeyValueCall(deviceId, appId, fileName, key, value, type))
        return setKeyValueResult
    }

    override fun removeKeyValue(deviceId: String, appId: String, fileName: String, key: String): RemoveKeyValueResult {
        removeKeyValueCalls.add(RemoveKeyValueCall(deviceId, appId, fileName, key))
        return removeKeyValueResult
    }

    override fun clearKeyValueFile(deviceId: String, appId: String, fileName: String): ClearKeyValueResult {
        clearKeyValueFileCalls.add(ClearKeyValueFileCall(deviceId, appId, fileName))
        return clearKeyValueFileResult
    }

    // Unused methods - throw to ensure they're not called unexpectedly
    override fun ping() = notImplemented()
    override fun listResources() = notImplemented()
    override fun listResourceTemplates() = notImplemented()
    override fun listTools() = notImplemented()
    override fun getNavigationGraph(platform: String) = notImplemented()
    override fun listFeatureFlags() = notImplemented()
    override fun setFeatureFlag(key: String, enabled: Boolean, config: JsonObject?) = notImplemented()
    override fun listPerformanceAuditResults(startTime: String?, endTime: String?, limit: Int?, offset: Int?) = notImplemented()
    override fun getTestTimings(query: TestTimingQuery) = notImplemented()
    override fun startTestRecording(platform: String) = notImplemented()
    override fun stopTestRecording(recordingId: String?, planName: String?) = notImplemented()
    override fun executePlan(planContent: String, platform: String, startStep: Int?, sessionUuid: String?) = notImplemented()
    override fun startDevice(name: String, platform: String, deviceId: String?) = notImplemented()
    override fun setActiveDevice(deviceId: String, platform: String) = notImplemented()
    override fun getTestRuns(query: dev.jasonpearson.automobile.ide.daemon.TestRunQuery) = notImplemented()
    override fun observe(platform: String) = notImplemented()
    override fun killDevice(name: String, deviceId: String, platform: String) = notImplemented()
    override fun getDaemonStatus() = notImplemented()
    override fun updateService(deviceId: String, platform: String) = notImplemented()
    override fun callTool(name: String, arguments: JsonObject): JsonElement = notImplemented()

    private fun notImplemented(): Nothing =
        throw NotImplementedError("FakeStorageAutoMobileClient: method not implemented for testing")
}
