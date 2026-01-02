package dev.jasonpearson.automobile.junit

/**
 * Caches plan file paths and content to avoid repeated resolution and I/O for identical plans.
 * This is particularly useful when multiple tests use the same YAML plan file.
 */
object PlanCache {
  private val pathCache = mutableMapOf<String, String>()
  private val contentCache = mutableMapOf<String, String>()

  /**
   * Cache a resolved plan path by its annotation value.
   */
  fun cachePath(planValue: String, resolvedPath: String) {
    pathCache[planValue] = resolvedPath
  }

  /**
   * Get a cached plan path, or null if not cached.
   */
  fun getCachedPath(planValue: String): String? {
    return pathCache[planValue]
  }

  /**
   * Cache plan file content by its resolved path.
   */
  fun cacheContent(resolvedPath: String, content: String) {
    contentCache[resolvedPath] = content
  }

  /**
   * Get cached plan file content, or null if not cached.
   */
  fun getCachedContent(resolvedPath: String): String? {
    return contentCache[resolvedPath]
  }

  fun clear() {
    pathCache.clear()
    contentCache.clear()
  }
}
