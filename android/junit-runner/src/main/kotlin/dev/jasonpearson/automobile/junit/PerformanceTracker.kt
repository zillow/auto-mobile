package dev.jasonpearson.automobile.junit

/**
 * Tracks and logs performance metrics for JUnitRunner operations.
 * Timing output is only printed when automobile.junitrunner.perf.debug=true is set.
 */
object PerformanceTracker {
  // Phase 5: Lazy evaluation of perf debug mode
  private val perfDebugMode: Boolean by lazy {
    System.getProperty("automobile.junitrunner.perf.debug", "false").toBoolean()
  }

  private val timings = mutableMapOf<String, Long>()
  private val measurements = mutableListOf<Pair<String, Long>>()

  fun mark(label: String) {
    timings[label] = System.currentTimeMillis()
  }

  fun measure(label: String, startLabel: String): Long {
    val startTime = timings[startLabel] ?: return -1L
    val endTime = System.currentTimeMillis()
    val duration = endTime - startTime

    measurements.add(Pair(label, duration))

    if (perfDebugMode) {
      System.err.println("[PERF] $label: ${duration}ms")
    }

    return duration
  }

  fun measure(label: String, startTime: Long): Long {
    val endTime = System.currentTimeMillis()
    val duration = endTime - startTime

    measurements.add(Pair(label, duration))

    if (perfDebugMode) {
      System.err.println("[PERF] $label: ${duration}ms")
    }

    return duration
  }

  fun getMeasurements(): List<Pair<String, Long>> {
    return measurements.toList()
  }

  fun clear() {
    timings.clear()
    measurements.clear()
  }
}
