package dev.jasonpearson.automobile.ideplugin.daemon.unified

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement

/**
 * Typed client facade for the recording domain.
 *
 * Methods:
 * - startTest: Start test recording
 * - stopTest: Stop test recording
 * - getStatus: Get current recording status
 * - getVideoConfig: Get video recording configuration
 * - setVideoConfig: Update video recording configuration
 */
class RecordingClient(private val client: UnifiedSocketClient) {
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Start test recording.
     */
    suspend fun startTest(
        deviceId: String? = null,
        platform: String? = null,
    ): StartRecordingResult {
        val params = buildMap<String, JsonElement> {
            deviceId?.let { put("deviceId", json.encodeToJsonElement(it)) }
            platform?.let { put("platform", json.encodeToJsonElement(it)) }
        }

        val result: JsonElement = client.request(
            domain = Domains.RECORDING,
            method = "test/start",
            params = if (params.isEmpty()) null else json.encodeToJsonElement(params),
        )

        return json.decodeFromJsonElement(result)
    }

    /**
     * Stop test recording.
     */
    suspend fun stopTest(
        recordingId: String? = null,
        planName: String? = null,
    ): StopRecordingResult {
        val params = buildMap<String, JsonElement> {
            recordingId?.let { put("recordingId", json.encodeToJsonElement(it)) }
            planName?.let { put("planName", json.encodeToJsonElement(it)) }
        }

        val result: JsonElement = client.request(
            domain = Domains.RECORDING,
            method = "test/stop",
            params = if (params.isEmpty()) null else json.encodeToJsonElement(params),
        )

        return json.decodeFromJsonElement(result)
    }

    /**
     * Get current recording status.
     */
    suspend fun getStatus(): RecordingStatusResult {
        val result: JsonElement = client.request(
            domain = Domains.RECORDING,
            method = "test/status",
        )

        return json.decodeFromJsonElement(result)
    }

    /**
     * Get video recording configuration.
     */
    suspend fun getVideoConfig(): VideoConfigResult {
        val result: JsonElement = client.request(
            domain = Domains.RECORDING,
            method = "video/config/get",
        )

        return json.decodeFromJsonElement(result)
    }

    /**
     * Set video recording configuration.
     */
    suspend fun setVideoConfig(config: VideoRecordingConfig): VideoConfigSetResult {
        val params = mapOf("config" to json.encodeToJsonElement(config))

        val result: JsonElement = client.request(
            domain = Domains.RECORDING,
            method = "video/config/set",
            params = json.encodeToJsonElement(params),
        )

        return json.decodeFromJsonElement(result)
    }
}

@Serializable
data class StartRecordingResult(
    val recordingId: String,
    val startedAt: Long,
    val deviceId: String,
    val platform: String,
)

@Serializable
data class StopRecordingResult(
    val recordingId: String,
    val startedAt: Long,
    val stoppedAt: Long,
    val deviceId: String,
    val platform: String,
    val planName: String? = null,
    val planContent: String? = null,
    val stepCount: Int = 0,
    val durationMs: Long = 0,
)

@Serializable
data class ActiveRecording(
    val recordingId: String,
    val startedAt: Long,
    val deviceId: String,
    val platform: String,
)

@Serializable
data class RecordingStatusResult(
    val recording: ActiveRecording? = null,
)

@Serializable
data class VideoRecordingConfig(
    val enabled: Boolean = true,
    val maxDurationSeconds: Int = 300,
    val maxFileSizeMb: Int = 100,
    val quality: String = "medium", // "low" | "medium" | "high"
    val fps: Int = 30,
    val retentionDays: Int = 7,
    val maxStorageMb: Int = 1000,
)

@Serializable
data class VideoConfigResult(
    val config: VideoRecordingConfig,
)

@Serializable
data class VideoConfigSetResult(
    val config: VideoRecordingConfig,
    val evictedRecordingIds: List<String>? = null,
)
