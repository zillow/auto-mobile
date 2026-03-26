package dev.jasonpearson.automobile.desktop.core.daemon

import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class TestRunStep(
    val id: Int,
    val index: Int,
    val action: String,
    val target: String? = null,
    val screenshotPath: String? = null,
    val screenName: String? = null,
    val durationMs: Int,
    val status: String, // "completed", "failed", "skipped"
    val errorMessage: String? = null,
)

@Serializable
data class TestRunEntry(
    val id: Int,
    val testClass: String,
    val testMethod: String,
    val testName: String,
    val status: String, // "passed", "failed", "skipped"
    val startTime: Long,
    val durationMs: Int,
    val deviceId: String? = null,
    val deviceName: String? = null,
    val platform: String? = null,
    val errorMessage: String? = null,
    val videoPath: String? = null,
    val snapshotPath: String? = null,
    val steps: List<TestRunStep> = emptyList(),
    val screensVisited: List<String> = emptyList(),
    val sampleSize: Int = 0,
)

@Serializable
data class TestRunQuery(
    val lookbackDays: Int? = null,
    val limit: Int? = null,
    val orderDirection: String? = null,
    val latestOnly: Boolean? = null,
)

@Serializable
data class TestRunSummary(
    val testRuns: List<TestRunEntry> = emptyList(),
    val generatedAt: String? = null,
    val totalRuns: Int = 0,
    val query: JsonObject? = null,
    val filters: JsonObject? = null,
)

private const val TEST_RUN_RESOURCE_URI = "automobile:test-runs"

fun TestRunQuery.toResourceUri(): String {
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
    fun addBool(key: String, value: Boolean?) {
        if (value != null) {
            params.add(key to value.toString())
        }
    }

    addInt("lookbackDays", lookbackDays)
    addInt("limit", limit)
    addParam("orderDirection", orderDirection)
    addBool("latestOnly", latestOnly)

    if (params.isEmpty()) {
        return TEST_RUN_RESOURCE_URI
    }

    val query = params.joinToString("&") { (key, value) -> "$key=${encodeQueryParam(value)}" }
    return "$TEST_RUN_RESOURCE_URI?$query"
}

private fun encodeQueryParam(value: String): String =
    URLEncoder.encode(value, StandardCharsets.UTF_8.name())
