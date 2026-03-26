package dev.jasonpearson.automobile.desktop.core.unified

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement

/**
 * Typed client facade for storage observation.
 * Provides access to storage change events via the observation domain.
 *
 * Events:
 * - subscribeToChanges: Storage change events
 */
class StorageClient(private val client: UnifiedSocketClient) {
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Subscribe to storage change events.
     */
    fun subscribeToChanges(deviceId: String? = null): Flow<StorageUpdateEvent> {
        val params = buildMap<String, JsonElement> {
            deviceId?.let { put("deviceId", json.encodeToJsonElement(it)) }
        }

        return client.subscribe(
            domain = Domains.OBSERVATION,
            event = "storage_update",
            params = if (params.isEmpty()) null else json.encodeToJsonElement(params),
        ).map { message ->
            json.decodeFromJsonElement(message.result ?: throw IllegalStateException("No result in push"))
        }
    }
}
