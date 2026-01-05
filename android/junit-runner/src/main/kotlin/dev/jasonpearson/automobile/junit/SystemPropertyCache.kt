package dev.jasonpearson.automobile.junit

/**
 * Caches system property lookups to avoid repeated property reads. System property access, while
 * fast, is still unnecessary to repeat per-test.
 */
object SystemPropertyCache {
  private val cache = mutableMapOf<String, String>()

  fun get(name: String, default: String = ""): String {
    return cache.getOrPut(name) { System.getProperty(name, default) }
  }

  fun getBoolean(name: String, default: Boolean = false): Boolean {
    val value = get(name, default.toString())
    return value.toBoolean()
  }

  fun clear() {
    cache.clear()
  }
}
