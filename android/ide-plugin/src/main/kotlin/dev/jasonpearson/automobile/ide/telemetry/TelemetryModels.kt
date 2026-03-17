package dev.jasonpearson.automobile.ide.telemetry

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/**
 * Subscribe/unsubscribe/pong commands sent to the telemetry push socket server.
 */
@Serializable
data class TelemetryPushRequest(
    val id: String,
    val command: String,
    val category: String? = null,
    val deviceId: String? = null,
)

/**
 * Response envelope from the telemetry push socket server.
 */
@Serializable
data class TelemetryPushResponse(
    val id: String? = null,
    val type: String,
    val success: Boolean? = null,
    val error: String? = null,
    val timestamp: Long? = null,
    val data: TelemetryEventEnvelope? = null,
)

/**
 * Telemetry event as pushed from the server: category + timestamp + opaque data object.
 */
@Serializable
data class TelemetryEventEnvelope(
    val category: String,
    val timestamp: Long,
    val data: JsonObject,
)

/**
 * Parsed telemetry events for UI rendering, with category-specific fields extracted.
 */
sealed class TelemetryDisplayEvent {
    abstract val timestamp: Long

    data class Network(
        override val timestamp: Long,
        val method: String,
        val statusCode: Int,
        val url: String,
        val durationMs: Long,
        val host: String?,
        val path: String?,
        val error: String?,
    ) : TelemetryDisplayEvent()

    data class Log(
        override val timestamp: Long,
        val level: Int,
        val tag: String,
        val message: String,
    ) : TelemetryDisplayEvent()

    data class Custom(
        override val timestamp: Long,
        val name: String,
        val properties: Map<String, String>,
    ) : TelemetryDisplayEvent()

    data class Os(
        override val timestamp: Long,
        val category: String,
        val kind: String,
        val details: Map<String, String>?,
    ) : TelemetryDisplayEvent()
}

private val json = Json { ignoreUnknownKeys = true }

/**
 * Converts a [TelemetryEventEnvelope] into a typed [TelemetryDisplayEvent]
 * by extracting fields from the JSON data object based on category.
 */
fun parseTelemetryEvent(envelope: TelemetryEventEnvelope): TelemetryDisplayEvent? {
    val d = envelope.data
    return when (envelope.category) {
        "network" -> TelemetryDisplayEvent.Network(
            timestamp = envelope.timestamp,
            method = d.stringOrDefault("method", "?"),
            statusCode = d["statusCode"]?.jsonPrimitive?.intOrNull
                ?: d["status_code"]?.jsonPrimitive?.intOrNull ?: 0,
            url = d.stringOrDefault("url", ""),
            durationMs = d["durationMs"]?.jsonPrimitive?.longOrNull
                ?: d["duration_ms"]?.jsonPrimitive?.longOrNull ?: 0,
            host = d.stringOrNull("host"),
            path = d.stringOrNull("path"),
            error = d.stringOrNull("error"),
        )
        "log" -> TelemetryDisplayEvent.Log(
            timestamp = envelope.timestamp,
            level = d["level"]?.jsonPrimitive?.intOrNull ?: 4, // default INFO
            tag = d.stringOrDefault("tag", ""),
            message = d.stringOrDefault("message", ""),
        )
        "custom" -> {
            val props = mutableMapOf<String, String>()
            d["properties"]?.jsonObject?.forEach { (k, v) ->
                props[k] = v.jsonPrimitive.content
            }
            // Also check properties_json for serialized form
            val propsJson = d.stringOrNull("properties_json")
            if (props.isEmpty() && propsJson != null) {
                try {
                    val parsed = json.parseToJsonElement(propsJson).jsonObject
                    parsed.forEach { (k, v) -> props[k] = v.jsonPrimitive.content }
                } catch (_: Exception) { /* ignore parse failures */ }
            }
            TelemetryDisplayEvent.Custom(
                timestamp = envelope.timestamp,
                name = d.stringOrDefault("name", "unknown"),
                properties = props,
            )
        }
        "os" -> {
            val details = mutableMapOf<String, String>()
            d["details"]?.jsonObject?.forEach { (k, v) ->
                details[k] = v.jsonPrimitive.content
            }
            val detailsJson = d.stringOrNull("details_json")
            if (details.isEmpty() && detailsJson != null) {
                try {
                    val parsed = json.parseToJsonElement(detailsJson).jsonObject
                    parsed.forEach { (k, v) -> details[k] = v.jsonPrimitive.content }
                } catch (_: Exception) { /* ignore parse failures */ }
            }
            TelemetryDisplayEvent.Os(
                timestamp = envelope.timestamp,
                category = d.stringOrDefault("category", "unknown"),
                kind = d.stringOrDefault("kind", "unknown"),
                details = details.ifEmpty { null },
            )
        }
        else -> null
    }
}

private fun JsonObject.stringOrDefault(key: String, default: String): String =
    this[key]?.jsonPrimitive?.content ?: default

private fun JsonObject.stringOrNull(key: String): String? =
    this[key]?.jsonPrimitive?.content
