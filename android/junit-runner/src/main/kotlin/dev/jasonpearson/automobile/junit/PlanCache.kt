package dev.jasonpearson.automobile.junit

/**
 * Caches plan file paths and content to avoid repeated resolution and I/O for identical plans. This
 * is particularly useful when multiple tests use the same YAML plan file.
 */
object PlanCache {
  private const val DEFAULT_MAX_ENTRIES = 100

  private val cacheEnabled: Boolean by lazy {
    System.getProperty("automobile.junit.plan.cache.enabled", "true").toBoolean()
  }

  private val maxEntries: Int by lazy {
    val configured =
        System.getProperty("automobile.junit.plan.cache.max.entries", DEFAULT_MAX_ENTRIES.toString())
            .toIntOrNull()
    when {
      configured == null -> DEFAULT_MAX_ENTRIES
      configured < 0 -> 0
      else -> configured
    }
  }

  private val pathCache = createLruCache()
  private val contentCache = createLruCache()

  /** Cache a resolved plan path by its annotation value. */
  @Synchronized
  fun cachePath(planValue: String, resolvedPath: String) {
    if (!isEnabled()) {
      return
    }
    pathCache[planValue] = resolvedPath
  }

  /** Get a cached plan path, or null if not cached. */
  @Synchronized
  fun getCachedPath(planValue: String): String? {
    if (!isEnabled()) {
      return null
    }
    return pathCache[planValue]
  }

  /** Cache plan file content by its resolved path. */
  @Synchronized
  fun cacheContent(resolvedPath: String, content: String) {
    if (!isEnabled()) {
      return
    }
    contentCache[resolvedPath] = content
  }

  /** Get cached plan file content, or null if not cached. */
  @Synchronized
  fun getCachedContent(resolvedPath: String): String? {
    if (!isEnabled()) {
      return null
    }
    return contentCache[resolvedPath]
  }

  @Synchronized
  fun clear() {
    pathCache.clear()
    contentCache.clear()
  }

  private fun isEnabled(): Boolean {
    return cacheEnabled && maxEntries > 0
  }

  private fun createLruCache(): LinkedHashMap<String, String> {
    return object : LinkedHashMap<String, String>(16, 0.75f, true) {
      override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>): Boolean {
        val limit = maxEntries
        return limit > 0 && size > limit
      }
    }
  }
}
