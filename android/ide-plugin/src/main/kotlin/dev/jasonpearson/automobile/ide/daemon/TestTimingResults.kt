package dev.jasonpearson.automobile.ide.daemon

import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class TestTimingStatusCounts(
    val passed: Int = 0,
    val failed: Int = 0,
    val skipped: Int = 0,
)

@Serializable
data class TestTimingEntry(
    val testClass: String,
    val testMethod: String,
    val averageDurationMs: Int = 0,
    val sampleSize: Int = 0,
    val lastRun: String? = null,
    val lastRunTimestampMs: Long? = null,
    val successRate: Double = 0.0,
    val failureRate: Double = 0.0,
    val stdDevDurationMs: Int? = null,
    val statusCounts: TestTimingStatusCounts? = null,
)

@Serializable
data class TestTimingAggregation(
    val strategy: String? = null,
    val lookbackDays: Int? = null,
    val minSamples: Int? = null,
    val limit: Int? = null,
    val orderBy: String? = null,
    val orderDirection: String? = null,
)

@Serializable
data class TestTimingSummary(
    val testTimings: List<TestTimingEntry> = emptyList(),
    val generatedAt: String? = null,
    val totalTests: Int = 0,
    val totalSamples: Int = 0,
    val aggregation: TestTimingAggregation? = null,
    val filters: JsonObject? = null,
)

enum class TestTimingOrderBy(val apiValue: String) {
  LAST_RUN("lastRun"),
  AVERAGE_DURATION("averageDuration"),
  SAMPLE_SIZE("sampleSize"),
}

enum class TestTimingOrderDirection(val apiValue: String) {
  ASC("asc"),
  DESC("desc"),
}

data class TestTimingQuery(
    val lookbackDays: Int? = null,
    val limit: Int? = null,
    val minSamples: Int? = null,
    val orderBy: TestTimingOrderBy? = null,
    val orderDirection: TestTimingOrderDirection? = null,
    val testClass: String? = null,
    val testMethod: String? = null,
    val deviceId: String? = null,
    val deviceName: String? = null,
    val devicePlatform: String? = null,
    val deviceType: String? = null,
    val appVersion: String? = null,
    val gitCommit: String? = null,
    val targetSdk: Int? = null,
    val jdkVersion: String? = null,
    val jvmTarget: String? = null,
    val gradleVersion: String? = null,
    val isCi: Boolean? = null,
    val sessionUuid: String? = null,
)

private const val TEST_TIMING_RESOURCE_URI = "automobile:test-timings"

fun TestTimingQuery.toResourceUri(): String {
  val params = mutableListOf<Pair<String, String>>()
  fun addParam(key: String, value: String?) {
    if (!value.isNullOrBlank()) {
      params.add(key to value)
    }
  }
  fun addInt(key: String, value: Int?) {
    if (value != null) {
      params.add(key to value.toString())
    }
  }

  addInt("lookbackDays", lookbackDays)
  addInt("limit", limit)
  addInt("minSamples", minSamples)
  addParam("orderBy", orderBy?.apiValue)
  addParam("orderDirection", orderDirection?.apiValue)
  addParam("testClass", testClass)
  addParam("testMethod", testMethod)
  addParam("deviceId", deviceId)
  addParam("deviceName", deviceName)
  addParam("devicePlatform", devicePlatform)
  addParam("deviceType", deviceType)
  addParam("appVersion", appVersion)
  addParam("gitCommit", gitCommit)
  addInt("targetSdk", targetSdk)
  addParam("jdkVersion", jdkVersion)
  addParam("jvmTarget", jvmTarget)
  addParam("gradleVersion", gradleVersion)
  if (isCi != null) {
    params.add("isCi" to isCi.toString())
  }
  addParam("sessionUuid", sessionUuid)

  if (params.isEmpty()) {
    return TEST_TIMING_RESOURCE_URI
  }

  val query =
      params.joinToString("&") { (key, value) -> "$key=${encodeQueryParam(value)}" }
  return "$TEST_TIMING_RESOURCE_URI?$query"
}

private fun encodeQueryParam(value: String): String =
    URLEncoder.encode(value, StandardCharsets.UTF_8.name())
