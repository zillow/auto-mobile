package dev.jasonpearson.automobile.ide.daemon

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

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

fun TestTimingQuery.toJsonObject(): JsonObject =
    buildJsonObject {
      if (lookbackDays != null) {
        put("lookbackDays", JsonPrimitive(lookbackDays))
      }
      if (limit != null) {
        put("limit", JsonPrimitive(limit))
      }
      if (minSamples != null) {
        put("minSamples", JsonPrimitive(minSamples))
      }
      if (orderBy != null) {
        put("orderBy", JsonPrimitive(orderBy.apiValue))
      }
      if (orderDirection != null) {
        put("orderDirection", JsonPrimitive(orderDirection.apiValue))
      }
      if (!testClass.isNullOrBlank()) {
        put("testClass", JsonPrimitive(testClass))
      }
      if (!testMethod.isNullOrBlank()) {
        put("testMethod", JsonPrimitive(testMethod))
      }
      if (!deviceId.isNullOrBlank()) {
        put("deviceId", JsonPrimitive(deviceId))
      }
      if (!deviceName.isNullOrBlank()) {
        put("deviceName", JsonPrimitive(deviceName))
      }
      if (!devicePlatform.isNullOrBlank()) {
        put("devicePlatform", JsonPrimitive(devicePlatform))
      }
      if (!deviceType.isNullOrBlank()) {
        put("deviceType", JsonPrimitive(deviceType))
      }
      if (!appVersion.isNullOrBlank()) {
        put("appVersion", JsonPrimitive(appVersion))
      }
      if (!gitCommit.isNullOrBlank()) {
        put("gitCommit", JsonPrimitive(gitCommit))
      }
      if (targetSdk != null) {
        put("targetSdk", JsonPrimitive(targetSdk))
      }
      if (!jdkVersion.isNullOrBlank()) {
        put("jdkVersion", JsonPrimitive(jdkVersion))
      }
      if (!jvmTarget.isNullOrBlank()) {
        put("jvmTarget", JsonPrimitive(jvmTarget))
      }
      if (!gradleVersion.isNullOrBlank()) {
        put("gradleVersion", JsonPrimitive(gradleVersion))
      }
      if (isCi != null) {
        put("isCi", JsonPrimitive(isCi))
      }
      if (!sessionUuid.isNullOrBlank()) {
        put("sessionUuid", JsonPrimitive(sessionUuid))
      }
    }
