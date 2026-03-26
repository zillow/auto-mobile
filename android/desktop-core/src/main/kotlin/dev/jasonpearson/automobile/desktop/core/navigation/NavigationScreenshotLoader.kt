package dev.jasonpearson.automobile.desktop.core.navigation

import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toComposeImageBitmap
import dev.jasonpearson.automobile.desktop.core.daemon.AutoMobileClient
import dev.jasonpearson.automobile.desktop.core.daemon.McpConnectionException
import org.jetbrains.skia.Image
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap

/**
 * Interface for loading screenshot images from URIs.
 */
interface ScreenshotLoader {
    suspend fun load(uri: String): ImageBitmap?
    fun invalidate(uri: String)
    fun clearCache()
    fun cacheSize(): Int
}

/**
 * Interface for decoding bytes into ImageBitmap.
 * Extracted for testability since Skia native libraries aren't available in unit tests.
 */
fun interface ImageDecoder {
    fun decode(bytes: ByteArray): ImageBitmap
}

/**
 * Default implementation using Skia for production use.
 */
object SkiaImageDecoder : ImageDecoder {
    override fun decode(bytes: ByteArray): ImageBitmap {
        val skiaImage = Image.makeFromEncoded(bytes)
        return skiaImage.toComposeImageBitmap()
    }
}

/**
 * Fake implementation of ScreenshotLoader for testing.
 * Stores images in memory and tracks load calls without making network requests.
 */
class FakeScreenshotLoader : ScreenshotLoader {
    private val images = mutableMapOf<String, ImageBitmap>()
    private val loadCalls = mutableListOf<String>()

    fun setImage(uri: String, bitmap: ImageBitmap) {
        images[uri] = bitmap
    }

    fun getLoadCalls(): List<String> = loadCalls.toList()

    override suspend fun load(uri: String): ImageBitmap? {
        loadCalls.add(uri)
        return images[uri]
    }

    override fun invalidate(uri: String) {
        images.remove(uri)
    }

    override fun clearCache() {
        images.clear()
    }

    override fun cacheSize(): Int = images.size
}

/**
 * Loads and caches screenshot thumbnails for navigation graph nodes.
 * Uses an in-memory LRU cache to avoid repeated MCP requests.
 */
class NavigationScreenshotLoader(
    private val clientProvider: (() -> AutoMobileClient)?,
    private val maxCacheSize: Int = 50, // Maximum number of cached images
    private val imageDecoder: ImageDecoder = SkiaImageDecoder,
) : ScreenshotLoader {
    private val cache = ConcurrentHashMap<String, ImageBitmap>()
    private val accessOrder = mutableListOf<String>() // Track access order for LRU eviction

    /**
     * Load a screenshot from MCP resource URI.
     * Returns cached bitmap if available, otherwise fetches from server.
     *
     * @param uri The MCP resource URI (e.g., "automobile:navigation/nodes/123/screenshot")
     * @return ImageBitmap if successful, null if loading failed or no screenshot available
     */
    override suspend fun load(uri: String): ImageBitmap? {
        // Check cache first
        cache[uri]?.let { bitmap ->
            // Update access order for LRU
            synchronized(accessOrder) {
                accessOrder.remove(uri)
                accessOrder.add(uri)
            }
            return bitmap
        }

        // Fetch from MCP
        val provider = clientProvider ?: return null

        return try {
            val client = provider()
            val contents = client.readResource(uri)
            val content = contents.firstOrNull() ?: return null

            // Check if it's a binary blob (base64 encoded)
            val blob = content.blob ?: return null

            // Decode base64 to bytes
            val bytes = Base64.getDecoder().decode(blob)

            // Convert to ImageBitmap using injected decoder
            val bitmap = imageDecoder.decode(bytes)

            // Add to cache
            addToCache(uri, bitmap)

            bitmap
        } catch (e: McpConnectionException) {
            // MCP not available
            null
        } catch (e: Exception) {
            // Decoding or other error
            null
        }
    }

    private fun addToCache(uri: String, bitmap: ImageBitmap) {
        synchronized(accessOrder) {
            // Evict oldest entries if cache is full
            while (accessOrder.size >= maxCacheSize) {
                val oldest = accessOrder.removeFirstOrNull() ?: break
                cache.remove(oldest)
            }

            cache[uri] = bitmap
            accessOrder.add(uri)
        }
    }

    /**
     * Invalidate a specific cache entry.
     */
    override fun invalidate(uri: String) {
        synchronized(accessOrder) {
            cache.remove(uri)
            accessOrder.remove(uri)
        }
    }

    /**
     * Clear the entire cache.
     */
    override fun clearCache() {
        synchronized(accessOrder) {
            cache.clear()
            accessOrder.clear()
        }
    }

    /**
     * Get the current cache size.
     */
    override fun cacheSize(): Int = cache.size
}
