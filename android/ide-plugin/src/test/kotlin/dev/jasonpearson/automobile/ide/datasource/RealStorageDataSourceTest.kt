package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.McpConnectionException
import dev.jasonpearson.automobile.ide.daemon.McpResourceContent
import dev.jasonpearson.automobile.ide.daemon.TestRunQuery
import dev.jasonpearson.automobile.ide.daemon.TestTimingQuery
import dev.jasonpearson.automobile.ide.storage.KeyValueType
import dev.jasonpearson.automobile.ide.storage.StoragePlatform
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RealStorageDataSourceTest {

    @Test
    fun `getKeyValueFiles returns empty list when no clientProvider`() = runBlocking {
        val dataSource = RealStorageDataSource()

        val result = dataSource.getKeyValueFiles()

        assertTrue(result is Result.Success)
        assertEquals(emptyList<Any>(), (result as Result.Success).data)
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
    fun `getDatabases returns empty list`() = runBlocking {
        val dataSource = RealStorageDataSource()

        val result = dataSource.getDatabases()

        assertTrue(result is Result.Success)
        assertEquals(emptyList<Any>(), (result as Result.Success).data)
    }
}

/**
 * Fake AutoMobileClient for storage tests.
 * Only implements readResource() as that's the only method used.
 */
class FakeStorageAutoMobileClient : AutoMobileClient {
    private val resourceResponses = mutableMapOf<String, McpResourceContent>()
    var throwOnReadResource: McpConnectionException? = null
    var readResourceCallCount = 0
        private set

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

    private fun notImplemented(): Nothing =
        throw NotImplementedError("FakeStorageAutoMobileClient: method not implemented for testing")
}
