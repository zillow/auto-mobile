package dev.jasonpearson.automobile.junit

import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Serializable
internal data class TestTimingStatusCounts(
    val passed: Int = 0,
    val failed: Int = 0,
    val skipped: Int = 0,
)

@Serializable
internal data class TestTimingEntry(
    val testClass: String,
    val testMethod: String,
    val averageDurationMs: Int = 0,
    val sampleSize: Int = 0,
    val lastRun: String? = null,
    val lastRunTimestampMs: Long? = null,
    val successRate: Double? = null,
    val failureRate: Double? = null,
    val stdDevDurationMs: Int? = null,
    val statusCounts: TestTimingStatusCounts? = null,
)

@Serializable
internal data class TestTimingSummary(
    val testTimings: List<TestTimingEntry> = emptyList(),
    val generatedAt: String? = null,
    val totalTests: Int = 0,
    val totalSamples: Int = 0,
)

internal data class TestTimingKey(val testClass: String, val testMethod: String)

internal object TestTimingCache {
  private const val DEFAULT_LOOKBACK_DAYS = 90
  private const val DEFAULT_LIMIT = 1000
  private const val DEFAULT_MIN_SAMPLES = 1
  private const val DEFAULT_TIMEOUT_MS = 5000L

  private val json = Json { ignoreUnknownKeys = true }
  private val loaded = AtomicBoolean(false)
  private val loadLock = Any()

  @Volatile private var timingMap: Map<TestTimingKey, TestTimingEntry> = emptyMap()
  @Volatile private var summary: TestTimingSummary? = null

  fun prefetchIfEnabled() {
    if (!isEnabled()) {
      return
    }

    if (loaded.get()) {
      return
    }

    synchronized(loadLock) {
      if (loaded.get()) {
        return
      }
      loadFromDaemon()
      loaded.set(true)
    }
  }

  fun getTiming(testClass: String, testMethod: String): TestTimingEntry? {
    prefetchIfEnabled()
    return timingMap[TestTimingKey(testClass, testMethod)]
  }

  fun hasTimings(): Boolean {
    prefetchIfEnabled()
    return timingMap.isNotEmpty()
  }

  fun getSummary(): TestTimingSummary? {
    prefetchIfEnabled()
    return summary
  }

  fun clear() {
    timingMap = emptyMap()
    summary = null
    loaded.set(false)
  }

  private fun isEnabled(): Boolean {
    if (isCiMode()) {
      return false
    }
    return SystemPropertyCache.getBoolean("automobile.junit.timing.enabled", true)
  }

  private fun isCiMode(): Boolean {
    if (SystemPropertyCache.getBoolean("automobile.ci.mode", false)) {
      return true
    }
    val envValue = System.getenv("CI") ?: return false
    return envValue.equals("true", ignoreCase = true) || envValue == "1"
  }

  private fun loadFromDaemon() {
    val args = buildRequestArgs()
    try {
      val response =
          DaemonSocketClientManager.callTool("getTestTimings", args, resolveTimeoutMs())
      val payload = extractToolPayload(response)
      if (payload.isNullOrBlank()) {
        return
      }

      val parsed = json.decodeFromString(TestTimingSummary.serializer(), payload)
      summary = parsed
      timingMap = parsed.testTimings.associateBy { TestTimingKey(it.testClass, it.testMethod) }
    } catch (e: Exception) {
    }
  }

  private fun buildRequestArgs(): JsonObject {
    val values = mutableMapOf<String, JsonElement>()
    values["lookbackDays"] = JsonPrimitive(resolvePositiveIntProperty(
        "automobile.junit.timing.lookback.days",
        DEFAULT_LOOKBACK_DAYS
    ))
    values["limit"] = JsonPrimitive(resolvePositiveIntProperty(
        "automobile.junit.timing.limit",
        DEFAULT_LIMIT
    ))
    values["minSamples"] = JsonPrimitive(resolveMinSamples())
    values["devicePlatform"] = JsonPrimitive("android")
    return JsonObject(values)
  }

  private fun resolveMinSamples(): Int {
    val value =
        SystemPropertyCache.get("automobile.junit.timing.min.samples", DEFAULT_MIN_SAMPLES.toString())
            .toIntOrNull()
    return when {
      value == null -> DEFAULT_MIN_SAMPLES
      value < 0 -> 0
      else -> value
    }
  }

  private fun resolvePositiveIntProperty(name: String, fallback: Int): Int {
    val value = SystemPropertyCache.get(name, fallback.toString()).toIntOrNull()
    return if (value != null && value > 0) value else fallback
  }

  private fun resolveTimeoutMs(): Long {
    val value =
        SystemPropertyCache.get(
            "automobile.junit.timing.fetch.timeout.ms",
            DEFAULT_TIMEOUT_MS.toString(),
        ).toLongOrNull()
    return if (value != null && value > 0) value else DEFAULT_TIMEOUT_MS
  }

  private fun extractToolPayload(response: DaemonResponse): String? {
    if (!response.success) {
      return null
    }

    val resultElement = response.result ?: return null
    val resultObject = resultElement.jsonObject
    val contentElement = resultObject["content"]
    if (contentElement !is JsonArray || contentElement.isEmpty()) {
      return null
    }
    val first = contentElement.first().jsonObject
    if (first["type"]?.jsonPrimitive?.content != "text") {
      return null
    }
    return first["text"]?.jsonPrimitive?.content
  }
}
