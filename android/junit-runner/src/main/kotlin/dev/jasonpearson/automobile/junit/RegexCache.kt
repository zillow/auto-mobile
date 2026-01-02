package dev.jasonpearson.automobile.junit

/**
 * Phase 6 optimization: Caches compiled regex patterns to avoid repeated compilation.
 * Regex compilation has measurable overhead; caching patterns used multiple times per test reduces allocations.
 */
object RegexCache {
  private val cache = mutableMapOf<String, Regex>()

  fun getRegex(pattern: String, options: Set<RegexOption> = emptySet()): Regex {
    val key = if (options.isEmpty()) pattern else "$pattern:${options.joinToString(",")}"
    return cache.getOrPut(key) { Regex(pattern, options) }
  }

  fun clear() {
    cache.clear()
  }
}
