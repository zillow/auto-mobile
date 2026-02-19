package dev.jasonpearson.automobile.ide.navigation

import androidx.compose.ui.graphics.ImageBitmap
import dev.jasonpearson.automobile.ide.daemon.AutoMobileClient
import dev.jasonpearson.automobile.ide.daemon.McpConnectionException
import dev.jasonpearson.automobile.ide.daemon.McpResourceContent
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class NavigationScreenshotLoaderTest {

  @Test
  fun `load returns null when clientProvider is null`() = runBlocking {
    val loader = NavigationScreenshotLoader(
        clientProvider = null,
        imageDecoder = FakeImageDecoder()
    )

    val result = loader.load("automobile:navigation/nodes/123/screenshot")

    assertNull(result)
  }

  @Test
  fun `load returns cached bitmap on second call`() = runBlocking {
    val client = FakeAutoMobileClient()
    client.setResourceResponse("automobile:navigation/nodes/123/screenshot", SMALL_PNG_BASE64)

    val loader = NavigationScreenshotLoader(
        clientProvider = { client },
        imageDecoder = FakeImageDecoder()
    )

    // First call - should fetch from client
    val first = loader.load("automobile:navigation/nodes/123/screenshot")
    assertNotNull(first)
    assertEquals(1, client.readResourceCallCount)

    // Second call - should use cache, not call client again
    val second = loader.load("automobile:navigation/nodes/123/screenshot")
    assertNotNull(second)
    assertEquals(1, client.readResourceCallCount) // Still 1, cache hit
  }

  @Test
  fun `load caches results and respects maxCacheSize LRU eviction`() = runBlocking {
    val client = FakeAutoMobileClient()
    client.setResourceResponse("uri1", SMALL_PNG_BASE64)
    client.setResourceResponse("uri2", SMALL_PNG_BASE64)
    client.setResourceResponse("uri3", SMALL_PNG_BASE64)

    val loader = NavigationScreenshotLoader(
        clientProvider = { client },
        maxCacheSize = 2,
        imageDecoder = FakeImageDecoder()
    )

    // Load three URIs with cache size of 2
    loader.load("uri1")
    loader.load("uri2")
    loader.load("uri3") // This should evict uri1

    assertEquals(3, client.readResourceCallCount)
    assertEquals(2, loader.cacheSize())

    // Access uri2 and uri3 - should be cached
    loader.load("uri2")
    loader.load("uri3")
    assertEquals(3, client.readResourceCallCount) // Still 3, cache hits

    // Access uri1 - should require fetch (was evicted)
    loader.load("uri1")
    assertEquals(4, client.readResourceCallCount) // Now 4, cache miss
  }

  @Test
  fun `load returns null when client throws McpConnectionException`() = runBlocking {
    val client = FakeAutoMobileClient()
    client.throwOnReadResource = McpConnectionException("Connection failed")

    val loader = NavigationScreenshotLoader(
        clientProvider = { client },
        imageDecoder = FakeImageDecoder()
    )

    val result = loader.load("automobile:navigation/nodes/123/screenshot")

    assertNull(result)
    assertEquals(1, client.readResourceCallCount)
  }

  @Test
  fun `load returns null when resource has no blob content`() = runBlocking {
    val client = FakeAutoMobileClient()
    client.setResourceResponseWithText(
        "automobile:navigation/nodes/123/screenshot",
        "text content only"
    )

    val loader = NavigationScreenshotLoader(
        clientProvider = { client },
        imageDecoder = FakeImageDecoder()
    )

    val result = loader.load("automobile:navigation/nodes/123/screenshot")

    assertNull(result)
  }

  @Test
  fun `invalidate removes entry from cache`() = runBlocking {
    val client = FakeAutoMobileClient()
    client.setResourceResponse("automobile:navigation/nodes/123/screenshot", SMALL_PNG_BASE64)

    val loader = NavigationScreenshotLoader(
        clientProvider = { client },
        imageDecoder = FakeImageDecoder()
    )

    // Load to populate cache
    loader.load("automobile:navigation/nodes/123/screenshot")
    assertEquals(1, client.readResourceCallCount)
    assertEquals(1, loader.cacheSize())

    // Invalidate
    loader.invalidate("automobile:navigation/nodes/123/screenshot")
    assertEquals(0, loader.cacheSize())

    // Load again - should fetch from client
    loader.load("automobile:navigation/nodes/123/screenshot")
    assertEquals(2, client.readResourceCallCount)
  }

  @Test
  fun `clearCache removes all entries`() = runBlocking {
    val client = FakeAutoMobileClient()
    client.setResourceResponse("uri1", SMALL_PNG_BASE64)
    client.setResourceResponse("uri2", SMALL_PNG_BASE64)

    val loader = NavigationScreenshotLoader(
        clientProvider = { client },
        imageDecoder = FakeImageDecoder()
    )

    // Load multiple entries
    loader.load("uri1")
    loader.load("uri2")
    assertEquals(2, loader.cacheSize())

    // Clear cache
    loader.clearCache()
    assertEquals(0, loader.cacheSize())

    // Load again - should fetch from client
    loader.load("uri1")
    loader.load("uri2")
    assertEquals(4, client.readResourceCallCount) // 2 original + 2 after clear
  }

  companion object {
    // Minimal valid PNG base64 - only used to simulate blob content
    private const val SMALL_PNG_BASE64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  }
}

/**
 * Fake ImageDecoder for testing that returns a mock ImageBitmap without Skia dependencies.
 * Creates a unique bitmap per byte array content for identity checks.
 */
class FakeImageDecoder : ImageDecoder {
  private val bitmapCache = mutableMapOf<String, ImageBitmap>()

  override fun decode(bytes: ByteArray): ImageBitmap {
    // Create a cache key from bytes to return consistent bitmaps for same content
    val key = bytes.contentHashCode().toString()
    return bitmapCache.getOrPut(key) { FakeImageBitmap() }
  }
}

/**
 * Minimal fake ImageBitmap for testing.
 * Uses a stub implementation since tests only need identity/null checks.
 */
class FakeImageBitmap : ImageBitmap {
  override val colorSpace get() = throw NotImplementedError("Stub")
  override val config get() = throw NotImplementedError("Stub")
  override val hasAlpha get() = true
  override val height get() = 1
  override val width get() = 1

  override fun prepareToDraw() {}

  override fun readPixels(
      buffer: IntArray,
      startX: Int,
      startY: Int,
      width: Int,
      height: Int,
      bufferOffset: Int,
      stride: Int
  ) {}
}

/**
 * Fake implementation of AutoMobileClient for testing NavigationScreenshotLoader.
 * Only implements readResource() as that's the only method used by the loader.
 */
class FakeAutoMobileClient : AutoMobileClient {
  private val resourceResponses = mutableMapOf<String, McpResourceContent>()
  var throwOnReadResource: McpConnectionException? = null
  var readResourceCallCount = 0
    private set

  override val transportName: String = "fake"
  override val connectionDescription: String = "Fake client for testing"

  fun setResourceResponse(uri: String, blobBase64: String) {
    resourceResponses[uri] = McpResourceContent(
        uri = uri,
        mimeType = "image/png",
        blob = blobBase64
    )
  }

  fun setResourceResponseWithText(uri: String, text: String) {
    resourceResponses[uri] = McpResourceContent(
        uri = uri,
        mimeType = "text/plain",
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
  override fun setFeatureFlag(
      key: String,
      enabled: Boolean,
      config: kotlinx.serialization.json.JsonObject?
  ) = notImplemented()
  override fun listPerformanceAuditResults(
      startTime: String?,
      endTime: String?,
      limit: Int?,
      offset: Int?
  ) = notImplemented()
  override fun getTestTimings(query: dev.jasonpearson.automobile.ide.daemon.TestTimingQuery) =
      notImplemented()
  override fun startTestRecording(platform: String) = notImplemented()
  override fun stopTestRecording(recordingId: String?, planName: String?) = notImplemented()
  override fun executePlan(
      planContent: String,
      platform: String,
      startStep: Int?,
      sessionUuid: String?
  ) = notImplemented()
  override fun startDevice(name: String, platform: String, deviceId: String?) = notImplemented()
  override fun setActiveDevice(deviceId: String, platform: String) = notImplemented()
  override fun getTestRuns(query: dev.jasonpearson.automobile.ide.daemon.TestRunQuery) =
      notImplemented()
  override fun observe(platform: String) = notImplemented()
  override fun killDevice(name: String, deviceId: String, platform: String) = notImplemented()
  override fun getDaemonStatus() = notImplemented()
  override fun updateService(deviceId: String, platform: String) = notImplemented()
  override fun setKeyValue(deviceId: String, appId: String, fileName: String, key: String, value: String?, type: String) = notImplemented()
  override fun removeKeyValue(deviceId: String, appId: String, fileName: String, key: String) = notImplemented()
  override fun clearKeyValueFile(deviceId: String, appId: String, fileName: String) = notImplemented()

  private fun notImplemented(): Nothing =
      throw NotImplementedError("FakeAutoMobileClient: method not implemented for testing")
}
